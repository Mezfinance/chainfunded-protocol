import { Coins, Trophy } from "lucide-react";
import { formatUtcDate } from "@/lib/datetime";

/**
 * Season banner for the CFG Rewards page header.
 * Shows season number, progress bar, budget, and time remaining.
 */
export default function SeasonBanner({ season }) {
  const { activeSeason, seasonCount, seasonStart, seasonEnd, seasonBudgetTrader, seasonBudgetLp, lastEndedSeason, loading } = season;

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">Season   of 10</h2>
              <p className="text-xs text-muted-foreground">  days remaining</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Trader Pool</div>
              <div className="font-display font-bold text-sm"><span className="inline-block w-16 h-4 bg-muted animate-pulse rounded" /></div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">LP Pool</div>
              <div className="font-display font-bold text-sm"><span className="inline-block w-16 h-4 bg-muted animate-pulse rounded" /></div>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-0 rounded-full bg-primary" />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>—</span>
            <span> % complete</span>
            <span>—</span>
          </div>
        </div>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const isActive = activeSeason > 0 && seasonStart && seasonEnd;

  let progress = 0;
  let daysRemaining = 0;
  if (isActive) {
    const total = seasonEnd - seasonStart;
    const elapsed = Math.min(now - seasonStart, total);
    progress = Math.round((elapsed / total) * 100);
    daysRemaining = Math.max(0, Math.ceil((seasonEnd - now) / 86400));
  }

  const fmtCfg = (wei) => {
    if (!wei) return "—";
    const n = Number(wei) / 1e18;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return n.toFixed(0);
  };

  if (!isActive && !seasonCount) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <Coins className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">CFG reward seasons have not started yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg">
              {isActive ? `Season ${activeSeason} of ${seasonCount}` : "Between Seasons"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isActive
                ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`
                : "Next season coming soon"}
            </p>
          </div>
        </div>
        {isActive && (
          <div className="hidden sm:flex items-center gap-4">
            {seasonBudgetTrader && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Trader Pool</div>
                <div className="font-display font-bold text-sm">{fmtCfg(seasonBudgetTrader)} CFG</div>
              </div>
            )}
            {seasonBudgetLp && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">LP Pool</div>
                <div className="font-display font-bold text-sm">{fmtCfg(seasonBudgetLp)} CFG</div>
              </div>
            )}
          </div>
        )}
      </div>

      {isActive && (
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatUtcDate(seasonStart * 1000)}</span>
            <span>{progress}% complete</span>
            <span>{formatUtcDate(seasonEnd * 1000)}</span>
          </div>
        </div>
      )}

      {/* Results of the most recent ended season */}
      {lastEndedSeason && lastEndedSeason.totalPoints > 0n && (
        <div className="mt-4 pt-4 border-t border-primary/20 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-display font-bold">Season {lastEndedSeason.id} complete</div>
            <div className="text-xs text-muted-foreground">
              {fmtCfg(lastEndedSeason.cfgBudget)} CFG shared across {Number(lastEndedSeason.totalPoints).toLocaleString()} points
              {" · "}≈{fmtCfg((lastEndedSeason.cfgBudget * 1000n) / lastEndedSeason.totalPoints)} CFG per $1K Phase 1 account
            </div>
          </div>
          <div className="text-xs font-medium text-primary">
            Claim on the Trading Rewards tab
          </div>
        </div>
      )}
    </div>
  );
}
