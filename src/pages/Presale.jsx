/**
 * Presale — self-hosted $CFG presale purchase page.
 *
 * Live tier/step-pricing readout, an approve→buy flow against CFGPresale.sol,
 * and a post-TGE claim panel. Buyers can fund with any token/chain via
 * thirdweb Pay (swaps to USDC) before buying.
 *
 * Settlement is USDC on Ethereum mainnet; the contract is the source of truth
 * for fills (client-side `quote()` is display-only).
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { useSendTransaction, useConnectModal, useSwitchActiveWalletChain, PayEmbed } from "thirdweb/react";
import { getContract, readContract, prepareContractCall, waitForReceipt } from "thirdweb";
import { approve } from "thirdweb/extensions/erc20";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import { PRESALE, tierPrice, tierIndexFromSold, quote } from "@/config/presale";
import { usePresaleEvents } from "@/hooks/usePresaleEvents";
import { trackConversion } from "@/lib/xpixel";

const HARD_CAP_USD = 1_000_000;
const fmt = (n, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d });

function friendlyError(m) {
  if (/underfunded/i.test(m)) return "The presale isn't funded yet — please try again shortly.";
  if (/slippage/i.test(m)) return "Price moved past your 1% limit. Refresh the quote and try again.";
  if (/exceeds max/i.test(m)) return "That would exceed the $10,000 per-wallet cap.";
  if (/below min/i.test(m)) return "Minimum buy is $10.";
  if (/sold out/i.test(m)) return "This tier just sold out — refresh and retry.";
  if (/sale closed|finalized/i.test(m)) return "The presale has closed.";
  if (/paused/i.test(m)) return "The presale is paused right now.";
  if (/insufficient|allowance|balance/i.test(m)) return "Insufficient USDC balance or approval.";
  if (/user rejected|denied/i.test(m)) return "Transaction rejected in your wallet.";
  return m.length > 140 ? "Purchase failed. Please try again." : m;
}

const TOKENOMICS = {
  sub: "Fixed supply: 100,000,000 $CFG — no inflation, ever.",
  center: ["100M", "$CFG"],
  gradient:
    "conic-gradient(#1a9e4a 0 43.5%, #22c55e 43.5% 63.5%, #2ee06f 63.5% 78.5%, #16a34a 78.5% 88.5%, #4ade80 88.5% 93.5%, #ffffff 93.5% 96%, #15803d 96% 98%, #86efac 98% 100%)",
  rows: [
    { c: "#1a9e4a", l: "Community Treasury", p: "43.5%" },
    { c: "#22c55e", l: "Team & Founders", p: "20%" },
    { c: "#2ee06f", l: "Ecosystem Incentives", p: "15%" },
    { c: "#16a34a", l: "Protocol Emissions", p: "10%" },
    { c: "#4ade80", l: "Airdrop Reserve", p: "5%" },
    { c: "#ffffff", l: "Public Presale", p: "2.5%", hl: true },
    { c: "#15803d", l: "Advisors", p: "2%" },
    { c: "#86efac", l: "Strategic Investors", p: "2%" },
  ],
};

const USE_OF_FUNDS = {
  sub: "How the USDC raised is deployed.",
  center: ["Net", "PROCEEDS"],
  gradient: "conic-gradient(#1a9e4a 0 40%, #22c55e 40% 65%, #15803d 65% 90%, #86efac 90% 100%)",
  rows: [
    { c: "#1a9e4a", l: "Liquidity (LP) pool", p: "40%", hl: true },
    { c: "#22c55e", l: "DEX liquidity (locked)", p: "25%" },
    { c: "#15803d", l: "Operations", p: "25%" },
    { c: "#86efac", l: "Audit, legal & listing", p: "10%" },
  ],
};

export default function Presale() {
  const { address, isAuthenticated } = useAuth();
  const { connect } = useConnectModal();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const switchChain = useSwitchActiveWalletChain();

  const [stats, setStats] = useState({ soldCfg: 0, raisedUsd: 0, buyers: 0, tgeTime: 0, paused: false, finalized: false, loading: true });
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("idle"); // idle | approving | buying | done | error
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [payMode, setPayMode] = useState("usdc"); // "usdc" | "card"
  const [releasable, setReleasable] = useState(0);
  const [myContributed, setMyContributed] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const { buys } = usePresaleEvents();

  const configured = !!PRESALE.presaleAddress;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

  // ── Reads ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!configured) { setStats((s) => ({ ...s, loading: false })); return; }
    try {
      const c = getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress });
      const [sold, raised, buyers, tge, paused, finalized] = await Promise.all([
        readContract({ contract: c, method: "function totalSold() view returns (uint256)" }),
        readContract({ contract: c, method: "function totalRaised() view returns (uint256)" }),
        readContract({ contract: c, method: "function buyerCount() view returns (uint256)" }),
        readContract({ contract: c, method: "function tgeTime() view returns (uint256)" }),
        readContract({ contract: c, method: "function paused() view returns (bool)" }),
        readContract({ contract: c, method: "function finalized() view returns (bool)" }),
      ]);
      setStats({
        soldCfg: Number(sold) / 1e18,
        raisedUsd: Number(raised) / 1e6,
        buyers: Number(buyers),
        tgeTime: Number(tge),
        paused,
        finalized,
        loading: false,
      });
    } catch (e) {
      setStats((s) => ({ ...s, loading: false }));
    }
  }, [configured]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  // releasable (post-TGE)
  useEffect(() => {
    (async () => {
      if (!configured || !address || !stats.tgeTime) return;
      try {
        const c = getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress });
        const r = await readContract({ contract: c, method: "function releasable(address) view returns (uint256)", params: [address] });
        setReleasable(Number(r) / 1e18);
      } catch { /* ignore */ }
    })();
  }, [configured, address, stats.tgeTime, status, claiming]);

  // per-wallet contributed → cumulative max-buy clamp (pre-clamp, audit note)
  useEffect(() => {
    (async () => {
      if (!configured || !address) { setMyContributed(0); return; }
      try {
        const c = getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress });
        const v = await readContract({ contract: c, method: "function contributed(address) view returns (uint256)", params: [address] });
        setMyContributed(Number(v) / 1e6);
      } catch { /* ignore */ }
    })();
  }, [configured, address, status]);

  // USDC balance → show it, clamp Max, and warn before a doomed approve
  useEffect(() => {
    (async () => {
      if (!configured || !address || !PRESALE.usdc) { setUsdcBalance(null); return; }
      try {
        const c = getContract({ client: thirdwebClient, chain, address: PRESALE.usdc });
        const b = await readContract({ contract: c, method: "function balanceOf(address) view returns (uint256)", params: [address] });
        setUsdcBalance(Number(b) / 1e6);
      } catch { setUsdcBalance(null); }
    })();
  }, [configured, address, status]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const tier = tierIndexFromSold(stats.soldCfg);
  const price = tierPrice(tier);
  const tierEndCfg = (tier + 1) * PRESALE.tierAllocation;
  const cfgLeftInTier = Math.max(0, tierEndCfg - stats.soldCfg);
  const usdToNextTier = cfgLeftInTier * price;
  const isFinalTier = tier + 1 >= PRESALE.tierCount;
  const nextPrice = isFinalTier ? PRESALE.listingPrice : tierPrice(tier + 1);
  const soldInTier = stats.soldCfg - tier * PRESALE.tierAllocation;
  const tierPct = Math.min(100, Math.max(0, (soldInTier / PRESALE.tierAllocation) * 100));
  const pctSold = Math.min(100, (stats.soldCfg / PRESALE.totalAllocation) * 100);
  const amt = parseFloat(amount) || 0;
  const q = amt > 0 ? quote(amt, stats.soldCfg) : { cfgOut: 0, usdSpent: 0 };
  const remainingCap = Math.max(0, PRESALE.maxBuyUsd - myContributed);
  const maxBuyable = usdcBalance != null ? Math.min(remainingCap, usdcBalance) : remainingCap;
  const tooLow = amt > 0 && amt < PRESALE.minBuyUsd;
  const tooHigh = amt > remainingCap;
  const notEnough = usdcBalance != null && amt > usdcBalance;

  // ── Buy ──────────────────────────────────────────────────────────────────
  const handleBuy = async () => {
    setError(""); setTxHash("");
    if (!address) return;
    if (amt < PRESALE.minBuyUsd || amt > remainingCap) { setError(`Buy between $${PRESALE.minBuyUsd} and $${fmt(remainingCap)} (per-wallet cap).`); return; }
    const usdcRaw = BigInt(Math.round(amt * 1e6));
    try {
      await switchChain(chain);
      setStatus("approving");
      const usdc = getContract({ client: thirdwebClient, chain, address: PRESALE.usdc });
      const a = await sendTransaction(approve({ contract: usdc, spender: PRESALE.presaleAddress, amount: amt }));
      await waitForReceipt({ client: thirdwebClient, chain, transactionHash: a.transactionHash });

      setStatus("buying");
      const presale = getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress });
      // 1% slippage floor in case tiers advance between quote and inclusion
      const minCfg = q.cfgOut > 0 ? BigInt(Math.floor(q.cfgOut * 0.99)) * (10n ** 18n) : 0n;
      const r = await sendTransaction(prepareContractCall({
        contract: presale,
        method: "function buy(uint256 amount, uint256 minCfgOut)",
        params: [usdcRaw, minCfg],
      }));
      setTxHash(r.transactionHash);
      setStatus("done");
      refresh();
      trackConversion("presale_buy", { value: amt, currency: "USD", conversion_id: r.transactionHash });
    } catch (err) {
      console.error("Buy failed:", err);
      setError(friendlyError(err?.message || ""));
      setStatus("error");
    }
  };

  const handleClaim = async () => {
    setError(""); setTxHash("");
    try {
      await switchChain(chain);
      setClaiming(true);
      const presale = getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress });
      const r = await sendTransaction(prepareContractCall({ contract: presale, method: "function claim()", params: [] }));
      setTxHash(r.transactionHash);
      setReleasable(0);
    } catch (err) {
      setError(friendlyError(err?.message || "Claim failed."));
    } finally {
      setClaiming(false);
    }
  };

  const busy = status === "approving" || status === "buying";
  const explorer = chain.blockExplorers?.[0]?.url || "https://etherscan.io";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero */}
      <div className="text-center pt-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold tracking-widest text-primary mb-4">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> $CFG PRESALE · LIVE
        </div>
        <h1 className="font-grotesk text-3xl sm:text-5xl font-bold tracking-tight">
          The <span className="text-primary">$CFG</span> presale is live.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          Governance for a real, working on-chain prop firm. In now at{" "}
          <span className="text-foreground font-semibold">${price.toFixed(2)}</span> — the price steps up every
          tier and lists on DEX at <span className="text-foreground font-semibold">${PRESALE.listingPrice.toFixed(2)}</span>.
        </p>
        {configured && (
          <a href={`${explorer}/address/${PRESALE.presaleAddress}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-xs font-mono text-muted-foreground hover:text-primary transition-colors">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Contract {short(PRESALE.presaleAddress)} ↗
          </a>
        )}
      </div>

      {/* Two-column: buy is sticky on the right (desktop) / first (mobile) */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ── LEFT column ── */}
        <div className="order-2 lg:order-1 space-y-6">

      {/* Price ladder */}
      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-base">Price ladder — it only goes up</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: PRESALE.tierCount }).map((_, i) => {
              const st = i < tier ? "done" : i === tier ? "cur" : "next";
              return (
                <span key={i} className={"px-2 py-1 rounded-md text-xs font-semibold tabular-nums " + (
                  st === "cur" ? "bg-primary text-primary-foreground"
                  : st === "done" ? "bg-secondary text-muted-foreground/50 line-through"
                  : "border border-border text-muted-foreground")}>${tierPrice(i).toFixed(2)}</span>
              );
            })}
            <span className="px-2 py-1 rounded-md text-xs font-semibold tabular-nums border border-primary/40 text-primary">🔓 ${PRESALE.listingPrice.toFixed(2)} listing</span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Steps up one price every {fmt(PRESALE.tierAllocation)} CFG sold — you're in tier {tier + 1} of {PRESALE.tierCount} at ${price.toFixed(2)}.</p>
        </CardContent>
      </Card>

      {/* Live stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Current price" value={`$${price.toFixed(2)}`} sub={`Tier ${tier + 1} / ${PRESALE.tierCount}`} />
        <Stat
          label="Next price"
          value={isFinalTier ? `$${PRESALE.listingPrice.toFixed(2)}` : `$${tierPrice(tier + 1).toFixed(2)}`}
          sub={isFinalTier ? "DEX listing" : `in $${fmt(usdToNextTier)}`}
        />
        <Stat label="Raised" value={`$${fmt(stats.raisedUsd)}`} sub={`of $${fmt(HARD_CAP_USD)}`} />
        {stats.buyers >= 10
          ? <Stat label="Backers" value={fmt(stats.buyers)} sub="wallets" />
          : <Stat label="Backers" value="Early" sub="be one of the first" />}
      </div>

      {/* Progress */}
      <div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden border border-border">
          <div className="h-full bg-primary glow-green-sm transition-all" style={{ width: `${pctSold}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span>{fmt(stats.soldCfg)} / {fmt(PRESALE.totalAllocation)} CFG sold</span>
          <span>{pctSold.toFixed(1)}% sold</span>
        </div>
      </div>

        </div>{/* /LEFT */}

        {/* ── RIGHT column: sticky buy ── */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-4 space-y-3">
      <Card className="border-primary/30">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between"><span>Buy $CFG</span><span className="text-xs font-normal text-muted-foreground">Tier {tier + 1} · ${price.toFixed(2)}</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!configured ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 text-primary shrink-0" /> Presale contract is being deployed — purchasing opens shortly.
            </div>
          ) : status === "done" ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
              <p className="text-primary font-semibold">Success — $CFG is yours.</p>
              <p className="text-sm text-muted-foreground">Claim opens at TGE (10% at TGE, then linear over 12 months).</p>
              {txHash && <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline font-mono block">{txHash.slice(0, 22)}… ↗</a>}
              <Button variant="outline" size="sm" onClick={() => { setStatus("idle"); setAmount(""); }}>Buy more</Button>
            </div>
          ) : stats.finalized ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-border text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 shrink-0" /> The presale has closed. {stats.tgeTime ? "Claim your $CFG below." : "Claiming opens at TGE."}
            </div>
          ) : (PRESALE.totalAllocation - stats.soldCfg) < 1 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-border text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Sold out — all 2,500,000 CFG allocated. DEX listing incoming.
            </div>
          ) : stats.paused ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-border text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 shrink-0" /> The presale is paused — check back shortly.
            </div>
          ) : !isAuthenticated ? (
            <div className="space-y-2">
              <Button className="w-full bg-primary text-primary-foreground" onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}>
                Connect or sign in to buy
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">No wallet? Sign in with email — pay by card, no crypto needed.</p>
            </div>
          ) : (
            <>
              {!isFinalTier && (
                <div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${tierPct}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    <span className="text-foreground font-medium">{fmt(cfgLeftInTier)} CFG</span> left at ${price.toFixed(2)} — then ${nextPrice.toFixed(2)}
                  </p>
                </div>
              )}

              {/* Amount (shared across pay methods) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-muted-foreground">Amount (USDC) · min ${PRESALE.minBuyUsd}</label>
                  <div className="flex items-center gap-2">
                    {payMode === "usdc" && usdcBalance != null && (
                      <span className="text-xs text-muted-foreground">Bal ${fmt(usdcBalance, 2)}</span>
                    )}
                    <button type="button" className="text-xs font-medium text-primary hover:underline disabled:opacity-40"
                      disabled={busy || (payMode === "usdc" ? maxBuyable : remainingCap) <= 0}
                      onClick={() => setAmount(String(Math.floor(payMode === "usdc" ? maxBuyable : remainingCap)))}>
                      Max
                    </button>
                  </div>
                </div>
                <input
                  type="number" placeholder="e.g. 250" value={amount} disabled={busy}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-1.5 mt-2">
                  {[100, 500, 1000].map((v) => (
                    <button key={v} type="button" disabled={busy || v > remainingCap}
                      onClick={() => setAmount(String(v))}
                      className="flex-1 text-xs py-1.5 rounded-md border border-border hover:border-primary/60 hover:text-primary disabled:opacity-30 transition-colors">
                      ${fmt(v)}
                    </button>
                  ))}
                </div>
                {amt > 0 && (
                  <p className="text-xs mt-1.5 text-muted-foreground">
                    You receive ≈ <span className="text-primary font-semibold">{fmt(q.cfgOut)} CFG</span>
                    {q.usdSpent < amt - 0.01 && <span className="text-yellow-400"> (sells out at {fmt(q.usdSpent, 2)} USDC — rest stays in your wallet)</span>}
                  </p>
                )}
                {tooLow && <p className="text-xs mt-1 text-red-400">Minimum is ${PRESALE.minBuyUsd}.</p>}
                {tooHigh && <p className="text-xs mt-1 text-red-400">You can buy ${fmt(remainingCap)} more (per-wallet cap is ${fmt(PRESALE.maxBuyUsd)}).</p>}
              </div>

              {/* Pay method */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-secondary/60 border border-border text-xs font-medium">
                <button type="button" onClick={() => setPayMode("usdc")}
                  className={`py-1.5 rounded-md transition-colors ${payMode === "usdc" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  Pay with USDC
                </button>
                <button type="button" onClick={() => setPayMode("card")}
                  className={`py-1.5 rounded-md transition-colors ${payMode === "card" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  Card / any token
                </button>
              </div>

              {payMode === "card" ? (
                amt >= PRESALE.minBuyUsd && amt <= remainingCap && q.cfgOut > 0 ? (
                  <div className="space-y-2">
                    <PayEmbed
                      client={thirdwebClient}
                      theme="dark"
                      payOptions={{
                        mode: "transaction",
                        metadata: { name: `Buy ${fmt(q.cfgOut)} $CFG` },
                        transaction: prepareContractCall({
                          contract: getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress }),
                          method: "function buy(uint256 amount, uint256 minCfgOut)",
                          params: [
                            BigInt(Math.round(amt * 1e6)),
                            q.cfgOut > 0 ? BigInt(Math.floor(q.cfgOut * 0.99)) * (10n ** 18n) : 0n,
                          ],
                          erc20Value: { amountWei: BigInt(Math.round(amt * 1e6)), tokenAddress: PRESALE.usdc },
                        }),
                        onPurchaseSuccess: (info) => {
                          setTxHash(info?.transactionHash || info?.data?.transactionHash || "");
                          setStatus("done");
                          refresh();
                          trackConversion("presale_buy", { value: amt, currency: "USD" });
                        },
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground text-center">
                      Pay by card or any token — your ${fmt(amt)} of $CFG is bought in one step. Card via Transak (KYC · minimums apply). Settles in USDC on Ethereum.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">Enter an amount above (min ${PRESALE.minBuyUsd}) to pay by card or another token.</p>
                )
              ) : (
                <>
                  {busy && (
                    <div className="space-y-1.5 text-sm">
                      <div className={`flex items-center gap-2 ${status === "approving" ? "text-primary" : "text-muted-foreground"}`}>
                        {status === "approving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />} Step 1: Approve USDC
                      </div>
                      <div className={`flex items-center gap-2 ${status === "buying" ? "text-primary" : "text-muted-foreground/40"}`}>
                        {status === "buying" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />} Step 2: Buy $CFG
                      </div>
                    </div>
                  )}
                  {notEnough && !tooHigh && !tooLow && amt > 0 && (
                    <p className="text-xs text-red-400">Not enough USDC (balance ${fmt(usdcBalance, 2)}) — switch to <span className="font-medium">Card / any token</span> above.</p>
                  )}
                  <Button className="w-full bg-primary text-primary-foreground" disabled={busy || !amt || tooLow || tooHigh || notEnough} onClick={handleBuy}>
                    {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</> : `Buy $CFG at $${price.toFixed(2)}`}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">🛡️ 1% slippage protection · settles in USDC on Ethereum</p>
                </>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" /> <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* social proof + trust under the CTA */}
      <div className="text-center text-[11px] text-muted-foreground leading-relaxed">
        <span className="text-primary">●</span>{" "}
        {stats.buyers > 0
          ? `${fmt(stats.buyers)} backer${stats.buyers === 1 ? "" : "s"} · $${fmt(stats.raisedUsd)} raised`
          : "Be the first backer"}
        <br />Non-custodial · vesting 10% at TGE, then 12-mo linear · USDC on Ethereum
      </div>

        </div>{/* /RIGHT */}
      </div>{/* /grid */}

      {/* Claim — shown once TGE is scheduled */}
      {stats.tgeTime > 0 && (
      <Card className="border-border">
        <CardHeader><CardTitle className="text-base">Claim</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-grotesk font-bold text-primary">{fmt(releasable)} <span className="text-sm font-normal text-muted-foreground">CFG claimable</span></p>
          <p className="text-xs text-muted-foreground">10% unlocked at TGE, the rest vesting linearly over 12 months.</p>
          <Button className="w-full bg-primary text-primary-foreground" disabled={claiming || releasable <= 0 || !isAuthenticated} onClick={handleClaim}>
            {claiming ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</> : "Claim CFG"}
          </Button>
        </CardContent>
      </Card>
      )}

      {/* Tokenomics + use of funds */}
      <div className="grid lg:grid-cols-2 gap-4">
        <AllocCard title="Tokenomics" data={TOKENOMICS} />
        <AllocCard title="Where the funds go" data={USE_OF_FUNDS} />
      </div>

      {/* Live feed */}
      <Card className="border-border">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Live buys</CardTitle></CardHeader>
        <CardContent>
          {buys.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No purchases yet — be the first.</p>
          ) : (
            <ul className="space-y-1.5">
              {buys.map((b) => (
                <li key={b.key} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">{short(b.buyer)}</span>
                  <span className="text-foreground">${fmt(b.usd)} <span className="text-primary">→ {fmt(b.cfg)} CFG</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground/60 max-w-2xl mx-auto">
        $CFG is a governance token, not an investment contract — no return is promised. Settlement is in USDC on Ethereum mainnet.
        Nothing here is financial advice; do your own research.
      </p>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 text-center">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-grotesk font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Donut({ gradient, top, bottom }) {
  return (
    <div className="relative w-[200px] h-[200px] rounded-full shrink-0" style={{ background: gradient }}>
      <div className="absolute rounded-full" style={{ inset: "30%", background: "#050d09", boxShadow: "inset 0 0 0 1px rgba(159,199,180,.12)" }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="font-grotesk text-2xl text-foreground leading-none">{top}</b>
        <span className="text-[11px] tracking-widest text-muted-foreground mt-1">{bottom}</span>
      </div>
    </div>
  );
}

function AllocCard({ title, data }) {
  return (
    <Card className="border-border">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">{data.sub}</p>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Donut gradient={data.gradient} top={data.center[0]} bottom={data.center[1]} />
          <ul className="space-y-2 min-w-[210px] flex-1">
            {data.rows.map((r) => (
              <li key={r.l} className="flex items-center gap-2.5 text-sm">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: r.c }} />
                <span className={`flex-1 ${r.hl ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{r.l}</span>
                <span className={`font-bold ${r.hl ? "text-primary" : "text-foreground"}`}>{r.p}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
