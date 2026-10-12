import { useState, useEffect, useMemo } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatUtcDate } from "@/lib/datetime";
import { Link2, Eye, Search, ShieldAlert } from "lucide-react";
import { useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall, readContract, waitForReceipt } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { usePrices } from "@/lib/PriceContext";
import { toPriceFeedSymbol } from "@/lib/assetConfig";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

function calcTradePnl(trade, currentPrice) {
  if (!currentPrice || !trade.entry_price || !trade.size) return 0;
  const pct = (currentPrice - trade.entry_price) / trade.entry_price;
  return (trade.direction === "long" ? 1 : -1) * pct * trade.size;
}

// Map Base44 phase string → contract uint8
function phaseToUint8(phase) {
  if (phase === "phase_1") return 1;
  if (phase === "phase_2") return 2;
  return 3; // funded / passed / other → 3
}


// Compact horizontal bar showing how much of a drawdown limit is used.
// Color steps: green < 50% used, yellow 50–80%, red > 80%.
// Shows a "BREACHED" badge when current > max (bar fills fully in red).
function DrawdownBar({ label, current, max }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  const breached = max > 0 && current > max;
  const color =
    breached    ? "bg-red-500" :
    ratio < 0.5 ? "bg-green-500" :
    ratio < 0.8 ? "bg-yellow-500" : "bg-red-500";
  const textColor =
    breached    ? "text-red-400 font-bold" :
    ratio < 0.5 ? "text-green-400" :
    ratio < 0.8 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-1.5 min-w-[140px]">
      <span className="text-[10px] text-muted-foreground font-medium w-3">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {breached ? (
        <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/40 rounded px-1 py-0.5 font-bold uppercase tracking-wider">
          Breach
        </span>
      ) : (
        <span className={`text-[10px] tabular-nums w-14 text-right ${textColor}`}>
          {current.toFixed(1)}/{max}%
        </span>
      )}
    </div>
  );
}

function DrawdownCell({ account, openTrades, tickers, getPrice }) {
  const unrealisedPnl = useMemo(() => {
    return (openTrades || []).reduce((sum, t) => {
      const sym = toPriceFeedSymbol(t.symbol);
      return sum + calcTradePnl(t, getPrice(sym));
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTrades, tickers]);

  const balance = account?.current_balance ?? account?.starting_balance ?? account?.account_size ?? 0;
  const startingBalance = account?.starting_balance ?? account?.account_size ?? balance;
  const liveBalance = balance + unrealisedPnl;

  // Total drawdown — only counts losses, not profits
  const totalLossPct = startingBalance > 0
    ? Math.max(0, ((startingBalance - liveBalance) / startingBalance) * 100)
    : 0;
  // Daily drawdown — from today's opening balance (snapshotted at UTC midnight)
  // down to live equity. FTMO-style: intra-day peaks above open are ignored,
  // only actual loss from the day's starting reference counts.
  const dayStart = account?.day_start_balance ?? account?.current_balance ?? startingBalance;
  const dailyLossPct = startingBalance > 0
    ? Math.max(0, ((dayStart - liveBalance) / startingBalance) * 100)
    : 0;

  const maxDaily = account?.max_daily_loss_pct ?? 5;
  const maxTotal = account?.max_total_loss_pct ?? 10;

  return (
    <div className="space-y-1 inline-block">
      <DrawdownBar label="D" current={dailyLossPct} max={maxDaily} />
      <DrawdownBar label="T" current={totalLossPct} max={maxTotal} />
    </div>
  );
}

function EquityCell({ account, openTrades, tickers, getPrice }) {
  // Recompute P&L on every Pyth price tick. `tickers` changes on every SSE
  // update (~400ms) so this stays in lockstep with the live feed. Using
  // `getPrice` as a dependency wouldn't work — it's ref-backed and stable.
  const unrealisedPnl = useMemo(() => {
    return (openTrades || []).reduce((sum, t) => {
      const sym = toPriceFeedSymbol(t.symbol);
      return sum + calcTradePnl(t, getPrice(sym));
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTrades, tickers]);

  // Fall back to starting_balance → account_size if current_balance hasn't been
  // written yet (matches AccountBalanceBar, OrderPanel, RuleGauges fallback)
  const balance = account?.current_balance ?? account?.starting_balance ?? account?.account_size ?? 0;
  const equity = balance + unrealisedPnl;
  const isUp = unrealisedPnl > 0;
  const isDown = unrealisedPnl < 0;

  return (
    <div className="text-xs">
      <div className={`font-medium ${isUp ? "text-green-400" : isDown ? "text-red-400" : "text-foreground"}`}>
        ${equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      {unrealisedPnl !== 0 && (
        <div className={`text-[10px] ${isUp ? "text-green-400/70" : "text-red-400/70"}`}>
          {isUp ? "+" : ""}${unrealisedPnl.toFixed(2)} unrealised
        </div>
      )}
    </div>
  );
}

export default function ChallengeManager({ accounts, onRefresh, onAccountRegistered, onViewAccount }) {
  const [search, setSearch] = useState("");
  const [registeringId, setRegisteringId] = useState(null);
  const [registerError, setRegisterError] = useState({});
  const [openTradesByAccount, setOpenTradesByAccount] = useState({});

  const { tickers, getPrice, registerSymbols } = usePrices();
  const { mutateAsync: sendTransaction } = useSendTransaction();

  // ── Fetch ALL open trades once, group by account_id ───────────────────
  // Fetching at the parent level (instead of per-cell) avoids a flurry of
  // parallel API calls and ensures every trade's symbol is registered with
  // PriceContext before any cell renders — so getPrice returns live values
  // on first paint instead of null until trades load.
  useEffect(() => {
    let cancelled = false;
    let interval = null;

    const fetchOpenTrades = async () => {
      try {
        const trades = await base44.entities.Trade.filter({ status: "open" });
        if (cancelled) return;
        const arr = Array.isArray(trades) ? trades : [];

        // Group by account_id
        const grouped = {};
        for (const t of arr) {
          if (!t.account_id) continue;
          if (!grouped[t.account_id]) grouped[t.account_id] = [];
          grouped[t.account_id].push(t);
        }
        setOpenTradesByAccount(grouped);

        // Register every unique symbol with PriceContext → Pyth SSE subscribes
        const syms = [...new Set(arr.map(t => toPriceFeedSymbol(t.symbol)).filter(Boolean))];
        if (syms.length > 0 && registerSymbols) registerSymbols(syms);
      } catch (err) {
        console.error("[admin] Failed to load open trades:", err);
      }
    };

    fetchOpenTrades();
    interval = setInterval(fetchOpenTrades, 15000);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [registerSymbols]);

  const handleRegisterOnChain = async (acc) => {
    if (!POOL_ADDRESS) {
      setRegisterError((prev) => ({ ...prev, [acc.id]: "Pool address not configured" }));
      return;
    }
    setRegisteringId(acc.id);
    setRegisterError((prev) => ({ ...prev, [acc.id]: "" }));
    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
      const accountSizeUnits = BigInt(Math.round((acc.account_size || acc.starting_balance || 0) * 1_000_000));
      const onchainId = acc.account_id || acc.id;

      // Check if the account is already registered on-chain (e.g. paid via Onboarding
      // but onchain_registered flag was never set in Base44). If so, just sync the flag.
      const existing = await readContract({
        contract: pool,
        method: "function getChallenge(string accountId) view returns ((address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps))",
        params: [onchainId] });

      if (existing.createdAt > 0n) {
        // Already on-chain — just sync the Base44 flag
        await base44.entities.ChallengeAccount.update(acc.id, { onchain_registered: true });
      } else {
        // Not yet on-chain — register it now
        if (!acc.trader_address) throw new Error("Account has no trader_address — set it before registering on-chain");
        const tx = await sendTransaction(
          prepareContractCall({
            contract: pool,
            method: "function adminRegisterChallenge(address trader, string accountId, uint256 accountSize, uint8 phase)",
            params: [acc.trader_address, onchainId, accountSizeUnits, phaseToUint8(acc.phase)] })
        );
        const receipt = await waitForReceipt({ client: thirdwebClient, chain, transactionHash: tx.transactionHash });
        if (receipt.status === "reverted") throw new Error("Transaction reverted — check that your wallet is the contract owner");
        await base44.entities.ChallengeAccount.update(acc.id, { onchain_registered: true });
      }

      // Optimistically update local state immediately so UI reflects the change
      // even if onRefresh returns slightly stale data from Base44
      onAccountRegistered && onAccountRegistered(acc.id);
      onRefresh && onRefresh();
    } catch (err) {
      console.error("adminRegisterChallenge failed:", err);
      const msg = err?.message || "Registration failed";
      setRegisterError((prev) => ({ ...prev, [acc.id]: msg }));
    } finally {
      setRegisteringId(null);
    }
  };

  if (!accounts || accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground text-sm">
        No challenge accounts found.
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filteredAccounts = q
    ? accounts.filter((a) =>
        [a.trader_address, a.account_id, a.id]
          .some((v) => String(v ?? "").toLowerCase().includes(q))
      )
    : accounts;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trader, account ID, or ID…"
          className="pl-9 h-9"
        />
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left text-xs text-muted-foreground px-4 py-2">Trader</th>
              <th className="text-left text-xs text-muted-foreground px-4 py-2">Account ID</th>
              <th className="text-left text-xs text-muted-foreground px-4 py-2">ID</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Size</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Balance</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Equity (Live)</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Drawdown (D / T)</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Phase</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Status</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Started</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">On-Chain</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No accounts match “{search}”.
                </td>
              </tr>
            )}
            {filteredAccounts.map((acc) => {
              const isUnderReview = acc.under_review === true || acc.status === "under_review";
              return (
              <tr key={acc.id} className={`border-b border-border/50 hover:bg-secondary/20 ${isUnderReview ? "bg-red-500/5" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {acc.trader_address?.slice(0, 6)}...{acc.trader_address?.slice(-4)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {acc.account_id || acc.id}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {acc.id}
                </td>
                <td className="px-4 py-3 text-right text-foreground font-medium">
                  ${acc.account_size?.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs text-foreground font-medium">
                    ${(acc.current_balance ?? acc.starting_balance ?? acc.account_size ?? 0).toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <EquityCell
                    account={acc}
                    openTrades={openTradesByAccount[acc.id]}
                    tickers={tickers}
                    getPrice={getPrice}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <DrawdownCell
                    account={acc}
                    openTrades={openTradesByAccount[acc.id]}
                    tickers={tickers}
                    getPrice={getPrice}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Badge variant="outline" className="text-xs">
                    {acc.phase?.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()) || "—"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={`text-xs ${
                      acc.status === "active" ? "bg-green-500/10 text-green-400 border-green-500/30" :
                      acc.status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/30" :
                      "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                    }`}>
                      {acc.status?.charAt(0).toUpperCase() + acc.status?.slice(1) || "—"}
                    </Badge>
                    {isUnderReview && (
                      <Badge variant="outline" className="text-xs bg-red-500/15 text-red-400 border-red-500/40 gap-1">
                        <ShieldAlert className="w-3 h-3" /> Under review
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                  {acc.start_date ? formatUtcDate(acc.start_date, { year: false }) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {acc.onchain_registered ? (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                      Registered
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                      Not registered
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 flex-col">
                    <div className="flex gap-1">
                      {onViewAccount && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs border-primary/40 text-primary hover:bg-primary/10 px-2"
                          onClick={() => onViewAccount(acc.id)}
                        >
                          <Eye className="w-3 h-3 mr-1" />View
                        </Button>
                      )}
                      {!acc.onchain_registered && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs border-primary/40 text-primary hover:bg-primary/10 px-2"
                          disabled={registeringId === acc.id}
                          onClick={() => handleRegisterOnChain(acc)}
                        >
                          {registeringId === acc.id ? (
                            <BoltLoader className="w-3 h-3" />
                          ) : (
                            <><Link2 className="w-3 h-3 mr-1" />Register</>
                          )}
                        </Button>
                      )}
                    </div>
                    {registerError[acc.id] && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded p-1.5 max-w-[200px] mt-1">
                        <p className="text-xs text-red-400 break-words">{registerError[acc.id]}</p>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
