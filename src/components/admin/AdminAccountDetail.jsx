import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { workerPost } from "@/lib/workerApi";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import { useDefaultRules } from "@/hooks/useDefaultRules";
import { evaluateMilestones } from "@/lib/compliance";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUtcDate } from "@/lib/datetime";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  DollarSign,
  LineChart,
  ChevronDown,
  ArrowLeft,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import RuleGauges from "../trader/RuleGauges";
import PnLCalendar from "../trader/PnLCalendar";
import TradeHistory from "../trader/TradeHistory";
import EquityCurve from "../trader/EquityCurve";
import { usePrices, useRegisterSymbols } from "@/lib/PriceContext";

function StatCard({ label, value, sub, positive }) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p
          className={`text-xl font-grotesk font-bold ${
            positive === true
              ? "text-green-400"
              : positive === false
                ? "text-red-400"
                : "text-foreground"
          }`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminAccountDetail({ accountId, onBack }) {
  const { rules: defaultRules } = useDefaultRules();
  const { token, signIn } = useCommunityToken();
  const [account, setAccount] = useState(null);
  const [trades, setTrades] = useState([]);
  const [walletAccounts, setWalletAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accountId);
  const [loading, setLoading] = useState(true);
  const [showOtherAccounts, setShowOtherAccounts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const selectedAccount =
    walletAccounts.find((a) => a.id === selectedAccountId) ||
    (account?.id === selectedAccountId ? account : null);

  const toArr = (v) => (Array.isArray(v) ? v : []);

  useEffect(() => {
    const loadAccount = async () => {
      setLoading(true);
      try {
        const matches = toArr(
          await base44.entities.ChallengeAccount.filter({ id: accountId })
        );
        const acc = matches[0];
        setAccount(acc);

        if (acc?.trader_address) {
          const walletAccs = toArr(
            await base44.entities.ChallengeAccount.filter(
              { trader_address: acc.trader_address },
              "-created_date"
            )
          );
          setWalletAccounts(walletAccs);
        }

        const tr = toArr(
          await base44.entities.Trade.filter({ account_id: accountId }, "-close_time")
        );
        setTrades(tr);
      } catch (err) {
        console.error("Failed to load account:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAccount();
  }, [accountId]);

  const handleAccountChange = async (id) => {
    setSelectedAccountId(id);
    try {
      const tr = toArr(
        await base44.entities.Trade.filter({ account_id: id }, "-close_time")
      );
      setTrades(tr);
    } catch (err) {
      console.error("Failed to load trades:", err);
    }
  };

  const openSymbols = [
    ...new Set(
      trades
        .filter((t) => t.status === "open")
        .map((t) => toPriceFeedSymbol(t.symbol))
        .filter(Boolean)
    ),
  ];
  useRegisterSymbols(openSymbols);
  const { getPrice } = usePrices();

  const startingBalance =
    selectedAccount?.starting_balance ?? selectedAccount?.account_size ?? 0;

  const unrealisedPnl = trades
    .filter((t) => t.status === "open")
    .reduce((sum, t) => {
      const sym = toPriceFeedSymbol(t.symbol);
      const price = getPrice(sym);
      if (!price || !t.entry_price || !t.size) return sum;
      const pct = (price - t.entry_price) / t.entry_price;
      return sum + (t.direction === "long" ? 1 : -1) * pct * t.size;
    }, 0);

  const liveBalance = (selectedAccount?.current_balance ?? 0) + unrealisedPnl;
  const profitPct =
    startingBalance > 0
      ? ((liveBalance - startingBalance) / startingBalance) * 100
      : 0;

  const closedTrades = trades.filter((t) => t.status === "closed");
  const openTrades = trades.filter((t) => t.status === "open");
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);

  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl < 0);
  const winRate =
    closedTrades.length > 0
      ? ((wins.length / closedTrades.length) * 100).toFixed(0)
      : "—";

  const profitFactor =
    losses.length > 0 && wins.length > 0
      ? (
          wins.reduce((s, t) => s + t.pnl, 0) /
          Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
        ).toFixed(2)
      : wins.length > 0
        ? "∞"
        : "—";

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length)
      : 0;
  const wlRatio = avgWin > 0 && avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "—";

  const accountPassed = evaluateMilestones(selectedAccount, closedTrades, defaultRules)
    .allPassed;

  const tradingDaysCount = new Set(
    closedTrades.filter((t) => t.close_time).map((t) => t.close_time.split("T")[0])
  ).size;

  const copyAddress = () => {
    navigator.clipboard.writeText(selectedAccount?.trader_address || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUnderReview =
    selectedAccount?.under_review === true || selectedAccount?.status === "under_review";

  // Claim kill-switch: sets the `under_review` flag the claim oracle
  // (worker/claim.js#prepare) checks before signing any proof. Routed through the
  // worker (/admin/review-account), which writes via the signed bridge
  // (base44.asServiceRole) — a direct frontend write is blocked by Base44
  // permission rules and silently fails to persist.
  const toggleReview = async () => {
    if (!selectedAccount) return;
    const next = !isUnderReview;
    let reason = null;
    if (next) {
      reason = window.prompt(
        "Reason for placing this account under review (optional, internal note):",
        selectedAccount.review_reason || ""
      );
      if (reason === null) return; // cancelled
      reason = reason.trim() || null;
    }
    setReviewing(true);
    try {
      const tok = token || (await signIn());
      const res = await workerPost("/admin/review-account", {
        accountId: selectedAccount.id,
        underReview: next,
        reason,
        ...tok,
      });
      const text = await res.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      if (!res.ok || !body.ok) {
        throw new Error(
          body.error ||
            (res.status === 404
              ? "Endpoint not found — the worker needs to be redeployed with the review-account route."
              : `Worker error ${res.status}`)
        );
      }
      const persisted = body.under_review === true;
      const patch = (a) =>
        a && a.id === selectedAccount.id
          ? { ...a, under_review: persisted, review_reason: persisted ? reason : null }
          : a;
      setAccount((a) => patch(a));
      setWalletAccounts((list) => list.map(patch));
      toast.success(
        persisted
          ? "Account placed under review — claims are now blocked"
          : "Review cleared — account can claim again"
      );
    } catch (err) {
      console.error("Failed to toggle review:", err);
      toast.error("Failed to update review status", { description: err?.message || String(err) });
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="text-center py-16 text-muted-foreground">Loading account…</div>
      </div>
    );
  }

  if (!selectedAccount) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="text-center py-16 text-muted-foreground">Account not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Challenges
          </Button>
          <div>
            <h2 className="text-lg font-grotesk font-bold text-foreground">
              Account: {(selectedAccount.account_id || selectedAccount.id)?.slice(0, 12)}…
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                Trader: {selectedAccount.trader_address?.slice(0, 6)}…
                {selectedAccount.trader_address?.slice(-4)}
              </span>
              <button
                onClick={copyAddress}
                className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                title="Copy address"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isUnderReview && (
            <Badge className="text-xs px-2.5 py-1 bg-red-500/15 text-red-400 border border-red-500/30 gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> UNDER REVIEW
            </Badge>
          )}
          <Badge className="text-base px-3 py-1.5">
            {selectedAccount.phase?.replace("_", " ").toUpperCase()}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleReview}
            disabled={reviewing}
            className={`gap-1.5 ${
              isUnderReview
                ? "border-green-500/40 text-green-400 hover:bg-green-500/10"
                : "border-red-500/40 text-red-400 hover:bg-red-500/10"
            }`}
          >
            {isUnderReview ? (
              <><ShieldCheck className="w-4 h-4" /> Clear review</>
            ) : (
              <><ShieldAlert className="w-4 h-4" /> Place under review</>
            )}
          </Button>
        </div>
      </div>

      {isUnderReview && selectedAccount.review_reason && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-400">
            <span className="font-semibold">Under review.</span> Claims blocked.
            <span className="text-red-400/80"> Reason: {selectedAccount.review_reason}</span>
          </p>
        </div>
      )}

      {/* Account selector for wallet accounts */}
      {walletAccounts.length > 1 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowOtherAccounts(!showOtherAccounts)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-sm"
          >
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Activity className="w-4 h-4" />
              Other Accounts from This Wallet ({walletAccounts.length - 1})
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                showOtherAccounts ? "rotate-180" : ""
              }`}
            />
          </button>
          {showOtherAccounts && (
            <div className="border-t border-border divide-y divide-border">
              {walletAccounts
                .filter((a) => a.id !== selectedAccountId)
                .map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => {
                      handleAccountChange(acc.id);
                      setShowOtherAccounts(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-foreground font-medium">
                          ${acc.account_size?.toLocaleString()}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {acc.phase?.replace("_", " ").toUpperCase()}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {acc.created_date ? formatUtcDate(acc.created_date) : "—"}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Account Balance (Equity)"
          value={`$${liveBalance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          sub={
            unrealisedPnl !== 0
              ? `${unrealisedPnl >= 0 ? "+" : ""}$${unrealisedPnl.toFixed(2)} unrealised`
              : `Started at $${selectedAccount?.starting_balance?.toLocaleString()}`
          }
        />
        <StatCard
          label={selectedAccount?.phase === "funded" ? "P&L" : "P&L vs Target"}
          value={`${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}%`}
          sub={
            selectedAccount?.phase === "funded"
              ? `$${(liveBalance - (selectedAccount?.starting_balance || 0)).toFixed(2)}`
              : `Target: ${selectedAccount?.phase === "phase_1" ? "10" : "5"}%`
          }
          positive={profitPct > 0}
        />
        <StatCard
          label="Total Realised P&L"
          value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString()}`}
          positive={totalPnl > 0 ? true : totalPnl < 0 ? false : undefined}
        />
        <StatCard
          label="Win Rate"
          value={winRate === "—" ? "—" : `${winRate}%`}
          sub={`${closedTrades.length} closed trades`}
        />
        <StatCard
          label="Profit Factor"
          value={profitFactor}
          sub={`${wins.length}W / ${losses.length}L`}
          positive={
            parseFloat(profitFactor) > 1 ? true : profitFactor === "—" ? undefined : false
          }
        />
        <StatCard
          label="Avg W : L"
          value={wlRatio === "—" ? "—" : `${wlRatio}×`}
          sub={`$${avgWin.toFixed(0)} / $${avgLoss.toFixed(0)}`}
          positive={parseFloat(wlRatio) >= 1 ? true : wlRatio === "—" ? undefined : false}
        />
      </div>

      {/* Open Trades */}
      {(() => {
        const openTrades = trades.filter((t) => t.status === "open");
        if (openTrades.length === 0) {
          return (
            <div className="bg-card/50 border border-border rounded-lg p-4 flex items-center gap-3 opacity-50">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">No Open Trades</span>
            </div>
          );
        }
        return (
          <Card className="border-border">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Open Trades ({openTrades.length})
                </h3>
              </div>
              <div className="max-h-[160px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left text-xs text-muted-foreground px-4 py-2">
                        Symbol
                      </th>
                      <th className="text-left text-xs text-muted-foreground px-4 py-2">
                        Direction
                      </th>
                      <th className="text-right text-xs text-muted-foreground px-4 py-2">
                        Size
                      </th>
                      <th className="text-right text-xs text-muted-foreground px-4 py-2">
                        Entry
                      </th>
                      <th className="text-right text-xs text-muted-foreground px-4 py-2">
                        Current
                      </th>
                      <th className="text-right text-xs text-muted-foreground px-4 py-2">
                        P&L
                      </th>
                      <th className="text-right text-xs text-muted-foreground px-4 py-2">
                        Leverage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTrades.map((t) => {
                      const feedSymbol = toPriceFeedSymbol(t.symbol);
                      const currentPrice = feedSymbol ? getPrice(feedSymbol) : null;
                      const pnl =
                        currentPrice && t.entry_price && t.size
                          ? (t.direction === "long" ? 1 : -1) *
                            ((currentPrice - t.entry_price) / t.entry_price) *
                            t.size
                          : null;
                      return (
                        <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/20">
                          <td className="px-4 py-2.5 font-medium text-foreground">{t.symbol}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`flex items-center gap-1 text-xs font-medium ${
                                t.direction === "long"
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {t.direction === "long" ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {t.direction?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-foreground">
                            ${t.size?.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                            {t.entry_price >= 1000
                              ? `$${t.entry_price?.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : `$${t.entry_price?.toFixed(4)}`}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                            {currentPrice
                              ? currentPrice >= 1000
                                ? `$${currentPrice.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}`
                                : `$${currentPrice.toFixed(4)}`
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold font-mono text-xs ${
                              pnl === null
                                ? "text-muted-foreground"
                                : pnl >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                            }`}
                          >
                            {pnl !== null
                              ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                            {t.leverage || 1}x
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Charts and details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <EquityCurve trades={trades} />
          <PnLCalendar trades={trades} />
          <TradeHistory trades={trades} />
        </div>
        <div>
          <RuleGauges
            account={selectedAccount}
            liveBalance={liveBalance}
            unrealisedPnl={unrealisedPnl}
            tradingDaysCount={tradingDaysCount}
            trades={trades}
          />
        </div>
      </div>
    </div>
  );
}
