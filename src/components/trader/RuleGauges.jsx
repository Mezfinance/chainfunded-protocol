/**
 * RuleGauges — Visual challenge rule progress indicators.
 *
 * Renders circular/bar gauges showing progress toward challenge rules:
 * profit target, max daily loss, max total drawdown, minimum trading days,
 * and best single day cap. Colour-codes green (safe) → amber (warning) → red (breach).
 * Used in the trader dashboard and terminal sidebar.
 */
import { Shield, Target, Clock } from "lucide-react";
import InfoHint from "@/components/ui/InfoHint";
import { useResetCountdown } from "@/hooks/useResetCountdown";

function Gauge({ label, current, max, icon: Icon, format = "pct", minimum = false, lossMode = false, hint, footnote }) {
  const pct = Math.min(Math.abs(current / max) * 100, 100);

  let color, textColor;
  if (minimum) {
    // Green when met, yellow when close, red when far off
    const met = current >= max;
    const close = pct >= 50;
    color = met ? "bg-primary" : close ? "bg-yellow-400" : "bg-red-500";
    textColor = met ? "text-primary" : close ? "text-yellow-400" : "text-red-400";
  } else if (lossMode) {
    // Red as soon as any loss is present
    color = current > 0 ? "bg-red-500" : "bg-primary";
    textColor = current > 0 ? "text-red-400" : "text-primary";
  } else {
    const isWarning = pct > 70;
    const isCritical = pct > 90;
    color = isCritical ? "bg-red-500" : isWarning ? "bg-yellow-400" : "bg-primary";
    textColor = isCritical ? "text-red-400" : isWarning ? "text-yellow-400" : "text-primary";
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">
            {label}
            {hint && <InfoHint text={hint} className="ml-1 align-middle" />}
          </span>
        </div>
        <span className={`text-sm font-semibold ${textColor}`}>
          {format === "pct" ? `${current.toFixed(2)}%` : `${current} / ${max}`}
        </span>
      </div>
      <div className="w-full bg-secondary rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {minimum ? `Min: ${format === "pct" ? `${max}%` : `${max} days`}` : `Max: ${format === "pct" ? `${max}%` : max}`}
        {footnote && <span className="text-muted-foreground/70"> · {footnote}</span>}
      </p>
    </div>
  );
}

function BestDayGauge({ trades, account }) {
  const startingBalance = account.starting_balance || account.account_size || 1;
  const effectiveBalance = account.current_balance ?? startingBalance;
  const totalProfit = effectiveBalance - startingBalance;

  // In drawdown — no profit, gauge is N/A
  if (totalProfit <= 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">
              Best Day %
              <InfoHint text="No single day's profit can exceed 50% of your total profit at payout." className="ml-1 align-middle" />
            </span>
          </div>
          <span className="text-sm text-muted-foreground">—</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-1.5">
          <div className="h-1.5 rounded-full bg-secondary" style={{ width: "0%" }} />
        </div>
        <p className="text-xs text-muted-foreground">No profit — gauge inactive</p>
      </div>
    );
  }

  // Calculate best single day P&L from closed trades
  const closedTrades = (trades || []).filter((t) => t.status === "closed" && t.close_time);
  const dailyPnl = {};
  for (const t of closedTrades) {
    const day = t.close_time.split("T")[0];
    dailyPnl[day] = (dailyPnl[day] || 0) + (t.pnl || 0);
  }
  const dailyValues = Object.values(dailyPnl);
  const bestDayProfit = dailyValues.length > 0 ? Math.max(0, ...dailyValues) : 0;
  const bestDayPct = totalProfit > 0 ? (bestDayProfit / totalProfit) * 100 : 0;
  const cappedPct = Math.min(bestDayPct, 100);

  // Color thresholds: 0-40% green, 40-50% yellow, 50%+ red
  let color, textColor;
  if (bestDayPct >= 50) {
    color = "bg-red-500";
    textColor = "text-red-400";
  } else if (bestDayPct >= 40) {
    color = "bg-yellow-400";
    textColor = "text-yellow-400";
  } else {
    color = "bg-primary";
    textColor = "text-primary";
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Target className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">
            Best Day %
            <InfoHint text="No single day's profit can exceed 50% of your total profit at payout." className="ml-1 align-middle" />
          </span>
        </div>
        <span className={`text-sm font-semibold ${textColor}`}>
          {bestDayPct.toFixed(1)}%
        </span>
      </div>
      <div className="w-full bg-secondary rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${cappedPct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">Max: 50%</p>
    </div>
  );
}

// Best single-day profit as a % of total profit (the "max one-day profit"
// rule). Returns null when there's no profit yet (gauge inactive).
function computeBestDayPct(trades, account) {
  const startingBalance = account.starting_balance || account.account_size || 1;
  const effectiveBalance = account.current_balance ?? startingBalance;
  const totalProfit = effectiveBalance - startingBalance;
  if (totalProfit <= 0) return null;
  const closedTrades = (trades || []).filter((t) => t.status === "closed" && t.close_time);
  const dailyPnl = {};
  for (const t of closedTrades) {
    const day = t.close_time.split("T")[0];
    dailyPnl[day] = (dailyPnl[day] || 0) + (t.pnl || 0);
  }
  const values = Object.values(dailyPnl);
  const bestDayProfit = values.length > 0 ? Math.max(0, ...values) : 0;
  return (bestDayProfit / totalProfit) * 100;
}

// Compact circular dial — used on mobile where stacked bars run too long.
function DialGauge({ label, valueText, pct, color, icon: Icon, hint, footnote }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(Math.max(pct, 0), 100) / 100) * circ;
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col items-center gap-2">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="6" />
          <circle
            cx="32" cy="32" r={r} fill="none"
            className={color}
            stroke="currentColor" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[13px] font-bold ${color}`}>{valueText}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground text-center leading-tight">
        {Icon && <Icon className="w-3 h-3 shrink-0" />}
        <span>{label}</span>
        {hint && <InfoHint text={hint} />}
      </div>
      {footnote && (
        <span className="text-[10px] text-muted-foreground/70 -mt-1 text-center leading-tight">{footnote}</span>
      )}
    </div>
  );
}

export default function RuleGauges({ account, liveBalance, unrealisedPnl = 0, tradingDaysCount, trades, dial = false }) {
  const reset = useResetCountdown();
  if (!account) return null;

  const startingBalance = account.starting_balance || account.account_size || 1;
  const effectiveLiveBalance = liveBalance ?? account.current_balance ?? startingBalance;

  // Total loss: based on live equity
  const totalLossPct = ((startingBalance - effectiveLiveBalance) / startingBalance) * 100;

  // Daily loss: drawdown from the day's starting equity down to live equity.
  // Mirrors the worker's breach formula (worker/executors.js) so the gauge
  // matches what actually fails an account: winning trades / net gains bring
  // this to 0 — it is NOT the sum of losing trades. Falls back to
  // current_balance for accounts that predate the day_start_balance field.
  const dayStartBalance = account.day_start_balance ?? account.current_balance ?? startingBalance;
  const liveEquity = effectiveLiveBalance + unrealisedPnl;
  const dailyLossPct = Math.max(0, ((dayStartBalance - liveEquity) / startingBalance) * 100);

  // Profit: based on live equity
  const profitPct = ((effectiveLiveBalance - startingBalance) / startingBalance) * 100;
  const target = account.phase === "phase_1" ? 10 : 5;

  const isFunded = account.phase === "funded";

  // Best single-day profit (max one-day profit rule).
  const maxDaily = account.max_daily_loss_pct || 5;
  const maxTotal = account.max_total_loss_pct || 10;
  const minDays = account.min_trading_days || 4;
  const daysCount = tradingDaysCount ?? account.trading_days_count ?? 0;
  const bestDayPct = computeBestDayPct(trades, account);

  if (dial) {
    const lossColor = (v) => (v > 0 ? "text-red-400" : "text-primary");
    const targetColor = (() => {
      const p = (Math.max(profitPct, 0) / target) * 100;
      return p > 90 ? "text-red-400" : p > 70 ? "text-yellow-400" : "text-primary";
    })();
    const daysColor =
      daysCount >= minDays ? "text-primary" : daysCount / minDays >= 0.5 ? "text-yellow-400" : "text-red-400";
    const bestDayColor =
      bestDayPct == null ? "text-muted-foreground" : bestDayPct >= 50 ? "text-red-400" : bestDayPct >= 40 ? "text-yellow-400" : "text-primary";

    return (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Rules</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary/80">Enforced on-chain</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DialGauge label="Daily Loss" valueText={`${Math.max(dailyLossPct, 0).toFixed(1)}%`} pct={(Math.max(dailyLossPct, 0) / maxDaily) * 100} color={lossColor(dailyLossPct)} icon={Shield} hint={`Max ${maxDaily}% daily loss. Resets at 00:00 UTC.`} footnote={`resets ${reset.label}`} />
          <DialGauge label="Max Drawdown" valueText={`${Math.max(totalLossPct, 0).toFixed(1)}%`} pct={(Math.max(totalLossPct, 0) / maxTotal) * 100} color={lossColor(totalLossPct)} icon={Shield} hint={`Max ${maxTotal}% total drawdown.`} />
          {!isFunded && (
            <DialGauge label="Profit Target" valueText={`${Math.max(profitPct, 0).toFixed(1)}%`} pct={(Math.max(profitPct, 0) / target) * 100} color={targetColor} icon={Target} hint={`Reach ${target}% profit to pass this phase.`} />
          )}
          <DialGauge label="Max 1-Day Profit" valueText={bestDayPct == null ? "—" : `${bestDayPct.toFixed(0)}%`} pct={bestDayPct ?? 0} color={bestDayColor} icon={Target} hint="No single day's profit can exceed 50% of your total profit at payout." />
          <DialGauge label="Trading Days" valueText={`${daysCount}/${minDays}`} pct={(daysCount / minDays) * 100} color={daysColor} icon={Clock} hint="A trading day is any calendar day (UTC) where you closed at least one position." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Rules</h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-primary/80">Enforced on-chain</span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        These limits are re-checked by <span className="font-mono text-foreground/80">ChainFundedPool</span> at payout — a breach reverts the transaction, no human review.
      </p>
      <div className="grid grid-cols-1 gap-3">
        <Gauge label="Daily Loss Used" current={Math.max(dailyLossPct, 0)} max={account.max_daily_loss_pct || 5} icon={Shield} lossMode={true} hint="Daily loss limit resets at 00:00 UTC." footnote={`resets in ${reset.label}`} />
        <Gauge label="Total Loss Used" current={Math.max(totalLossPct, 0)} max={account.max_total_loss_pct || 10} icon={Shield} lossMode={true} />
        {!isFunded && (
          <Gauge label="Profit Target" current={Math.max(profitPct, 0)} max={target} icon={Target} />
        )}
        <BestDayGauge trades={trades} account={account} />
        <Gauge label="Trading Days" current={tradingDaysCount ?? account.trading_days_count ?? 0} max={account.min_trading_days || 4} icon={Clock} format="days" minimum={true} hint="A trading day is any calendar day (UTC) where you closed at least one position." />
      </div>
    </div>
  );
}