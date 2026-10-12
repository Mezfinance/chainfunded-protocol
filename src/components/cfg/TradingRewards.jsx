import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Gift, ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { getContract, prepareContractCall, readContract } from "thirdweb";
import { useSendTransaction, useSwitchActiveWalletChain } from "thirdweb/react";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const DISTRIBUTOR_ADDRESS = import.meta.env.VITE_CFG_DISTRIBUTOR_ADDRESS;

const fmtCfg = (wei) => {
  if (!wei) return "0";
  const n = Number(wei) / 1e18;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(1);
};

const fmtPts = (pts) => {
  if (!pts) return "0";
  const n = Number(pts);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
};

/**
 * Trading rewards tab — shows the user's points this season, estimated CFG,
 * claimable past seasons, and unregistered accounts that can earn CFG points.
 */
export default function TradingRewards({ season, isAuthenticated }) {
  const { address } = useAuth();
  const { mutateAsync: send } = useSendTransaction();
  const switchChain = useSwitchActiveWalletChain();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const [unregistered, setUnregistered] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const {
    activeSeason, traderTotalPoints, traderPoints, traderClaimable,
    traderPendingFinalize, seasonBudgetTrader, refetch,
  } = season;

  // Fetch user's challenge accounts and check which are unregistered for CFG
  const fetchUnregistered = useCallback(async () => {
    if (!address || !DISTRIBUTOR_ADDRESS || !isAuthenticated) return;
    setLoadingAccounts(true);
    try {
      const accounts = await base44.entities.ChallengeAccount.filter({ trader_address: address });
      const accs = (Array.isArray(accounts) ? accounts : []).filter(a => a.account_id);
      if (accs.length === 0) { setUnregistered([]); setLoadingAccounts(false); return; }

      const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });
      const checks = await Promise.all(
        accs.map(acc =>
          readContract({
            contract: dist,
            method: "function accountRecorded(string) view returns (bool)",
            params: [acc.account_id],
          }).then(recorded => ({ acc, recorded }))
            .catch(() => ({ acc, recorded: false }))
        )
      );
      setUnregistered(checks.filter(c => !c.recorded).map(c => c.acc));
    } catch {
      setUnregistered([]);
    }
    setLoadingAccounts(false);
  }, [address, isAuthenticated]);

  useEffect(() => { fetchUnregistered(); }, [fetchUnregistered]);

  // Estimate CFG at season end based on current share
  const estimatedCfg = traderPoints && traderTotalPoints && traderTotalPoints > 0n && seasonBudgetTrader
    ? (traderPoints * seasonBudgetTrader) / traderTotalPoints
    : null;

  const sharePercent = traderPoints && traderTotalPoints && traderTotalPoints > 0n
    ? ((Number(traderPoints) / Number(traderTotalPoints)) * 100).toFixed(1)
    : null;

  const handleClaim = async (seasonId) => {
    if (!DISTRIBUTOR_ADDRESS) return;
    setBusy(seasonId); setMsg("");
    try {
      await switchChain(chain);
      const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });
      await send(prepareContractCall({
        contract: dist,
        method: "function claim(uint256)",
        params: [BigInt(seasonId)],
      }));
      setMsg(`Season ${seasonId} claimed!`);
      refetch();
    } catch (e) {
      setMsg(e.message?.slice(0, 100) || "Claim failed");
    }
    setBusy(null);
  };

  // An ended season stays locked until someone calls the permissionless
  // finalizeSeason(). Send it, then claim, so the trader never gets stuck.
  const handleFinalizeAndClaim = async (seasonId) => {
    if (!DISTRIBUTOR_ADDRESS) return;
    const key = `finalize-${seasonId}`;
    setBusy(key); setMsg("");
    try {
      await switchChain(chain);
      const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });
      const finalized = await readContract({
        contract: dist,
        method: "function seasons(uint256) view returns (uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 totalPoints, bool finalized)",
        params: [BigInt(seasonId)],
      }).then(s => s[4]);
      if (!finalized) {
        await send(prepareContractCall({
          contract: dist,
          method: "function finalizeSeason(uint256)",
          params: [BigInt(seasonId)],
        }));
      }
      await send(prepareContractCall({
        contract: dist,
        method: "function claim(uint256)",
        params: [BigInt(seasonId)],
      }));
      setMsg(`Season ${seasonId} claimed!`);
      refetch();
    } catch (e) {
      setMsg(e.shortMessage || e.message?.slice(0, 100) || "Claim failed");
      refetch();
    }
    setBusy(null);
  };

  const handleRegister = async (accountId) => {
    if (!DISTRIBUTOR_ADDRESS) return;
    setBusy(accountId); setMsg("");
    try {
      await switchChain(chain);
      const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });
      await send(prepareContractCall({
        contract: dist,
        method: "function recordRegistration(string accountId, bool isWhitelist) returns (uint256)",
        params: [accountId, false],
      }));
      toast.success("Challenge registered for CFG rewards!");
      setUnregistered(prev => prev.filter(a => a.account_id !== accountId));
      refetch();
    } catch (e) {
      console.error("CFG registration failed:", e);
      setMsg(e.shortMessage || e.message?.slice(0, 150) || "Registration failed");
    }
    setBusy(null);
  };

  const handleRegisterAll = async () => {
    if (!DISTRIBUTOR_ADDRESS || unregistered.length === 0) return;
    setBusy("all"); setMsg("");
    try {
      await switchChain(chain);
      const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });
      let registered = 0;
      const registeredIds = [];
      for (const acc of unregistered) {
        try {
          await send(prepareContractCall({
            contract: dist,
            method: "function recordRegistration(string accountId, bool isWhitelist) returns (uint256)",
            params: [acc.account_id, false],
          }));
          registered++;
          registeredIds.push(acc.account_id);
        } catch (e) {
          console.warn(`Skipped ${acc.account_id}:`, e.shortMessage || e.message?.slice(0, 80));
        }
      }
      toast.success(`${registered} of ${unregistered.length} challenges registered!`);
      setMsg("");
      setUnregistered(prev => prev.filter(a => !registeredIds.includes(a.account_id)));
      refetch();
    } catch (e) {
      console.error("Register all failed:", e);
      setMsg(e.shortMessage || e.message?.slice(0, 150) || "Registration failed");
    }
    setBusy(null);
  };

  // Loading skeleton — matches the "This Season" card layout
  if (season.loading && isAuthenticated) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-display font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            This Season
          </h3>
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Your Points</div>
              <div className="h-7 w-20 bg-muted animate-pulse rounded" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Pool Share</div>
              <div className="h-7 w-16 bg-muted animate-pulse rounded" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Est. CFG at Season End</div>
              <div className="h-7 w-24 bg-muted animate-pulse rounded" />
              <div className="text-[10px] text-muted-foreground mt-1">Changes as more traders join</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state — no wallet connected
  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Connect your wallet to view trading rewards.</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state — no points earned and no unregistered accounts
  const hasPoints = traderPoints && traderPoints > 0n;
  const hasClaimable = traderClaimable && traderClaimable.length > 0;
  const hasUnregistered = unregistered.length > 0;
  const hasPendingFinalize = traderPendingFinalize && traderPendingFinalize.length > 0;

  if (!hasPoints && !hasClaimable && !hasUnregistered && !hasPendingFinalize) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12 space-y-3">
          <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No trading rewards yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Buy a challenge account to start earning CFG points. Every challenge purchase earns
            points proportional to the account size.
          </p>
          <Link to={createPageUrl("Onboarding")}>
            <Button size="sm" className="gap-1 mt-2">
              Start a Challenge <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ended seasons awaiting finalization — rewards are earned but locked */}
      {hasPendingFinalize && (
        <Card className="border-primary/40">
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              Season Rewards Ready
            </h3>
            <p className="text-xs text-muted-foreground">
              The season has ended. Claiming unlocks the season on-chain (anyone can do this once)
              and sends your CFG to your wallet. Your wallet may ask you to confirm two transactions.
            </p>
            <div className="space-y-2">
              {traderPendingFinalize.map(({ seasonId, cfgAmount }) => (
                <div
                  key={seasonId}
                  className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5"
                >
                  <div>
                    <div className="text-sm font-medium">Season {seasonId}</div>
                    <div className="text-xs text-muted-foreground">{fmtCfg(cfgAmount)} CFG</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === `finalize-${seasonId}`}
                    onClick={() => handleFinalizeAndClaim(seasonId)}
                  >
                    {busy === `finalize-${seasonId}` ? "..." : "Claim"}
                  </Button>
                </div>
              ))}
            </div>
            {msg && !hasUnregistered && !hasClaimable && <p className="text-xs text-muted-foreground">{msg}</p>}
          </CardContent>
        </Card>
      )}

      {/* Unregistered accounts */}
      {hasUnregistered && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Register for CFG Rewards
            </h3>
            <p className="text-xs text-muted-foreground">
              These challenge accounts haven't been registered for CFG season points yet. Register them to start earning.
            </p>
            {unregistered.length > 1 && (
              <Button
                size="sm"
                className="w-full"
                disabled={busy === "all"}
                onClick={handleRegisterAll}
              >
                {busy === "all" ? "Registering..." : `Register All (${unregistered.length})`}
              </Button>
            )}
            <div className="space-y-2">
              {unregistered.map((acc) => (
                <div
                  key={acc.account_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5"
                >
                  <div>
                    <div className="text-sm font-medium">
                      ${acc.account_size?.toLocaleString()} Account
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {(acc.account_id || acc.id)?.slice(0, 8)}…
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === acc.account_id}
                    onClick={() => handleRegister(acc.account_id)}
                  >
                    {busy === acc.account_id ? "..." : "Register"}
                  </Button>
                </div>
              ))}
            </div>
            {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          </CardContent>
        </Card>
      )}

      {/* Current season points */}
      {activeSeason > 0 && (hasPoints || hasClaimable) && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-display font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              This Season
            </h3>
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Your Points</div>
                <div className="font-display font-bold text-xl">{fmtPts(traderPoints)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Pool Share</div>
                <div className="font-display font-bold text-xl text-primary">
                  {sharePercent ? `${sharePercent}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Est. CFG at Season End</div>
                <div className="font-display font-bold text-xl">
                  {estimatedCfg ? `~${fmtCfg(estimatedCfg)}` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">Changes as more traders join</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claimable past seasons */}
      {hasClaimable && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              Claimable Rewards
            </h3>
            <div className="space-y-2">
              {traderClaimable.map(({ seasonId, cfgAmount }) => (
                <div
                  key={seasonId}
                  className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5"
                >
                  <div>
                    <div className="text-sm font-medium">Season {seasonId}</div>
                    <div className="text-xs text-muted-foreground">{fmtCfg(cfgAmount)} CFG</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === seasonId}
                    onClick={() => handleClaim(seasonId)}
                  >
                    {busy === seasonId ? "..." : "Claim"}
                  </Button>
                </div>
              ))}
            </div>
            {msg && !hasUnregistered && <p className="text-xs text-muted-foreground">{msg}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
