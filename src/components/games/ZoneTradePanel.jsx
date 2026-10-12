import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BoltLoader from "@/components/brand/BoltLoader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel } from "@/components/ui/alert-dialog";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

/**
 * ZoneTradePanel — place an Up/Down Zone trade.
 *
 * The strike is captured server-side at placement (authoritative Pyth price),
 * so the price shown here is indicative only. Payout is staircase by zone:
 * Near ±25%, Mid ±50%, Far/KO +85% win / −100% loss. The first touch of
 * either Far barrier settles the trade instantly (sticky knockout); below the
 * KO line, early-exit pays the current zone's value.
 */
export default function ZoneTradePanel({
  symbol,
  displaySymbol,
  currentPrice,
  config,
  available,
  maxStake,
  perTradeCap,
  drawdown,
  disabled,
  noAccount = false,
  onPlace,
  variant = "panel" }) {
  const [stake, setStake] = useState("");
  const [side, setSide] = useState(null); // 'up' | 'down'
  const [submitting, setSubmitting] = useState(false);
  const [confirmDir, setConfirmDir] = useState(null); // direction awaiting confirmation
  const [ack, setAck] = useState(false);
  const [durSec, setDurSec] = useState(null); // user-selected hold window

  useEffect(() => { setSide(null); }, [symbol]);

  const durations = (config?.durations?.length ? config.durations : [Math.round((config?.durationMs ?? 60000) / 1000)]);
  const durationSec = durSec ?? config?.defaultDurationSec ?? durations[0] ?? 60;
  const pay = config?.zone?.pay || {
    nearWin: 0.2125, nearLoss: 0.25,
    midWin:  0.425,  midLoss:  0.50,
    koWin:   0.85,   koLoss:   1.00 };
  const minStake = config?.minStake ?? 1;
  // Binding cap on this position: the aggregate live-margin headroom from the
  // page (falls back to available balance if not supplied).
  const cap = maxStake != null ? maxStake : Math.min(config?.maxStakeAbs ?? Infinity, available ?? Infinity);

  const pctLabel = `${+( (config?.maxStakePct ?? 0.01) * 100).toFixed(2)}%`;
  const amount = parseFloat(stake) || 0;
  const overCap = amount > cap + 1e-9;
  const validStake = amount >= minStake && amount <= cap;

  // Would a LOSS of this stake breach the account's drawdown (and fail it)?
  // Mirrors the worker's breach check: total from starting balance, daily from
  // the day's opening balance, both measured against the post-loss equity.
  const breach = (() => {
    const dd = drawdown;
    if (!dd || !(dd.startBal > 0) || amount <= 0) return null;
    const after = dd.currentBal - amount;
    const totalLossPct = Math.max(0, ((dd.startBal - after) / dd.startBal) * 100);
    const dailyLossPct = Math.max(0, ((dd.dayStart - after) / dd.startBal) * 100);
    const total = totalLossPct >= dd.totalPct;
    const daily = dailyLossPct >= dd.dailyPct;
    if (!total && !daily) return null;
    return { total, daily };
  })();

  const setPct = (pct) => {
    const v = Math.floor(cap * pct * 100) / 100;
    setStake(v > 0 ? String(v) : "");
  };

  // Actually submit the bet (after confirmation if it was required).
  const submit = async (direction) => {
    if (!validStake || submitting || disabled) return;
    setSide(direction);
    setSubmitting(true);
    try {
      await onPlace(direction, amount, durationSec);
      setStake("");
    } finally {
      setSubmitting(false);
      setSide(null);
    }
  };

  // UP/DOWN click: if a loss would fail the account, require explicit
  // acknowledgement first; otherwise place immediately.
  const place = (direction) => {
    if (!validStake || submitting || disabled) return;
    if (breach) { setAck(false); setConfirmDir(direction); return; }
    submit(direction);
  };

  const confirmPlace = () => {
    const dir = confirmDir;
    setConfirmDir(null);
    if (dir) submit(dir);
  };

  // ── Shared pieces (used by both layouts) ────────────────────────────────────
  const breachWord = breach
    ? (breach.daily && breach.total ? "daily and total" : breach.daily ? "daily" : "total")
    : "";

  const cautionBanner = breach && validStake ? (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <p className="text-xs text-red-300">
        Caution: if this trade loses, it will breach your {breachWord} drawdown limit and{" "}
        <span className="font-semibold">fail this account.</span>
      </p>
    </div>
  ) : null;

  const disabledMsg = noAccount ? (
    <Link to={createPageUrl("Onboarding")} className="block">
      <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-grotesk font-semibold">
        Buy a Challenge to Zone Trade
      </Button>
    </Link>
  ) : disabled ? (
    <p className="text-[11px] text-yellow-400/80 text-center">
      Account not eligible — Zone Trading requires an active challenge or funded account.
    </p>
  ) : null;

  const confirmDialog = (
    <AlertDialog open={confirmDir != null} onOpenChange={(o) => { if (!o) setConfirmDir(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            This trade could fail your account
          </AlertDialogTitle>
          <AlertDialogDescription>
            You're risking{" "}
            <span className="font-semibold text-foreground">
              ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>{" "}
            {confirmDir?.toUpperCase()} on {displaySymbol}. If it loses, your account will breach its{" "}
            {breachWord} drawdown limit and be <span className="font-semibold text-red-400">failed</span> —
            this cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <label className="flex items-start gap-2 cursor-pointer py-1">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
          <span className="text-sm text-muted-foreground">
            I understand this trade could fail my account if it loses.
          </span>
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmDir(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ack}
            onClick={confirmPlace}
            className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
          >
            Place trade anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Zone payouts as $ amounts when a stake is entered, otherwise percentages.
  // Bands map left-to-right Far(loss) → Mid(loss) → Near(loss/win) → Mid(win) → Far(win)
  // — same ordering the chart uses, so the eye picks it up instantly.
  const fmt = (frac, sign) => {
    if (amount > 0) return `${sign}$${(amount * frac).toFixed(2)}`;
    const decimals = frac < 0.3 ? 2 : frac < 0.5 ? 1 : 0;
    return `${sign}${(frac * 100).toFixed(decimals)}%`;
  };
  // 6-cell ladder — losses on the left half, wins on the right. Wins pay a 15%
  // haircut vs the loss base (Near −25/+21.25, Mid −50/+42.5, KO −100/+85).
  const zoneLadder = (
    <div className="grid grid-cols-6 gap-1 text-[10px] font-mono">
      <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-300 px-2 py-1 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">KO loss</div>
        <div>{fmt(pay.koLoss, "−")}</div>
      </div>
      <div className="rounded-md border border-red-500/25 bg-red-500/5 text-red-300/90 px-2 py-1 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Mid loss</div>
        <div>{fmt(pay.midLoss, "−")}</div>
      </div>
      <div className="rounded-md border border-red-500/15 bg-red-500/5 text-red-300/80 px-2 py-1 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Near loss</div>
        <div>{fmt(pay.nearLoss, "−")}</div>
      </div>
      <div className="rounded-md border border-green-500/15 bg-green-500/5 text-green-300/80 px-2 py-1 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Near win</div>
        <div>{fmt(pay.nearWin, "+")}</div>
      </div>
      <div className="rounded-md border border-green-500/25 bg-green-500/5 text-green-300/90 px-2 py-1 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Mid win</div>
        <div>{fmt(pay.midWin, "+")}</div>
      </div>
      <div className="rounded-md border border-green-500/40 bg-green-500/10 text-green-300 px-2 py-1 text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">KO win</div>
        <div>{fmt(pay.koWin, "+")}</div>
      </div>
    </div>
  );

  const durationSelector = durations.length > 1 ? (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Duration</span>
        <span className="text-muted-foreground">sticky knockout at ±T2</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
        {durations.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDurSec(d)}
            className={`rounded-md border py-1 text-[11px] transition-colors ${
              d === durationSec
                ? "border-primary text-foreground bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            {d}s
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const presets = (
    <div className="grid grid-cols-4 gap-1">
      {[0.1, 0.25, 0.5, 1].map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPct(p)}
          className="rounded-md border border-border py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          {p === 1 ? "Max" : `${p * 100}%`}
        </button>
      ))}
    </div>
  );

  const stakeInputCls = `w-full rounded-lg bg-secondary/40 border px-3 py-2 font-mono text-foreground focus:outline-none focus:ring-1 ${
    overCap ? "border-red-500/60 focus:ring-red-500" : "border-border focus:ring-primary"
  }`;

  // ── Action-bar layout (entry strip hugging the chart) ───────────────────────
  if (variant === "bar") {
    return (
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        {cautionBanner}
        {durationSelector}
        {zoneLadder}
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          {/* Stake + presets */}
          <div className="sm:w-52 shrink-0 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Stake (USDC)</span>
              <span className={overCap ? "text-red-400" : "text-muted-foreground"}>
                Max ${cap.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <input
              type="number"
              inputMode="decimal"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder={`Min $${minStake}`}
              className={stakeInputCls}
            />
            {presets}
            <p className="text-[10px] text-muted-foreground">
              Zone payout · max loss = stake · max {pctLabel}/trade
            </p>
          </div>
          {/* UP / DOWN — big, fill the rest */}
          <Button
            onClick={() => place("up")}
            disabled={!validStake || disabled || submitting}
            className="flex-1 min-h-[76px] bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 font-grotesk text-lg font-bold"
          >
            {submitting && side === "up" ? <BoltLoader className="w-6 h-6" /> : <><TrendingUp className="w-6 h-6 mr-2" /> Up</>}
          </Button>
          <Button
            onClick={() => place("down")}
            disabled={!validStake || disabled || submitting}
            className="flex-1 min-h-[76px] bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 font-grotesk text-lg font-bold"
          >
            {submitting && side === "down" ? <BoltLoader className="w-6 h-6" /> : <><TrendingDown className="w-6 h-6 mr-2" /> Down</>}
          </Button>
        </div>
        {disabledMsg}
        {confirmDialog}
      </div>
    );
  }

  // ── Default vertical panel ──────────────────────────────────────────────────
  // Tightened composer: the chart's strike-line + prospective bands now
  // visually explain "higher or lower in N seconds", and the sidebar's
  // ZonePayoutLadder shows the per-zone amounts — so we drop both the wordy
  // header and the inline payout chips here.
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{displaySymbol}</p>
          <p className="font-grotesk text-sm font-semibold text-foreground whitespace-nowrap">Place a zone trade</p>
        </div>
        <div className="text-right min-w-[120px] shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live</p>
          {/* Lock the price string width: fixed decimals (min == max) by
              magnitude so tick-to-tick changes don't reflow the heading from
              one line to two (which would resize the whole panel). */}
          <p className="font-mono tabular-nums text-foreground whitespace-nowrap">
            {currentPrice != null
              ? currentPrice.toLocaleString(undefined, (() => {
                  const d = currentPrice >= 1000 ? 2 : currentPrice >= 1 ? 4 : 6;
                  return { minimumFractionDigits: d, maximumFractionDigits: d };
                })())
              : "—"}
          </p>
        </div>
      </div>

      {/* Duration */}
      {durationSelector}

      {/* Stake */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Stake (USDC)</label>
          <span className="text-[11px] text-muted-foreground">
            Max ${cap.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          placeholder={`Min $${minStake}`}
          className={`w-full rounded-lg bg-secondary/40 border px-3 py-2 font-mono text-foreground focus:outline-none focus:ring-1 ${
            overCap ? "border-red-500/60 focus:ring-red-500" : "border-border focus:ring-primary"
          }`}
        />
        {presets}
        {/* Cap rule + over-limit feedback */}
        {overCap ? (
          <p className="text-[11px] text-red-400">
            Max {pctLabel} of your account per trade — ${cap.toLocaleString(undefined, { maximumFractionDigits: 2 })} available
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Max {pctLabel} of your funded account per trade
            {perTradeCap != null && ` ($${perTradeCap.toLocaleString(undefined, { maximumFractionDigits: 2 })})`}
          </p>
        )}
      </div>

      {/* Inline payout ladder removed — the sidebar's ZonePayoutLadder card
          below this panel shows the same information without the duplication. */}

      {/* Drawdown caution — a loss at this stake would fail the account */}
      {cautionBanner}

      {/* UP / DOWN */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => place("up")}
          disabled={!validStake || disabled || submitting}
          className="h-14 bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 font-grotesk font-semibold"
        >
          {submitting && side === "up" ? <BoltLoader className="w-5 h-5" /> : <><TrendingUp className="w-5 h-5 mr-1" /> Up</>}
        </Button>
        <Button
          onClick={() => place("down")}
          disabled={!validStake || disabled || submitting}
          className="h-14 bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 font-grotesk font-semibold"
        >
          {submitting && side === "down" ? <BoltLoader className="w-5 h-5" /> : <><TrendingDown className="w-5 h-5 mr-1" /> Down</>}
        </Button>
      </div>

      {/* Confirmation — required when a loss would fail the account */}
      {confirmDialog}

      {disabledMsg}
    </div>
  );
}
