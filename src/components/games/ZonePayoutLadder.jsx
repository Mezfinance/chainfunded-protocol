/**
 * ZonePayoutLadder — compact 6-row reference of the zone payoffs.
 *
 * Highlights the trader's current band (when `currentRow` is given) so it
 * doubles as a "what am I about to win/lose at expiry" reference. Shows the
 * live fractional move that triggers each zone (from the focused bet's
 * snapshot when a bet is selected, else from the prospective T1/T2 for the
 * default duration) so the trader can read "what does Mid actually mean
 * RIGHT NOW" without doing the math.
 */
import { zoneThresholdsFor } from "@/lib/zoneTrades";

export default function ZonePayoutLadder({ bet, currentRow, config, stake = 100, symbol, durationSec }) {
  const pay = config?.zone?.pay || {
    nearWin: 0.2125, nearLoss: 0.25,
    midWin:  0.425,  midLoss:  0.50,
    koWin:   0.85,   koLoss:   1.00,
  };
  const s = bet ? +bet.stake : stake;

  // Resolve T1/T2 to display. Bet snapshot wins (immune to live config
  // drift); falls back to prospective bands for the default duration.
  let t1Frac = 0;
  let t2Frac = 0;
  if (bet) {
    t1Frac = +bet.t1_pct || 0;
    t2Frac = +bet.t2_pct || 0;
  } else if (symbol) {
    const dur = durationSec ?? config?.defaultDurationSec ?? config?.durations?.[0] ?? 60;
    const th = zoneThresholdsFor(symbol, dur, config);
    t1Frac = th.t1;
    t2Frac = th.t2;
  }
  const hasBands = t1Frac > 0 && t2Frac > 0;
  // Render T1/T2 as percentages with enough precision to be readable at
  // both BTC scale (T2 ≈ 0.072%) and stock scale (T2 ≈ 0.5%+).
  const fmtPct = (x) => {
    const p = x * 100;
    const decimals = p < 0.1 ? 3 : p < 1 ? 2 : 1;
    return `${p.toFixed(decimals)}%`;
  };
  const range = {
    farWin:   hasBands ? `≥ +${fmtPct(t2Frac)}` : "",
    midWin:   hasBands ? `+${fmtPct(t1Frac)} – +${fmtPct(t2Frac)}` : "",
    nearWin:  hasBands ? `0 – +${fmtPct(t1Frac)}` : "",
    nearLoss: hasBands ? `0 – −${fmtPct(t1Frac)}` : "",
    midLoss:  hasBands ? `−${fmtPct(t1Frac)} – −${fmtPct(t2Frac)}` : "",
    farLoss:  hasBands ? `≤ −${fmtPct(t2Frac)}` : "",
  };

  const rows = [
    { key: "farWin",   label: "KO win",    val: +pay.koWin   * s, sign: "+", text: "text-green-300",    border: "border-green-500/40", bg: "bg-green-500/15" },
    { key: "midWin",   label: "Mid win",   val: +pay.midWin  * s, sign: "+", text: "text-green-300/90", border: "border-green-500/25", bg: "bg-green-500/10" },
    { key: "nearWin",  label: "Near win",  val: +pay.nearWin * s, sign: "+", text: "text-green-300/75", border: "border-green-500/15", bg: "bg-green-500/5"  },
    { key: "nearLoss", label: "Near loss", val: +pay.nearLoss * s, sign: "−", text: "text-red-300/75",  border: "border-red-500/15",   bg: "bg-red-500/5"    },
    { key: "midLoss",  label: "Mid loss",  val: +pay.midLoss  * s, sign: "−", text: "text-red-300/90",  border: "border-red-500/25",   bg: "bg-red-500/10"   },
    { key: "farLoss",  label: "KO loss",   val: +pay.koLoss   * s, sign: "−", text: "text-red-400",     border: "border-red-500/40",   bg: "bg-red-500/15"   },
  ];

  const stakeLabel = bet ? `· $${s.toFixed(0)} stake` : "· per $100 stake";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Zone payouts</div>
        <div className="text-[10px] text-muted-foreground font-mono">{stakeLabel}</div>
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const isCurrent = currentRow === r.key;
          return (
            <div
              key={r.key}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[12px] font-mono border transition-colors ${
                isCurrent ? `${r.bg} ${r.border}` : "border-transparent"
              }`}
            >
              <span className={`shrink-0 ${r.text}`}>
                {r.label}{isCurrent && <span className="ml-1.5 text-[9px] uppercase tracking-widest opacity-80">· current</span>}
              </span>
              <div className="flex items-center gap-3 min-w-0">
                {hasBands && (
                  <span className="text-[10px] text-muted-foreground tabular-nums truncate" title={range[r.key]}>
                    {range[r.key]}
                  </span>
                )}
                <span className="font-semibold text-foreground tabular-nums">
                  {r.sign}${r.val.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
