import SEO from "@/components/SEO";
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import { useAuth } from "@/lib/AuthContext";
import { useDefaultRules } from "@/hooks/useDefaultRules";
import { useWhitelistTermsGate } from "@/hooks/useWhitelistTermsGate";
import TermsAcceptanceGate from "@/components/TermsAcceptanceGate";
import { evaluateMilestones } from "@/lib/compliance";

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  ChevronRight,
  ChevronDown,
  Zap,
  LineChart,
  Send,
  AlertTriangle,
  Archive,
  XCircle,
  CheckCircle2,
  Activity,
  TrendingDown,
} from "lucide-react";
import RuleGauges from "../components/trader/RuleGauges";
import PnLCalendar from "../components/trader/PnLCalendar";
import UtcClock from "@/components/UtcClock";
import { formatUtcDate } from "@/lib/datetime";
import TradeHistory from "../components/trader/TradeHistory";
import EquityCurve from "../components/trader/EquityCurve";
import AccountSelector from "../components/trader/AccountSelector";
import DashboardPreview from "../components/trader/DashboardPreview";
import { usePrices, useRegisterSymbols } from "@/lib/PriceContext";
import { useConnectModal } from "thirdweb/react";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import { Wallet } from "lucide-react";

function StatCard({ label, value, sub, positive }) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-grotesk font-bold ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-foreground"}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function TraderDashboard() {
  const { address, isAuthenticated, isLoadingAuth } = useAuth();
  const { connect } = useConnectModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const { rules: defaultRules } = useDefaultRules();
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { needsTermsAcceptance, acceptTerms, filterAccounts } = useWhitelistTermsGate(address, accounts);

  // System message (e.g. "account failed" redirect from TradingTerminal)
  const [systemMessage, setSystemMessage] = useState(null);
  useEffect(() => {
    const msg = searchParams.get("failed");
    if (msg) {
      setSystemMessage("Challenge failed — you breached a risk limit. All positions were force-closed.");
      setSearchParams((prev) => { prev.delete("failed"); return prev; }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Split into active (tradeable) and archived
  const ARCHIVED_PHASES = ["failed", "paid_out", "phase_1_passed", "phase_2_passed"];
  const visibleAccounts = filterAccounts(accounts);
  const activeAccounts  = visibleAccounts.filter((a) => !ARCHIVED_PHASES.includes(a.phase));
  const archivedAccounts = visibleAccounts.filter((a) => ARCHIVED_PHASES.includes(a.phase));

  // Register open trade symbols with the global WebSocket price feed
  const openSymbols = [...new Set(
    trades.filter(t => t.status === "open").map(t => toPriceFeedSymbol(t.symbol)).filter(Boolean)
  )];
  useRegisterSymbols(openSymbols);
  const { getPrice } = usePrices();

  useEffect(() => {
    if (address) fetchData(address);
    else { setAccounts([]); setTrades([]); setSelectedAccountId(null); }
  }, [address]);

  const toArr = (v) => (Array.isArray(v) ? v : []);

  const fetchData = async (addr) => {
    setLoading(true);
    try {
      const accs = toArr(await base44.entities.ChallengeAccount.filter({ trader_address: addr }, "-created_date"));
      setAccounts(accs);
      if (accs.length > 0) {
        // In screenshots mode, honour ?mockAccountId= to pre-select a specific account
        const mockAccountId = IS_SCREENSHOTS ? searchParams.get("mockAccountId") : null;
        const firstActive =
          (mockAccountId && accs.find((a) => a.id === mockAccountId)) ||
          accs.find((a) => a.phase !== "failed") ||
          accs[0];
        setSelectedAccountId(firstActive.id);
        const tr = toArr(await base44.entities.Trade.filter({ account_id: firstActive.id }, "-close_time"));
        setTrades(tr);
      }
    } catch (err) {
      console.error("Failed to load account data:", err);
    } finally {
      setLoading(false);
    }
  };

  const refreshAccount = async (id) => {
    if (!id || !address) return;
    try {
      const accs = toArr(await base44.entities.ChallengeAccount.filter({ trader_address: address }, "-created_date"));
      setAccounts(accs);
      const tr = toArr(await base44.entities.Trade.filter({ account_id: id }, "-close_time"));
      setTrades(tr);
    } catch (err) {
      console.error("Failed to refresh account:", err);
    }
  };

  const handleAccountChange = async (id) => {
    setSelectedAccountId(id);
    try {
      const tr = toArr(await base44.entities.Trade.filter({ account_id: id }, "-close_time"));
      setTrades(tr);
    } catch (err) {
      console.error("Failed to load trades:", err);
    }
  };


  const unrealisedPnl = trades
    .filter(t => t.status === "open")
    .reduce((sum, t) => {
      const sym = toPriceFeedSymbol(t.symbol);
      const price = getPrice(sym);
      if (!price || !t.entry_price || !t.size) return sum;
      const pct = (price - t.entry_price) / t.entry_price;
      return sum + (t.direction === "long" ? 1 : -1) * pct * t.size;
    }, 0);

  const liveBalance = (selectedAccount?.current_balance ?? 0) + unrealisedPnl;
  const startingBalance = selectedAccount?.starting_balance ?? selectedAccount?.account_size ?? 0;

  // ── Balance reconciliation ─────────────────────────────────────────────
  // If a closed trade's pnl was manually edited (or a close handler failed
  // mid-way), current_balance can drift from the sum of closed P&Ls.
  // Auto-heal by recomputing from ground truth. Skipped for failed accounts
  // and accounts that have taken payouts (both have valid non-arithmetic
  // reasons for current_balance to differ from starting + closed P&Ls).
  const reconciledRef = useRef(new Set());
  useEffect(() => {
    if (!selectedAccount || startingBalance <= 0) return;
    if (selectedAccount.phase === "failed") return;
    if (selectedAccount.payout_tx_hash) return;
    if (reconciledRef.current.has(selectedAccount.id)) return;

    // Only reconcile against trades that actually belong to this account.
    // `trades` can briefly hold the previously-selected account's rows while
    // the newly-selected account's load is still in flight (account switch sets
    // selectedAccountId synchronously but setTrades happens after an await).
    // Reconciling then would compute THIS account's balance from ANOTHER
    // account's P&L and persist it to base44 — the cross-account contamination
    // that made a fresh account mirror an existing one's balance + P&L.
    const closed = trades.filter(
      t => t.status === "closed" &&
           (t.account_id === selectedAccount.id || t.account_id === selectedAccount.account_id)
    );
    if (closed.length === 0) return; // nothing (for this account) to reconcile against yet

    const expected = startingBalance + closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const actual   = selectedAccount.current_balance ?? 0;
    const drift    = expected - actual;

    if (Math.abs(drift) < 0.01) return; // within rounding tolerance

    reconciledRef.current.add(selectedAccount.id); // only auto-heal once per session
    console.warn(
      `[reconcile] Account ${selectedAccount.id}: current_balance drift ${drift >= 0 ? "+" : ""}$${drift.toFixed(2)} ` +
      `(expected $${expected.toFixed(2)}, actual $${actual.toFixed(2)}) — auto-correcting`
    );
    base44.entities.ChallengeAccount
      .update(selectedAccount.id, { current_balance: expected })
      .then(() => refreshAccount(selectedAccount.id))
      .catch(err => console.error("[reconcile] Update failed:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id, trades]);

  // Drawdown enforcement is server-side (worker/executors.js executeDrawdownBreach).
  // The dashboard refreshes from Base44 on a poll interval; when the account
  // flips to failed, the UI reacts naturally. The old client-side enforcement
  // duplicated the worker's logic and was an attack surface — removed.
  const profitPct = startingBalance > 0 ? ((liveBalance - startingBalance) / startingBalance) * 100 : 0;
  const closedTrades = trades.filter(t => t.status === "closed");

  // Trading days = unique calendar days where at least one position was closed
  const tradingDaysCount = new Set(
    closedTrades.filter(t => t.close_time).map(t => t.close_time.split("T")[0])
  ).size;

  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const profitTargetPct = selectedAccount?.phase === "phase_1" ? 10 : selectedAccount?.phase === "phase_2" ? 5 : 0;
  const realisedPnl = (selectedAccount?.current_balance ?? 0) - startingBalance;
  // Hitting the profit target alone is not enough — the trader still has to
  // satisfy every other milestone (min trading days, daily/total drawdown,
  // consistency / best-day rule). Until all five clear, keep the Trade
  // button visible so they can keep trading to dilute their best day or
  // accrue more trading days.
  const accountPassed = evaluateMilestones(selectedAccount, closedTrades, defaultRules).allPassed;
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl < 0);
  const winRate = closedTrades.length > 0 ? ((wins.length / closedTrades.length) * 100).toFixed(0) : "—";

  const profitFactor = losses.length > 0 && wins.length > 0
    ? (wins.reduce((s, t) => s + t.pnl, 0) / Math.abs(losses.reduce((s, t) => s + t.pnl, 0))).toFixed(2)
    : wins.length > 0 ? "∞" : "—";

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const wlRatio = avgWin > 0 && avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "—";

  // Gate: whitelisted accounts require terms acceptance
  if (needsTermsAcceptance) {
    return <TermsAcceptanceGate variant="whitelist" walletAddress={address} onAccept={acceptTerms} />;
  }

  return (
    <div className="space-y-8">
      <SEO title="Trader Dashboard" noindex />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-grotesk font-bold text-foreground">Trader Hub</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your challenge progress and simulated P&L</p>
          <div className="mt-2">
            <UtcClock showReset={false} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedAccount && selectedAccount.phase !== "failed" && (
            <>
              {!accountPassed && (
                <Link to={`${createPageUrl("TradingTerminal")}?accountId=${selectedAccount.id}`}>
                  <Button className="bg-transparent border-2 border-green-400 text-green-400 hover:bg-green-400/10 font-semibold gap-2">
                    <LineChart className="w-4 h-4" /> Trade
                  </Button>
                </Link>
              )}
              <Link to={createPageUrl("Claim")}>
                <Button className="bg-transparent border-2 border-green-400 text-green-400 hover:bg-green-400/10 font-semibold gap-2">
                  <Send className="w-4 h-4" />
                  {accountPassed
                    ? selectedAccount.phase === "phase_1" ? "Claim Phase 2 Account" : "Claim Funded Account"
                    : "Claim"}
                </Button>
              </Link>
            </>
          )}
          <Link to={createPageUrl("Onboarding")}>
            <Button className="bg-primary text-primary-foreground gap-2 glow-green-sm">
              <Zap className="w-4 h-4" /> New Challenge
            </Button>
          </Link>
        </div>
      </div>

      {/* System message (e.g. redirected from TradingTerminal after failure) */}
      {systemMessage && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400 font-medium flex-1">{systemMessage}</p>
          <button onClick={() => setSystemMessage(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Simulated capital disclaimer */}
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3 flex gap-3 items-start text-sm">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-0.5">
          <span className="text-foreground font-medium">Simulated Capital Only. </span>
          All balances and P&L displayed are simulated. No real funds are traded.
          Stay within your risk limits: <span className="text-foreground">{defaultRules?.maxDailyLoss ?? 5}% max daily loss</span> and <span className="text-foreground">{defaultRules?.maxTotalLoss ?? 10}% max total drawdown</span>. Breaching either rule will fail your challenge immediately.
        </div>
      </div>

      {loading || isLoadingAuth ? (
        <DashboardPreview isAuthenticated={true} />
      ) : !isAuthenticated || accounts.length === 0 ? (
        <DashboardPreview
          isAuthenticated={isAuthenticated}
          onConnect={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}
        />
      ) : (
        <div className="space-y-6">
          <AccountSelector accounts={activeAccounts} selectedId={selectedAccountId} onSelect={handleAccountChange} />

          {accountPassed && (
            <div className="bg-primary/5 border border-primary/30 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
              <div>
                <p className="font-semibold text-primary">Account Passed!</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAccount?.phase === "phase_1"
                    ? "You've hit the Phase 1 profit target. Claim your Phase 2 account to continue."
                    : "You've hit the Phase 2 profit target. Claim your Funded account to continue."}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard
              label="Account Balance (Equity)"
              value={`$${liveBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={unrealisedPnl !== 0 ? `${unrealisedPnl >= 0 ? "+" : ""}$${unrealisedPnl.toFixed(2)} unrealised` : `Started at $${selectedAccount?.starting_balance?.toLocaleString()}`}
            />
            <StatCard
              label={selectedAccount?.phase === "funded" ? "P&L" : "P&L vs Target"}
              value={`${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}%`}
              sub={selectedAccount?.phase === "funded" ? `$${(liveBalance - (selectedAccount?.starting_balance || 0)).toFixed(2)}` : `Target: ${selectedAccount?.phase === "phase_1" ? "10" : "5"}%`}
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
              positive={parseFloat(profitFactor) > 1 ? true : profitFactor === "—" ? undefined : false}
            />
            <StatCard
              label="Avg W : L"
              value={wlRatio === "—" ? "—" : `${wlRatio}×`}
              sub={`$${avgWin.toFixed(0)} / $${avgLoss.toFixed(0)}`}
              positive={parseFloat(wlRatio) >= 1 ? true : wlRatio === "—" ? undefined : false}
            />
          </div>

          {/* ── Open Trades ──────────────────────────────────────── */}
          {(() => {
            const openTrades = trades.filter(t => t.status === "open");
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
                          <th className="text-left text-xs text-muted-foreground px-4 py-2">Symbol</th>
                          <th className="text-left text-xs text-muted-foreground px-4 py-2">Direction</th>
                          <th className="text-right text-xs text-muted-foreground px-4 py-2">Size</th>
                          <th className="text-right text-xs text-muted-foreground px-4 py-2">Entry</th>
                          <th className="text-right text-xs text-muted-foreground px-4 py-2">Current</th>
                          <th className="text-right text-xs text-muted-foreground px-4 py-2">P&L</th>
                          <th className="text-right text-xs text-muted-foreground px-4 py-2">Leverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openTrades.map((t) => {
                          const feedSymbol = toPriceFeedSymbol(t.symbol);
                          const currentPrice = feedSymbol ? getPrice(feedSymbol) : null;
                          const pnl = currentPrice && t.entry_price && t.size
                            ? ((t.direction === "long" ? 1 : -1) * ((currentPrice - t.entry_price) / t.entry_price) * t.size)
                            : null;
                          return (
                            <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/20">
                              <td className="px-4 py-2.5 font-medium text-foreground">{t.symbol}</td>
                              <td className="px-4 py-2.5">
                                <span className={`flex items-center gap-1 text-xs font-medium ${t.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                                  {t.direction === "long" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {t.direction?.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-foreground">${t.size?.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                                {t.entry_price >= 1000 ? `$${t.entry_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${t.entry_price?.toFixed(4)}`}
                              </td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                                {currentPrice ? (currentPrice >= 1000 ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${currentPrice.toFixed(4)}`) : "—"}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-semibold font-mono text-xs ${pnl === null ? "text-muted-foreground" : pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {pnl !== null ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{t.leverage || 1}x</td>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <EquityCurve trades={trades} />
              <PnLCalendar trades={trades} />
              <TradeHistory trades={trades} />
            </div>
            <div>
              <RuleGauges account={selectedAccount} liveBalance={liveBalance} unrealisedPnl={unrealisedPnl} tradingDaysCount={tradingDaysCount} trades={trades} />
            </div>
          </div>

          {!accountPassed && selectedAccount?.phase === "funded" && (
            <div className="bg-primary/5 border border-primary/30 rounded-lg p-4 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-semibold text-primary">You're Funded!</p>
                <p className="text-sm text-muted-foreground">Request a payout from your simulated profits. Settlement via smart contract.</p>
              </div>
              <Badge className="bg-primary text-primary-foreground">80% profit split</Badge>
            </div>
          )}

          {/* ── Archived (Failed) Accounts ───────────────────────── */}
          {archivedAccounts.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/50 transition-colors text-sm"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Archive className="w-4 h-4" />
                  <span className="font-medium">Archived Accounts</span>
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs">
                    {archivedAccounts.length} archived
                  </Badge>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && (
                <div className="border-t border-border divide-y divide-border">
                  {archivedAccounts.map((acc) => {
                    const isPassed  = acc.phase === "phase_1_passed" || acc.phase === "phase_2_passed";
                    const isPaidOut = acc.phase === "paid_out";
                    const isFailed  = acc.phase === "failed";
                    const phaseLabel = acc.phase === "phase_1_passed" ? "Phase 1"
                      : acc.phase === "phase_2_passed" ? "Phase 2"
                      : isPaidOut ? "Funded"
                      : "—";
                    return (
                    <div
                      key={acc.id}
                      className={`flex items-center justify-between px-4 py-3 text-sm cursor-pointer transition-colors ${acc.id === selectedAccountId ? (isFailed ? "bg-red-500/5" : "bg-primary/5") : "hover:bg-muted/30"}`}
                      onClick={() => handleAccountChange(acc.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isFailed
                          ? <XCircle className="w-4 h-4 text-red-400" />
                          : <CheckCircle2 className="w-4 h-4 text-primary" />}
                        <div>
                          <span className="text-foreground font-medium">${acc.account_size?.toLocaleString()}</span>
                          <span className="text-muted-foreground ml-2">{phaseLabel}</span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {(acc.account_id || acc.id)?.slice(0, 8)}…
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {acc.start_date && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {formatUtcDate(acc.start_date)}
                          </span>
                        )}
                        {(isPassed || isPaidOut) && acc.current_balance != null && (
                          <span className="text-xs text-green-400">
                            Final: ${acc.current_balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        )}
                        {isPassed
                          ? <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">Passed</Badge>
                          : isPaidOut
                          ? <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">Paid Out</Badge>
                          : <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">Failed</Badge>}
                      </div>
                    </div>
                    );
                  })}
                  <div className="px-4 py-3 bg-muted/20 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Start a new challenge to try again</p>
                    <Link to={createPageUrl("Onboarding")}>
                      <Button size="sm" className="bg-primary text-primary-foreground text-xs h-7 gap-1">
                        <Zap className="w-3 h-3" /> New Challenge
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
