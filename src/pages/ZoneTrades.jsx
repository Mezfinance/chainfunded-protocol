import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";

import { base44 } from "@/api/base44Client";
import { syncAccount } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { usePrices, useRegisterSymbols } from "@/lib/PriceContext";
import { getAssetConfig, toPriceFeedSymbol, ensureTradablePairs, DEFAULT_TRADABLE_PAIRS } from "@/lib/assetConfig";
import { placeZoneTrade, fetchZoneHistory, exitZoneTrade, zoneBuyout } from "@/lib/zoneTrades";
import { useZoneAccess } from "@/hooks/useZoneAccess";

import AccountSelector from "@/components/trader/AccountSelector";
import AssetDropdown from "@/components/trader/AssetDropdown";
import ZoneAccountBar from "@/components/games/ZoneAccountBar";
import ZoneChart from "@/components/games/ZoneChart";
import ZoneHistoricalChart from "@/components/games/ZoneHistoricalChart";
import ZoneWinModal from "@/components/games/ZoneWinModal";
import ZoneTradePanel from "@/components/games/ZoneTradePanel";
import ZoneActiveCard from "@/components/games/ZoneActiveCard";
import ZonePayoutLadder from "@/components/games/ZonePayoutLadder";
import ZoneQuickFire from "@/components/games/ZoneQuickFire";
import ZoneActivePositions from "@/components/games/ZoneActivePositions";
import ZoneHistory from "@/components/games/ZoneHistory";
import { playWin, playLoss } from "@/lib/sfx";

export default function ZoneTrades() {
  const { address, isAuthenticated } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [apiSecret, setApiSecret] = useState(null);
  // Seed with the static default list so the dropdown always has assets even
  // if base44's TradablePair query fails / returns empty / returns all-disabled.
  // The effect below refreshes from base44 on success.
  const [pairs, setPairs] = useState(() => DEFAULT_TRADABLE_PAIRS.filter((p) => p.enabled !== false));
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [bets, setBets] = useState([]);
  const [reserved, setReserved] = useState(0);
  const [openTrades, setOpenTrades] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [winModal, setWinModal] = useState(null);
  const [exiting, setExiting] = useState(null); // bet id being exited (disables EXIT button)

  const displaySymbol = getAssetConfig(symbol)?.display_name || symbol;

  // Pass the viewed pair so the worker warms σ for it on demand — re-warms
  // when the user switches. Display form ("BTC/USDT") is what the worker
  // expects; canonicalisation happens server-side.
  const { config, allowed, loading: accessLoading } = useZoneAccess(address, displaySymbol);

  const tradableAccounts = accounts.filter(
    (a) => a.phase !== "failed" && a.phase !== "paid_out"
  );
  const selectedAccount =
    tradableAccounts.find((a) => a.id === selectedAccountId) ?? tradableAccounts[0] ?? null;

  const durations = config?.durations?.length ? config.durations : [Math.round((config?.durationMs ?? 60000) / 1000)];
  const durationLabel = durations.length > 1
    ? `${durations[0]}–${durations[durations.length - 1]}s`
    : `${durations[0]}s`;
  const feedSymbol = toPriceFeedSymbol(displaySymbol);
  // Register the viewed pair AND every open-position symbol so unrealised P&L
  // can be priced live for the drawdown estimate.
  const openSymbols = [...new Set(openTrades.map((t) => toPriceFeedSymbol(t.symbol)).filter(Boolean))];
  useRegisterSymbols([feedSymbol, ...openSymbols]);
  const { getPrice } = usePrices();
  const currentPrice = getPrice(feedSymbol);

  // Unrealised P&L across the account's open positions, priced live. Matches
  // the worker: (live − entry)/entry × size, signed by direction. Symbols with
  // no live price contribute 0 (same as the worker).
  const unrealisedPnl = openTrades.reduce((sum, t) => {
    if (!t.entry_price || !t.size) return sum;
    const live = getPrice(toPriceFeedSymbol(t.symbol));
    if (live == null) return sum;
    return sum + (t.direction === "long" ? 1 : -1) * ((live - t.entry_price) / t.entry_price) * t.size;
  }, 0);

  // ── Load accounts ─────────────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    if (!address) return;
    try {
      const data = await base44.entities.ChallengeAccount.filter(
        { trader_address: address },
        "-created_date"
      );
      const accs = Array.isArray(data) ? data : [];
      setAccounts(accs);
      setSelectedAccountId((prev) => prev ?? accs.find((a) => a.phase !== "failed" && a.phase !== "paid_out")?.id ?? null);
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // ── Load open positions + pending orders ────────────────────────────────────
  // Open trades → unrealised P&L (drawdown estimate). Open + pending → margin
  // in use, so zone stake only draws on genuinely free capital (mirrors the
  // worker's availableBalance).
  const loadPositions = useCallback(async () => {
    if (!selectedAccount?.id) { setOpenTrades([]); setPendingOrders([]); return; }
    try {
      const [open, pending] = await Promise.all([
        base44.entities.Trade.filter({ account_id: selectedAccount.id, status: "open" }),
        base44.entities.Trade.filter({ account_id: selectedAccount.id, status: "pending" }),
      ]);
      setOpenTrades(Array.isArray(open) ? open : []);
      setPendingOrders(Array.isArray(pending) ? pending : []);
    } catch { /* ignore */ }
  }, [selectedAccount?.id]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  // ── Tradable pairs (seed defaults on first load) ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await ensureTradablePairs(base44.entities.TradablePair);
        const enabled = data.filter((p) => p.enabled);
        if (enabled.length > 0) setPairs(enabled);
      } catch { /* defaults */ }
    })();
  }, []);

  // ── Ensure api_secret for the active account (mirrors TradingTerminal) ──────
  useEffect(() => {
    if (!selectedAccount?.id) { setApiSecret(null); return undefined; }
    if (selectedAccount.api_secret) { setApiSecret(selectedAccount.api_secret); return undefined; }
    let cancelled = false;
    (async () => {
      const candidate = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try { await base44.entities.ChallengeAccount.update(selectedAccount.id, { api_secret: candidate }); } catch { /* ignore */ }
      let secret = candidate;
      try {
        const matches = await base44.entities.ChallengeAccount.filter({ id: selectedAccount.id });
        const fresh = Array.isArray(matches) ? matches[0] : null;
        if (fresh?.api_secret) secret = fresh.api_secret;
      } catch { /* ignore */ }
      if (cancelled) return;
      setApiSecret(secret);
      syncAccount(selectedAccount.id, { api_secret: secret });
    })();
    return () => { cancelled = true; };
  }, [selectedAccount?.id, selectedAccount?.api_secret]);

  // ── Bet history + balance polling ───────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!selectedAccount?.id || !apiSecret) return;
    try {
      const { bets: rows, reserved: r } = await fetchZoneHistory({
        account_id: selectedAccount.id,
        api_secret: apiSecret,
      });
      setBets(rows || []);
      setReserved(r || 0);
    } catch { /* ignore */ }
  }, [selectedAccount?.id, apiSecret]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while there are pending bets so settlements + balance show promptly.
  const hasPending = bets.some((b) => b.status === "pending");
  useEffect(() => {
    if (!selectedAccount?.id) return undefined;
    const id = setInterval(() => {
      refresh();
      loadAccounts();
      loadPositions();
    }, hasPending ? 3000 : 15000);
    return () => clearInterval(id);
  }, [selectedAccount?.id, hasPending, refresh, loadAccounts, loadPositions]);

  // ── Win/loss message on settlement ──────────────────────────────────────────
  // Fire a celebratory/commiserating toast when a bet we saw pending flips to a
  // settled status. prevPending starts empty, so historical settled bets on
  // first load don't trigger anything.
  const prevPendingRef = useRef(new Set());
  const announcedRef = useRef(new Set());
  useEffect(() => {
    for (const b of bets) {
      const settled = b.status === "win" || b.status === "loss" || b.status === "refund";
      if (settled && prevPendingRef.current.has(b.id) && !announcedRef.current.has(b.id)) {
        announcedRef.current.add(b.id);
        const dir = (b.direction || "").toUpperCase();
        const amt = Math.abs(Number(b.pnl) || 0).toFixed(2);
        if (b.status === "win") {
          setWinModal({ amount: amt, symbol: b.symbol, direction: dir });
          playWin();
        } else if (b.status === "loss") {
          playLoss();
          toast.error(`Trade closed −$${amt}`, {
            description: `${b.symbol} ${dir} moved against you. Line up the next one.`,
            duration: 7000,
          });
        } else {
          toast(`Trade closed flat`, {
            description: `${b.symbol} ended at your entry — no P&L.`,
            duration: 5000,
          });
        }
      }
    }
    prevPendingRef.current = new Set(bets.filter((b) => b.status === "pending").map((b) => b.id));
  }, [bets]);

  // ── Place a bet ─────────────────────────────────────────────────────────────
  const handlePlace = async (direction, stake, durationSec) => {
    if (!selectedAccount?.id || !apiSecret) {
      toast.error("Account not ready — please try again");
      return;
    }
    const dur = durationSec ?? config?.defaultDurationSec ?? Math.round((config?.durationMs ?? 60000) / 1000);
    try {
      const bet = await placeZoneTrade({
        account_id: selectedAccount.id,
        api_secret: apiSecret,
        symbol: displaySymbol,
        direction,
        stake,
        duration_sec: dur,
      });
      toast.success(`${direction.toUpperCase()} position opened`, {
        description: `${displaySymbol} · $${stake} · settles in ${dur}s`,
      });
      setBets((prev) => [bet, ...prev]);
      setReserved((r) => r + Number(stake));
    } catch (err) {
      toast.error("Could not open position", { description: err.message });
    }
  };

  // ── Early exit (cash out a live bet) ────────────────────────────────────────
  const handleExit = async (betId) => {
    if (!selectedAccount?.id || !apiSecret) return;
    setExiting(betId);
    try {
      const settled = await exitZoneTrade({
        account_id: selectedAccount.id,
        api_secret: apiSecret,
        bet_id: betId,
      });
      // Mark this bet as already announced so the settlement watcher doesn't
      // also fire a win/loss toast for the cash-out.
      announcedRef.current.add(betId);
      const pnl = Number(settled?.pnl) || 0;
      toast.success(`Cashed out ${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`, {
        description: `${settled?.symbol || ""} exited early.`,
      });
      refresh();
      loadAccounts();
    } catch (err) {
      toast.error("Could not exit position", { description: err.message });
      refresh();
    } finally {
      setExiting(null);
    }
  };

  // Available = current balance minus margin committed to open positions and
  // pending orders, minus stake reserved across live zone bets. Mirrors the
  // worker's availableBalance so zone stake only uses genuinely free capital.
  const marginOf = (t) => (t.leverage > 0 ? (t.size || 0) / t.leverage : (t.size || 0));
  const marginInUse =
    openTrades.reduce((s, t) => s + marginOf(t), 0) +
    pendingOrders.reduce((s, t) => s + marginOf(t), 0);
  const available = Math.max(0, (selectedAccount?.current_balance ?? 0) - marginInUse - reserved);

  // Aggregate live-stake cap: total in-flight zone stake is limited to
  // maxStakePct of the starting balance (not per-bet) so bets can't be stacked
  // in one 60s window to wager the whole account. maxStake = headroom left.
  const startBal = selectedAccount?.starting_balance ?? selectedAccount?.account_size ?? selectedAccount?.current_balance ?? 0;
  const aggCap = Math.min(config?.maxStakeAbs ?? Infinity, (config?.maxStakePct ?? 0.01) * startBal);
  const maxStake = Math.max(0, Math.min(aggCap - reserved, available));

  // Drawdown context so the panel can warn when a losing bet would fail the
  // account (mirrors the worker's breach math). currentBal is LIVE equity —
  // realised balance plus unrealised P&L from open positions — so an open
  // losing position correctly tightens the warning threshold.
  const drawdown = selectedAccount ? {
    startBal,
    currentBal: (selectedAccount.current_balance ?? 0) + unrealisedPnl,
    dayStart: selectedAccount.day_start_balance ?? selectedAccount.current_balance ?? startBal,
    dailyPct: selectedAccount.max_daily_loss_pct ?? 5,
    totalPct: selectedAccount.max_total_loss_pct ?? 10,
  } : null;

  // Soonest-expiring pending bet on the current symbol drives the right-sidebar
  // ActiveCard + the chart's countdown ring + the ladder's current-row highlight.
  const focusedBet = bets
    .filter((b) => b.status === "pending" && b.symbol === displaySymbol)
    .sort((a, b) => new Date(a.settle_at) - new Date(b.settle_at))[0] || null;
  const focusedQuote = focusedBet && currentPrice != null
    ? zoneBuyout(focusedBet, currentPrice, config)
    : null;
  const currentLadderRow = focusedQuote
    ? `${focusedQuote.zone}${focusedQuote.pnl >= 0 ? "Win" : "Loss"}`
    : null;

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <Zap className="w-10 h-10 text-primary mx-auto mb-4" />
        <h1 className="font-grotesk text-2xl font-bold text-foreground mb-2">Zone Trading</h1>
        <p className="text-muted-foreground">Connect your wallet to play with a funded account.</p>
      </div>
    );
  }

  // Feature gate — hidden unless the worker says this wallet is allowed.
  if (!accessLoading && !allowed) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-grotesk text-2xl font-bold text-foreground mb-2">Zone Trading</h1>
        <p className="text-muted-foreground">This feature isn't available for your account yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
      <ZoneWinModal
        open={!!winModal}
        amount={winModal?.amount}
        symbol={winModal?.symbol}
        direction={winModal?.direction}
        onClose={() => setWinModal(null)}
      />

      {/* Header strip */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="font-grotesk text-2xl font-bold text-foreground">Zone Trading</h1>
          <span className="ml-2 font-mono text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {durationLabel} · sticky knockout
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Asset picker sits left of the account selector — both anchor
              the centre/right of the header so the trade context (which
              instrument, which account) reads as one tight group. The asset
              picker shows even without an account so prospective traders can
              browse the live chart before buying a challenge. */}
          <AssetDropdown pairs={pairs} symbol={symbol} onSelect={setSymbol} />
          {tradableAccounts.length > 0 && (
            <AccountSelector
              accounts={tradableAccounts}
              selectedId={selectedAccount?.id}
              onSelect={setSelectedAccountId}
            />
          )}
        </div>
      </div>

      {/* Allowlisted wallets can view the page even without a challenge/funded
          account — the chart, payout ladder and live bands all render. Only the
          trade action is gated: the panel greys its Up/Down buttons and shows a
          "Buy a Challenge to Zone Trade" CTA. */}
      <>
          {/* Account ticker — full width, one line. Hidden until the viewer has
              an account to trade with. */}
          {selectedAccount && (
            <div className="mb-4">
              <ZoneAccountBar
                compact
                account={selectedAccount}
                unrealisedPnl={unrealisedPnl}
                marginInUse={marginInUse}
                reserved={reserved}
                available={available}
                drawdown={drawdown}
              />
            </div>
          )}

          {/* HERO: chart + sidebar.
              Source order is sidebar→chart so mobile sees the action card first
              (Tailwind `order-*` flips them on lg+ to chart-left / sidebar-right). */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-3 order-1 lg:order-2">
              {focusedBet ? (
                <ZoneActiveCard
                  bet={focusedBet}
                  livePrice={currentPrice}
                  config={config}
                  onExit={handleExit}
                  exiting={exiting}
                />
              ) : (
                <ZoneTradePanel
                  variant="panel"
                  symbol={symbol}
                  displaySymbol={displaySymbol}
                  currentPrice={currentPrice}
                  config={config}
                  available={available}
                  maxStake={maxStake}
                  perTradeCap={aggCap}
                  drawdown={drawdown}
                  disabled={!apiSecret || tradableAccounts.length === 0}
                  noAccount={tradableAccounts.length === 0}
                  onPlace={handlePlace}
                />
              )}
              <ZonePayoutLadder
                bet={focusedBet}
                currentRow={currentLadderRow}
                config={config}
                symbol={displaySymbol}
              />
            </div>

            <div className="col-span-12 lg:col-span-8 xl:col-span-9 order-2 lg:order-1 space-y-3">
              {/* Historical context — last 20 mins of 1m candles from Pyth,
                  refreshes each minute. Sits above the live Zone chart so
                  traders can read recent price action before they decide. */}
              <ZoneHistoricalChart symbol={symbol} displaySymbol={displaySymbol} />
              <ZoneChart symbol={symbol} displaySymbol={displaySymbol} bets={bets} config={config} onExit={handleExit} />
            </div>
          </div>

          {/* QuickFire — pre-fills the next trade so the trader can press their
              luck while the current one finishes. Only when something is live. */}
          {focusedBet && (
            <div className="mt-4">
              <ZoneQuickFire
                focusedBet={focusedBet}
                config={config}
                available={available}
                maxStake={maxStake}
                drawdown={drawdown}
                disabled={!apiSecret}
                onPlace={handlePlace}
              />
            </div>
          )}

          {/* Other positions (different symbol than the focused one) */}
          <div className="mt-4">
            <ZoneActivePositions bets={bets} getPrice={getPrice} config={config} onExit={handleExit} excludeSymbol={displaySymbol} />
          </div>

          {/* Collapsible history */}
          <details className="mt-4 rounded-xl border border-border bg-card">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-foreground">
              History &amp; open positions
            </summary>
            <div className="px-4 pb-4">
              <ZoneHistory bets={bets} getPrice={getPrice} config={config} />
            </div>
          </details>
        </>
    </div>
  );
}
