import SEO from "@/components/SEO";
import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { supabase, syncAccount } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useDefaultRules } from "@/hooks/useDefaultRules";
import { useWhitelistTermsGate } from "@/hooks/useWhitelistTermsGate";
import { useZoneAccess } from "@/hooks/useZoneAccess";
import { fetchZoneHistory } from "@/lib/zoneTrades";
import TermsAcceptanceGate from "@/components/TermsAcceptanceGate";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { usePrices, useRegisterSymbols } from "@/lib/PriceContext";
import CandlestickChart from "@/components/trader/CandlestickChart";
import OrderPanel from "@/components/trader/OrderPanel";
import AccountBalanceBar from "@/components/trader/AccountBalanceBar";
import MarketDataPanel from "@/components/trader/MarketDataPanel";
import TerminalBottomPanel from "@/components/trader/TerminalBottomPanel";
import RuleGauges from "@/components/trader/RuleGauges";
import TerminalFooter from "@/components/trader/TerminalFooter";
import OnChainStatus from "@/components/brand/OnChainStatus";
import PoolBadge from "@/components/brand/PoolBadge";
import PoolTicker from "@/components/brand/PoolTicker";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  BarChart2,
  SlidersHorizontal,
  AlertTriangle,
  Info,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import AssetDropdown from "@/components/trader/AssetDropdown";
import MarketStatusBar from "@/components/trader/MarketStatusBar";
import { ASSET_CLASS, getAssetConfig, toPriceFeedSymbol, ensureTradablePairs, DEFAULT_TRADABLE_PAIRS } from "@/lib/assetConfig";
import { getMarketStatus } from "@/lib/marketHours";
import { haptic } from "@/lib/haptics";
import { use24hStats } from "@/hooks/use24hStats";
import { evaluateMilestones } from "@/lib/compliance";

const FALLBACK_PAIRS = DEFAULT_TRADABLE_PAIRS;

function formatPrice(p) {
  if (!p) return "—";
  if (p >= 1000)
    return p.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

export default function TradingTerminal() {
  const { address } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { rules: defaultRules } = useDefaultRules();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(
    searchParams.get("accountId") || null
  );
  const [pairs, setPairs] = useState(FALLBACK_PAIRS);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [positionRefresh, setPositionRefresh] = useState(0);
  const [openTrades, setOpenTrades] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  // Closed trades drive the milestone evaluator — without them we can't tell
  // min-trading-days / best-day / drawdown apart and would prematurely lock
  // trading the moment profit target was hit.
  const [closedTrades, setClosedTrades] = useState([]);
  const [slPrice, setSlPrice] = useState(null);
  const [tpPrice, setTpPrice] = useState(null);
  // Position plan pushed from the chart's position tool into the order ticket.
  const [appliedSetup, setAppliedSetup] = useState(null);
  const handleApplyPosition = useCallback((setup) => {
    setAppliedSetup(setup);
    setMobileTab("trade"); // surface the order form on mobile
  }, []);
  const [mobileTab, setMobileTab] = useState("chart");
  // Mobile Trade tab: positions/orders live in a collapsible drawer that
  // slides up over the order form. Collapsed by default so the form has room.
  const [mobilePositionsOpen, setMobilePositionsOpen] = useState(false);
  // Hard JS check on viewport width — supplements Tailwind's responsive
  // classes so the desktop / mobile layouts can be mutually exclusive in
  // the DOM, not just visually hidden by CSS. lg breakpoint = 1024px.
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e) => setIsDesktop(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);
  // Single source of truth for the active account's api_secret. Centralised
  // here so OrderPanel / ActivePositions / PendingOrders all see the same
  // value — previously they each generated independently and raced.
  const [apiSecret, setApiSecret] = useState(null);

  const { needsTermsAcceptance, acceptTerms, filterAccounts } = useWhitelistTermsGate(address, accounts);

  // Failed/paid_out accounts are inaccessible from the trading view —
  // they won't appear in the selector and can't be resolved as the
  // active account even via a stale ?accountId= URL.
  const tradableAccounts = accounts.filter(
    (a) => a.phase !== "failed" && a.phase !== "paid_out"
  );
  const selectedAccount =
    tradableAccounts.find((a) => a.id === selectedAccountId) ?? tradableAccounts[0] ?? null;

  // Register currently viewed pair + all open position symbols with the global price feed
  const openSymbols = [...new Set(openTrades.map(t => toPriceFeedSymbol(t.symbol)).filter(Boolean))];
  useRegisterSymbols([symbol, ...openSymbols]);
  const { getPrice, getTicker, connected } = usePrices();
  const currentPrice = getPrice(symbol);
  const ticker = getTicker(symbol);

  // Open position whose entry / SL / TP / liq lines are drawn on the chart.
  // Trades store the display symbol ("BTC/USDT"); the chart's `symbol` is the
  // internal form ("BTCUSDT"), so resolve the display symbol to match — this
  // also aligns the bottom panel's "Hide Other Pairs" filter.
  const [selectedPositionId, setSelectedPositionId] = useState(null);
  const displaySymbol = getAssetConfig(symbol)?.display_name || symbol;
  const positionsForSymbol = openTrades.filter((t) => t.symbol === displaySymbol);
  const selectedPosition =
    positionsForSymbol.find((t) => t.id === selectedPositionId) ?? positionsForSymbol[0] ?? null;

  // When the worker fails the selected account, drop the trader back to
  // the dashboard with a notice. Polled accounts pick up the phase change
  // via loadAccounts; nothing else is allowed to mutate phase from the UI.
  useEffect(() => {
    if (selectedAccount && (selectedAccount.phase === "failed" || selectedAccount.phase === "paid_out")) {
      navigate(`${createPageUrl("TraderDashboard")}?failed=1`, { replace: true });
    }
  }, [selectedAccount?.id, selectedAccount?.phase, navigate]);

  // Load accounts
  const loadAccounts = useCallback(async () => {
    if (!address) return;
    try {
      const data = await base44.entities.ChallengeAccount.filter(
        { trader_address: address },
        "-created_date"
      );
      const accs = Array.isArray(data) ? data : [];
      setAccounts(accs);
      if (!selectedAccountId && accs.length > 0) {
        setSelectedAccountId(accs[0].id);
      }
    } catch {}
  }, [address, selectedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAccounts(); }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: react to phase / balance / drawdown updates the worker writes
  // to Supabase so the UI reflects breach handling, payouts, and balance
  // changes without a page reload. Filter by the active account's id since
  // that's what the trading terminal actually displays — the dropdown's
  // other accounts can wait for the 60s backstop poll.
  useEffect(() => {
    if (!selectedAccount?.id) return undefined;
    const channel = supabase
      .channel(`account-${selectedAccount.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenge_accounts",
          filter: `id=eq.${selectedAccount.id}`,
        },
        () => loadAccounts()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedAccount?.id, loadAccounts]);

  // Backstop poll in case Realtime drops the subscription. Slower cadence
  // than the previous 15s now that Realtime handles the common case.
  useEffect(() => {
    if (!address) return;
    const id = setInterval(loadAccounts, 60_000);
    return () => clearInterval(id);
  }, [address, loadAccounts]);

  // Ensure the active account has an api_secret. If Base44 has one, adopt
  // it. If not, generate one, write to Base44, then re-read in case another
  // tab raced us (whichever update landed last is canonical). This is the
  // ONLY place that generates an api_secret — children read it via prop.
  useEffect(() => {
    if (!selectedAccount?.id) { setApiSecret(null); return undefined; }
    if (selectedAccount.api_secret) {
      setApiSecret(selectedAccount.api_secret);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const candidate = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        await base44.entities.ChallengeAccount.update(selectedAccount.id, { api_secret: candidate });
      } catch {}
      let secret = candidate;
      try {
        const matches = await base44.entities.ChallengeAccount.filter({ id: selectedAccount.id });
        const fresh = Array.isArray(matches) ? matches[0] : null;
        if (fresh?.api_secret) secret = fresh.api_secret;
      } catch {}
      if (cancelled) return;
      setApiSecret(secret);
      syncAccount(selectedAccount.id, { api_secret: secret });
    })();
    return () => { cancelled = true; };
  }, [selectedAccount?.id, selectedAccount?.api_secret]);

  // Capital committed to live zone-trade bets — subtracted from available
  // trade margin so the terminal can't commit capital that's in use in a game.
  // Only polled for zone-allowlisted wallets; everyone else stays at 0.
  const { allowed: zoneAllowed } = useZoneAccess(address);
  const [zoneReserved, setZoneReserved] = useState(0);
  useEffect(() => {
    if (!zoneAllowed || !selectedAccount?.id || !apiSecret) { setZoneReserved(0); return undefined; }
    let cancelled = false;
    const poll = async () => {
      try {
        const { reserved } = await fetchZoneHistory({ account_id: selectedAccount.id, api_secret: apiSecret, limit: 1 });
        if (!cancelled) setZoneReserved(reserved || 0);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [zoneAllowed, selectedAccount?.id, apiSecret]);

  // Load tradable pairs — seed missing defaults on first load
  useEffect(() => {
    (async () => {
      try {
        const data = await ensureTradablePairs(base44.entities.TradablePair);
        const enabled = data.filter((p) => p.enabled);
        if (enabled.length > 0) setPairs(enabled);
      } catch {
        console.warn("Could not load tradable pairs — using defaults");
      }
    })();
  }, []);

  // Keep openTrades + pendingOrders fresh — both reserve margin against
  // the account balance, so OrderPanel needs them for its margin checks.
  // Closed trades are loaded alongside so the milestone evaluator can decide
  // whether trading should actually be locked (profit target alone isn't
  // enough — min trading days, drawdown, etc. all have to clear too).
  const loadOpenTrades = useCallback(async () => {
    if (!selectedAccount?.id) return;
    try {
      const [open, pending, closed] = await Promise.all([
        base44.entities.Trade.filter({ account_id: selectedAccount.id, status: "open" }),
        base44.entities.Trade.filter({ account_id: selectedAccount.id, status: "pending" }),
        base44.entities.Trade.filter({ account_id: selectedAccount.id, status: "closed" }),
      ]);
      setOpenTrades(Array.isArray(open) ? open : []);
      setPendingOrders(Array.isArray(pending) ? pending : []);
      setClosedTrades(Array.isArray(closed) ? closed : []);
    } catch {}
  }, [selectedAccount?.id]);

  useEffect(() => {
    loadOpenTrades();
  }, [loadOpenTrades, positionRefresh]);

  // Live unrealised P&L across all open positions
  const unrealisedPnl = openTrades.reduce((sum, t) => {
    const sym = toPriceFeedSymbol(t.symbol);
    const price = getPrice(sym);
    if (!price || !t.entry_price || !t.size) return sum;
    const movePct = (price - t.entry_price) / t.entry_price;
    return sum + (t.direction === "long" ? 1 : -1) * movePct * t.size;
  }, 0);

  const liveBalance = (selectedAccount?.current_balance ?? 0) + unrealisedPnl;

  // An account only "passes" — and trading is only locked — when EVERY
  // milestone clears (profit target + daily loss + total loss + min trading
  // days + best-day cap). Locking on profit target alone stranded traders
  // who hit profit early but still owed e.g. minimum trading days, since
  // the on-chain claim would reject and they had no way to keep trading.
  const milestones = evaluateMilestones(selectedAccount, closedTrades, defaultRules);
  const accountPassed = milestones.allPassed;

  // Rolling 24h open/high/low from Pyth Benchmarks (the live SSE feed only
  // carries a spot price). Blend the extremes with the live price so they're
  // current to the tick; fall back to the live ticker's session values if the
  // Benchmarks fetch hasn't landed yet.
  const stats24h = use24hStats(symbol);
  const live24Price = ticker?.price ?? currentPrice ?? null;
  const open24h = stats24h?.open24h ?? ticker?.open24h ?? null;
  const high24h = stats24h
    ? Math.max(stats24h.high24h, live24Price ?? stats24h.high24h)
    : ticker?.high24h ?? null;
  const low24h = stats24h
    ? Math.min(stats24h.low24h, live24Price ?? stats24h.low24h)
    : ticker?.low24h ?? null;
  const change = open24h && live24Price
    ? ((live24Price - open24h) / open24h) * 100
    : 0;
  const isUp = change >= 0;
  const base = symbol.replace("USDT", "");

  // Small inline info wrapper. Uses a Popover (click/tap-to-open) instead of
  // a Tooltip so it works on touch devices — Radix tooltips are hover-only,
  // which leaves them unreachable on mobile.
  const Tip = ({ children, text }) => (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="bottom" className="max-w-[240px] text-xs text-center">{text}</PopoverContent>
    </Popover>
  );

  // Gate: whitelisted accounts require terms acceptance
  if (needsTermsAcceptance) {
    return <TermsAcceptanceGate variant="whitelist" walletAddress={address} onAccept={acceptTerms} />;
  }

  return (
    <TooltipProvider delayDuration={200}>
    <SEO title="Trading Terminal" noindex />
    <div className="terminal-shell relative isolate flex flex-col bg-background overflow-hidden h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 border-b border-border shrink-0 bg-card h-[52px]">
        {/* Back to dashboard */}
        <Link
          to={createPageUrl("TraderDashboard")}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 pr-1"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Asset dropdown with categories & market status */}
        <AssetDropdown
          pairs={pairs}
          symbol={symbol}
          onSelect={setSymbol}
        />

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Live price + 24h stats */}
        <div className="flex items-center gap-5 min-w-0 flex-1">
          <div className="flex items-baseline gap-2 shrink-0">
            <span
              className={`text-xl font-grotesk font-bold ${isUp ? "text-green-400" : "text-red-400"}`}
            >
              ${formatPrice(currentPrice)}
            </span>
            <Tip text="Change since today's UTC midnight open">
              <span
                className={`flex items-center gap-0.5 text-xs font-semibold cursor-default ${isUp ? "text-green-400" : "text-red-400"}`}
              >
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {isUp ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </Tip>
          </div>

          {high24h != null && low24h != null && (
            <div className="hidden lg:flex gap-5 text-xs text-muted-foreground whitespace-nowrap">
              <Tip text="Highest price in the last 24 hours">
                <span className="cursor-default">
                  24H H:{" "}
                  <span className="text-foreground">
                    ${formatPrice(high24h)}
                  </span>
                </span>
              </Tip>
              <Tip text="Lowest price in the last 24 hours">
                <span className="cursor-default">
                  24H L:{" "}
                  <span className="text-foreground">
                    ${formatPrice(low24h)}
                  </span>
                </span>
              </Tip>
            </div>
          )}
        </div>

        {/* Account selector + WS status */}
        <div className="flex items-center gap-3 shrink-0">
          {accounts.length > 0 && (
            <div className="relative hidden lg:block">
              <button
                onClick={() =>
                  accounts.length > 1 && setAccountDropdownOpen((d) => !d)
                }
                className="flex items-center gap-2 bg-secondary hover:bg-muted border border-border px-3 py-1.5 rounded-lg text-xs transition-colors"
              >
                <span className="text-muted-foreground">Account:</span>
                <span className="text-foreground font-semibold">
                  ${selectedAccount?.account_size?.toLocaleString() ?? "—"}
                </span>
                <span className="text-muted-foreground capitalize">
                  {selectedAccount?.phase?.replace("_", " ") ?? ""}
                </span>
                {accounts.length > 1 && (
                  <ChevronDown
                    className={`w-3 h-3 text-muted-foreground transition-transform ${accountDropdownOpen ? "rotate-180" : ""}`}
                  />
                )}
              </button>
              {accountDropdownOpen && accounts.length > 1 && (
                <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-lg shadow-2xl py-1 min-w-44 z-50">
                  {filterAccounts(tradableAccounts).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelectedAccountId(a.id);
                        setAccountDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-secondary ${a.id === selectedAccount?.id ? "text-primary font-semibold bg-primary/5" : "text-foreground"}`}
                    >
                      ${a.account_size?.toLocaleString()} —{" "}
                      {a.phase?.replace("_", " ")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="hidden lg:inline-flex">
            <OnChainStatus connected={connected} />
          </span>

          <PoolBadge className="hidden lg:inline-flex" />

          <div className="hidden sm:flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/25 rounded px-2 py-1 text-xs text-yellow-400 font-medium shrink-0">
            <AlertTriangle className="w-3 h-3" /> PAPER · SETTLEMENT ON-CHAIN
          </div>
        </div>
      </div>

      {/* ── Pool-backing ticker (desktop) ──────────────────────── */}
      {isDesktop && (
        <PoolTicker className="shrink-0 border-b border-border bg-card/40" walletAddress={address} />
      )}

      {/* ── Body ───────────────────────────────────────────────── */}
      {/* Desktop: resizable PanelGroup — chart top-left, tabs bottom-left,
          order entry right sidebar. Mobile: original chart/trade tab switch
          with a mini bottom panel embedded under the order form.
          isDesktop is a JS check, not just CSS — so only one of the two
          layouts is in the DOM at any time. */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── DESKTOP LAYOUT ──────────────────────────────────── */}
        {isDesktop && (
        <PanelGroup
          direction="horizontal"
          autoSaveId="terminal-horizontal"
          className="flex flex-1"
        >
          {/* Left: chart on top, tabs on bottom */}
          <Panel defaultSize={76} minSize={55}>
            <PanelGroup direction="vertical" autoSaveId="terminal-vertical">
              {/* Top: thin status band + chart */}
              <Panel defaultSize={70} minSize={30}>
                <div className="flex flex-col h-full">
                  {/* Thin status band — market status + compact balance */}
                  <div className="flex items-center border-b border-border bg-card/40 shrink-0 overflow-x-auto">
                    <AccountBalanceBar compact account={selectedAccount} openTrades={openTrades} />
                    <div className="ml-auto pr-3">
                      <MarketStatusBar symbol={symbol} />
                    </div>
                  </div>
                  {/* Chart */}
                  <div className="relative flex-1 overflow-hidden">
                    <CandlestickChart symbol={symbol} sl={slPrice} tp={tpPrice} position={selectedPosition} livePrice={currentPrice} onApplyPosition={handleApplyPosition} />
                    {accountPassed && (
                      <div className="absolute inset-x-0 top-0 z-20 bg-primary px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-primary-foreground shrink-0" />
                          <span className="font-semibold text-primary-foreground text-sm">
                            Account Passed —{" "}
                            {selectedAccount?.phase === "phase_1" ? "Claim Phase 2 Account" : "Claim Funded Account"}
                          </span>
                        </div>
                        <Link
                          to={createPageUrl("Claim")}
                          className="bg-primary-foreground text-primary px-3 py-1.5 rounded text-sm font-semibold hover:bg-primary-foreground/90 shrink-0"
                        >
                          Claim Now →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />

              {/* Bottom: tabbed positions / orders / history */}
              <Panel defaultSize={30} minSize={10}>
                <TerminalBottomPanel
                  account={selectedAccount}
                  apiSecret={apiSecret}
                  currentSymbol={displaySymbol}
                  openTrades={openTrades}
                  pendingOrders={pendingOrders}
                  refreshKey={positionRefresh}
                  selectedPositionId={selectedPosition?.id}
                  onSelectPosition={setSelectedPositionId}
                  onPositionClosed={() => { loadOpenTrades(); loadAccounts(); }}
                  onOrderCancelled={() => setPositionRefresh(k => k + 1)}
                  tabsToShow={["positions", "orders", "history"]}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* Right: order entry sidebar */}
          <Panel defaultSize={24} minSize={19} maxSize={36}>
            <div className="h-full overflow-y-auto bg-card/30 p-4">
              {accountPassed ? (
                <div className="flex flex-col items-center justify-center text-center my-4 p-4 rounded-lg bg-primary/5 border border-primary/30 space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                  <p className="text-sm font-semibold text-primary">Account Passed — Ready to Claim</p>
                  <p className="text-xs text-muted-foreground">
                    You've met every requirement. Close any open positions, then claim to lock in your{" "}
                    {selectedAccount?.phase === "phase_1" ? "Phase 2" : "Funded"} account. Until you claim, the account stays live and the daily/total loss limits still apply.
                  </p>
                  <Link
                    to={createPageUrl("Claim")}
                    className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold text-center"
                  >
                    {selectedAccount?.phase === "phase_1" ? "Claim Phase 2 Account" : "Claim Funded Account"}
                  </Link>
                </div>
              ) : (
                <>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Place Order
                  </h3>
                  <OrderPanel
                    symbol={symbol}
                    currentPrice={currentPrice}
                    account={selectedAccount}
                    apiSecret={apiSecret}
                    openTrades={openTrades}
                    pendingOrders={pendingOrders}
                    externalReserved={zoneReserved}
                    onOrderPlaced={() => setPositionRefresh((k) => k + 1)}
                    onSLTPChange={(sl, tp) => { setSlPrice(sl); setTpPrice(tp); }}
                    appliedSetup={appliedSetup}
                    selectedPositionId={selectedPosition?.id}
                    onSelectPosition={setSelectedPositionId}
                  />
                </>
              )}
              <MarketDataPanel symbol={symbol} />
              <div className="mt-4 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-yellow-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Simulated Trading</p>
                <p>All positions use simulated capital. No real funds are at risk.</p>
                <p>Risk limits: <span className="text-foreground">{defaultRules?.maxDailyLoss ?? 5}% max daily loss · {defaultRules?.maxTotalLoss ?? 10}% max total drawdown</span>. Breaching either limit fails your challenge.</p>
              </div>
            </div>
          </Panel>
        </PanelGroup>
        )}

        {/* ── MOBILE LAYOUT ───────────────────────────────────── */}
        {/* Only one of chart/trade is rendered at a time so there's no
            possibility of both flex children showing side by side. */}
        {!isDesktop && (
        <div className="flex flex-1 overflow-hidden">
          {mobileTab === "account" ? (
            !address ? (
              <div className="flex flex-col items-center justify-center text-center w-full p-8 gap-3">
                <Wallet className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">Not signed in</p>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  Connect your wallet to view your challenge accounts, balances, and live P&amp;L.
                </p>
              </div>
            ) : filterAccounts(tradableAccounts).length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center w-full p-8 gap-3">
                <Wallet className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">No challenge accounts</p>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  Start a challenge to begin trading and tracking your account here.
                </p>
                <Link
                  to={createPageUrl("TraderDashboard")}
                  className="mt-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  Go to Dashboard
                </Link>
              </div>
            ) : (
            <div className="flex flex-col w-full overflow-y-auto p-4 space-y-4">
              {/* Account selector — dropdown so the rule dials fit on screen */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {accounts.length > 1 ? "Switch Account" : "Account"}
                </h3>
                {accounts.length > 1 ? (
                  <div className="relative">
                    <select
                      value={selectedAccount?.id || ""}
                      onChange={(e) => { haptic(); setSelectedAccountId(e.target.value); }}
                      className="w-full appearance-none bg-secondary/40 border border-border rounded-lg pl-3 pr-9 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {filterAccounts(tradableAccounts).map((a) => (
                        <option key={a.id} value={a.id}>
                          ${a.account_size?.toLocaleString() ?? "—"} — {a.phase?.replace("_", " ") ?? ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                ) : (
                  <div className="px-3 py-2.5 rounded-lg border border-border bg-secondary/40">
                    <div className="text-sm font-bold text-foreground">
                      ${selectedAccount?.account_size?.toLocaleString() ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {selectedAccount?.phase?.replace("_", " ") ?? ""}
                    </div>
                  </div>
                )}
              </div>

              {/* Live account metrics */}
              <AccountBalanceBar account={selectedAccount} openTrades={openTrades} />

              {/* Challenge rule progress (mirrors the trader hub) — dials */}
              <RuleGauges
                dial
                account={selectedAccount}
                liveBalance={selectedAccount?.current_balance}
                tradingDaysCount={selectedAccount?.trading_days_count}
                trades={closedTrades}
              />
            </div>
            )
          ) : mobileTab === "trade" ? (
            <div className="flex flex-col w-full overflow-hidden">
              {/* Order form fills the available height */}
              <div className="flex-1 min-h-0 overflow-y-auto bg-card/30 p-4">
                <MarketStatusBar symbol={symbol} />
                <AccountBalanceBar account={selectedAccount} openTrades={openTrades} />
                {accountPassed ? (
                  <div className="flex flex-col items-center justify-center text-center my-4 p-4 rounded-lg bg-primary/5 border border-primary/30 space-y-3">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                    <p className="text-sm font-semibold text-primary">Account Passed — Ready to Claim</p>
                    <p className="text-xs text-muted-foreground">
                      Close any open positions, then claim to lock in your account. Until you claim, the loss limits still apply.
                    </p>
                    <Link
                      to={createPageUrl("Claim")}
                      className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold text-center"
                    >
                      {selectedAccount?.phase === "phase_1" ? "Claim Phase 2 Account" : "Claim Funded Account"}
                    </Link>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Place Order
                    </h3>
                    <OrderPanel
                      symbol={symbol}
                      currentPrice={currentPrice}
                      account={selectedAccount}
                      apiSecret={apiSecret}
                      openTrades={openTrades}
                      pendingOrders={pendingOrders}
                      externalReserved={zoneReserved}
                      onOrderPlaced={() => setPositionRefresh((k) => k + 1)}
                      onSLTPChange={(sl, tp) => { setSlPrice(sl); setTpPrice(tp); }}
                    appliedSetup={appliedSetup}
                    selectedPositionId={selectedPosition?.id}
                    onSelectPosition={setSelectedPositionId}
                    />
                  </>
                )}
              </div>
              {/* Collapsible positions/orders drawer — slides up over the form */}
              <div className={`shrink-0 border-t border-border bg-card flex flex-col overflow-hidden transition-[height] duration-300 ease-out ${mobilePositionsOpen ? "h-[62%]" : "h-11"}`}>
                <button
                  onClick={() => { haptic(); setMobilePositionsOpen(o => !o); }}
                  className="flex items-center justify-between px-4 h-11 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  aria-expanded={mobilePositionsOpen}
                >
                  <span className="flex items-center gap-1.5">
                    Positions
                    {openTrades.length > 0 && <span className="text-primary">({openTrades.length})</span>}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobilePositionsOpen ? "" : "rotate-180"}`} />
                </button>
                {mobilePositionsOpen && (
                  <div className="flex-1 min-h-0 overflow-hidden border-t border-border">
                    <TerminalBottomPanel
                      account={selectedAccount}
                      apiSecret={apiSecret}
                      currentSymbol={displaySymbol}
                      openTrades={openTrades}
                      pendingOrders={pendingOrders}
                      refreshKey={positionRefresh}
                      selectedPositionId={selectedPosition?.id}
                      onSelectPosition={setSelectedPositionId}
                      onPositionClosed={() => { loadOpenTrades(); loadAccounts(); }}
                      onOrderCancelled={() => setPositionRefresh(k => k + 1)}
                      tabsToShow={["positions", "orders", "history"]}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col flex-1 min-w-0">
              <CandlestickChart symbol={symbol} sl={slPrice} tp={tpPrice} position={selectedPosition} livePrice={currentPrice} onApplyPosition={handleApplyPosition} />
              {accountPassed && (
                <div className="absolute inset-x-0 top-0 z-20 bg-primary px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary-foreground shrink-0" />
                    <span className="font-semibold text-primary-foreground text-sm">
                      Account Passed
                    </span>
                  </div>
                  <Link to={createPageUrl("Claim")} className="bg-primary-foreground text-primary px-3 py-1.5 rounded text-sm font-semibold">
                    Claim →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Mobile bottom tab bar ──────────────────────────────── */}
      {!isDesktop && (
      <div className="flex items-stretch shrink-0 border-t border-border bg-card" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Chart tab */}
        <button
          onClick={() => { haptic(); setMobileTab("chart"); }}
          className={`flex flex-1 flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${mobileTab === "chart" ? "text-primary" : "text-muted-foreground"}`}
        >
          <BarChart2 className="w-5 h-5" />
          Chart
        </button>

        {/* Trade tab */}
        <button
          onClick={() => { haptic(); setMobileTab("trade"); }}
          className={`flex flex-1 flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${mobileTab === "trade" ? "text-primary" : "text-muted-foreground"}`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          Trade
        </button>

        {/* Account tab */}
        <button
          onClick={() => { haptic(); setMobileTab("account"); }}
          className={`flex flex-1 flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${mobileTab === "account" ? "text-primary" : "text-muted-foreground"}`}
        >
          <Wallet className="w-5 h-5" />
          Account
        </button>
      </div>
      )}

      <TerminalFooter connected={connected} />
    </div>
    </TooltipProvider>
  );
}
