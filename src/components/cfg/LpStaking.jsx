import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, ArrowRight, Coins, DollarSign, Wallet, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getContract, prepareContractCall } from "thirdweb";
import { useSendTransaction, useSwitchActiveWalletChain } from "thirdweb/react";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { useChainFundedPool } from "@/hooks/useChainFundedPool";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const LP_REWARDS_ADDRESS = import.meta.env.VITE_CFG_LP_REWARDS_ADDRESS;

const fmtCfg = (wei) => {
  if (!wei) return "0";
  const n = Number(wei) / 1e18;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (n < 0.01) return "<0.01";
  return n.toFixed(2);
};

const fmtUsdc = (wei) => {
  if (!wei) return "$0";
  const n = Number(wei) / 1e6;
  return "$" + n.toFixed(2);
};

/**
 * LP staking tab — stake/unstake CFND, claim CFG and USDC rewards.
 */
export default function LpStaking({ season, isAuthenticated }) {
  const { address } = useAuth();
  const pool = useChainFundedPool(address);
  const { mutateAsync: send } = useSendTransaction();
  const switchChain = useSwitchActiveWalletChain();
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [justClaimedCfg, setJustClaimedCfg] = useState(false);
  const [justClaimedUsdc, setJustClaimedUsdc] = useState(false);
  const [claimedCfgValue, setClaimedCfgValue] = useState(null);
  const [claimedUsdcValue, setClaimedUsdcValue] = useState(null);

  const { userStaked, earnedCfg, earnedUsdc, totalStaked, rewardRate, pendingUsdcHarvest, refetch } = season;

  // Reset optimistic flags only when on-chain value drops below the pre-claim
  // amount — this confirms the claim tx was actually mined. Ignore stale reads
  // where the node returns the old (pre-claim) value.
  useEffect(() => {
    if (justClaimedCfg && claimedCfgValue != null && earnedCfg != null && earnedCfg < claimedCfgValue) {
      setJustClaimedCfg(false);
    }
  }, [earnedCfg, justClaimedCfg, claimedCfgValue]);
  useEffect(() => {
    if (justClaimedUsdc && claimedUsdcValue != null && earnedUsdc != null && earnedUsdc < claimedUsdcValue) {
      setJustClaimedUsdc(false);
    }
  }, [earnedUsdc, justClaimedUsdc, claimedUsdcValue]);

  // ── Client-side interpolation for CFG earned ──────────────────────────
  // Between polls, tick up the displayed value based on the user's per-second rate.
  // Frozen while justClaimedCfg is true to prevent stale data from flickering.
  const [extraCfg, setExtraCfg] = useState(0n);
  const lastPollRef = useRef(Date.now());
  const perSecondCfg = userStaked && totalStaked && totalStaked > 0n && rewardRate
    ? (rewardRate * userStaked) / totalStaked
    : 0n;

  // Reset interpolation offset when on-chain value updates (and not mid-claim)
  useEffect(() => {
    if (!justClaimedCfg) {
      setExtraCfg(0n);
      lastPollRef.current = Date.now();
    }
  }, [earnedCfg, justClaimedCfg]);

  // Tick up every second — paused during claim
  useEffect(() => {
    if (perSecondCfg === 0n || justClaimedCfg) return;
    const tick = setInterval(() => {
      const secs = BigInt(Math.floor((Date.now() - lastPollRef.current) / 1000));
      setExtraCfg(secs * perSecondCfg);
    }, 1000);
    return () => clearInterval(tick);
  }, [perSecondCfg, justClaimedCfg]);

  const liveCfg = justClaimedCfg ? null : (earnedCfg ?? 0n) + extraCfg;

  // USDC: earned (already harvested) + user's share of unharvested pool profit
  const userPendingHarvest = pendingUsdcHarvest && userStaked && totalStaked && totalStaked > 0n
    ? (pendingUsdcHarvest * userStaked) / totalStaked
    : 0n;
  const liveUsdc = justClaimedUsdc ? null : (earnedUsdc ?? 0n) + userPendingHarvest;

  // Available CFND to stake (in wallet, not yet staked)
  const cfndBalance = pool.userCfndBalance;
  const cfndBalanceRaw = cfndBalance ? BigInt(Math.round(cfndBalance * 1e6)) : 0n;
  const stakedDisplay = userStaked ? (Number(userStaked) / 1e6).toFixed(2) : "0";

  const doStake = async () => {
    if (!LP_REWARDS_ADDRESS || !stakeAmount) return;
    setBusy("stake");
    try {
      await switchChain(chain);
      const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });
      const amount = BigInt(Math.round(parseFloat(stakeAmount) * 1e6));
      await send(prepareContractCall({
        contract: lp,
        method: "function stake(uint256)",
        params: [amount],
      }));
      toast.success("CFND staked successfully"); setStakeAmount(""); refetch(); pool.refetch();
    } catch (e) { toast.error("Stake failed", { description: e.message?.slice(0, 100) }); }
    setBusy("");
  };

  const doUnstake = async () => {
    if (!LP_REWARDS_ADDRESS || !unstakeAmount) return;
    setBusy("unstake");
    try {
      await switchChain(chain);
      const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });
      const amount = BigInt(Math.round(parseFloat(unstakeAmount) * 1e6));
      const stakedRaw = userStaked ?? 0n;

      // Full unstake → use exit() which claims CFG + USDC first,
      // preventing rewards from being stuck when totalStaked hits 0.
      if (amount >= stakedRaw) {
        await send(prepareContractCall({
          contract: lp,
          method: "function exit()",
        }));
        toast.success("CFND unstaked and rewards claimed");
      } else {
        await send(prepareContractCall({
          contract: lp,
          method: "function unstake(uint256)",
          params: [amount],
        }));
        toast.success("CFND unstaked successfully");
      }
      setUnstakeAmount(""); refetch(); pool.refetch();
    } catch (e) { toast.error("Unstake failed", { description: e.message?.slice(0, 100) }); }
    setBusy("");
  };

  const doClaimCfg = async () => {
    if (!LP_REWARDS_ADDRESS) return;
    setBusy("claimCfg");
    try {
      await switchChain(chain);
      const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });
      await send(prepareContractCall({
        contract: lp,
        method: "function claimCfgReward()",
      }));
      toast.success("CFG claimed successfully"); setClaimedCfgValue(earnedCfg); setJustClaimedCfg(true); refetch();
    } catch (e) { toast.error("CFG claim failed", { description: e.message?.slice(0, 100) }); }
    setBusy("");
  };

  const doClaimUsdc = async () => {
    if (!LP_REWARDS_ADDRESS) return;
    setBusy("claimUsdc");
    try {
      await switchChain(chain);
      const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });
      await send(prepareContractCall({
        contract: lp,
        method: "function claimUsdcProfit()",
      }));
      toast.success("USDC claimed successfully"); setClaimedUsdcValue(earnedUsdc); setJustClaimedUsdc(true); refetch();
    } catch (e) { toast.error("USDC claim failed", { description: e.message?.slice(0, 100) }); }
    setBusy("");
  };

  // Loading skeleton — matches the Staking Position card layout
  if (season.loading && isAuthenticated) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-display font-bold flex items-center gap-2">
            <Droplets className="w-4 h-4 text-primary" />
            Staking Position
          </h3>
          <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
            {["Staked CFND", "CFG Earned", "USDC Profit", "CFG Balance"].map((label) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="h-7 w-20 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state — no wallet
  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <Droplets className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Connect your wallet to stake CFND and earn CFG.</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state — no CFND and nothing staked
  const hasStaked = userStaked && userStaked > 0n;
  const hasCfnd = cfndBalance && cfndBalance > 0;

  if (!hasStaked && !hasCfnd) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12 space-y-3">
          <Droplets className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No CFND to stake</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Deposit USDC into the LP pool to receive CFND tokens, then stake them here to earn CFG
            governance tokens.
          </p>
          <Link to={createPageUrl("LPDashboard")}>
            <Button size="sm" className="gap-1 mt-2">
              Go to LP Pool <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rewards overview */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-display font-bold flex items-center gap-2">
            <Droplets className="w-4 h-4 text-primary" />
            Staking Position
          </h3>
          <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Staked CFND</div>
              <div className="font-display font-bold text-xl">{stakedDisplay}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Coins className="w-3 h-3" /> CFG Earned
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-xl">{liveCfg === null ? "0" : fmtCfg(liveCfg)}</span>
                {liveCfg !== null && liveCfg > 0n && (
                  <Button size="sm" variant="outline" disabled={busy === "claimCfg"} onClick={doClaimCfg}>
                    {busy === "claimCfg" ? "..." : "Claim"}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> USDC Profit
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-xl">{liveUsdc === null ? "$0" : fmtUsdc(liveUsdc)}</span>
                {liveUsdc !== null && liveUsdc > 0n && (
                  <Button size="sm" variant="outline" disabled={busy === "claimUsdc"} onClick={doClaimUsdc}>
                    {busy === "claimUsdc" ? "..." : "Claim"}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Wallet className="w-3 h-3" /> CFG Balance
              </div>
              <div className="font-display font-bold text-xl">
                {fmtCfg(season.cfgBalance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emission rate info */}
      {rewardRate && rewardRate > 0n && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Season Emission Rate</div>
                <div className="font-display font-bold text-sm text-primary">
                  {fmtCfg(rewardRate * 86400n)} CFG/day
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Split among all stakers
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Your Share</div>
                <div className="font-display font-bold text-sm">
                  {userStaked && totalStaked && totalStaked > 0n
                    ? ((Number(userStaked) / Number(totalStaked)) * 100).toFixed(1) + "%"
                    : "0%"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  of {totalStaked ? (Number(totalStaked) / 1e6).toLocaleString() : "0"} total staked
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Your Est. Daily Earnings</div>
                <div className="font-display font-bold text-sm text-primary">
                  {userStaked && totalStaked && totalStaked > 0n
                    ? fmtCfg((rewardRate * 86400n * userStaked) / totalStaked)
                    : "0"} CFG/day
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Changes as stakers join/leave
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not staking yet — show what you could earn */}
      {!hasStaked && hasCfnd && rewardRate && rewardRate > 0n && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-foreground font-medium mb-1">Stake to start earning CFG</p>
          <p className="text-xs text-muted-foreground">
            The pool is currently emitting <span className="text-primary font-medium">{fmtCfg(rewardRate * 86400n)} CFG per day</span> to
            stakers. Stake your {cfndBalance?.toFixed(0)} CFND to start earning your share.
          </p>
        </div>
      )}

      {/* Stake / Unstake controls */}
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {/* Stake */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h4 className="text-sm font-bold">Stake CFND</h4>
            <p className="text-xs text-muted-foreground">
              Available: {cfndBalance?.toFixed(2) || "0"} CFND
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
                placeholder="Amount"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStakeAmount(cfndBalance?.toString() || "")}
              >
                Max
              </Button>
            </div>
            <div className="flex gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span>Staking will claim any pending LP profit. Your staked CFND continues to earn USDC from the LP pool while staked.</span>
            </div>
            <Button
              className="w-full"
              disabled={busy === "stake" || !stakeAmount || parseFloat(stakeAmount) <= 0}
              onClick={doStake}
            >
              {busy === "stake" ? "Staking..." : "Stake"}
            </Button>
          </CardContent>
        </Card>

        {/* Unstake */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h4 className="text-sm font-bold">Unstake CFND</h4>
            <p className="text-xs text-muted-foreground">
              Staked: {stakedDisplay} CFND
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
                placeholder="Amount"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnstakeAmount(userStaked ? (Number(userStaked) / 1e6).toString() : "")}
              >
                Max
              </Button>
            </div>
            <div className="flex gap-2 p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
              <span>Partial unstakes do not auto-claim rewards — claim them first using the buttons above. Full unstakes automatically claim all USDC and CFG rewards.</span>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy === "unstake" || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !hasStaked}
              onClick={doUnstake}
            >
              {busy === "unstake" ? "Unstaking..." : "Unstake"}
            </Button>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
