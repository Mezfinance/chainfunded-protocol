import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Medal, ChevronDown } from "lucide-react";
import useSeasonData from "@/hooks/useSeasonData";

/**
 * Compact season pill for the nav bar.
 *
 * States:
 *   No contract:              "CFG Rewards"
 *   Loading:                  "CFG Rewards"
 *   Pre-season 1:             "Season 1 Coming Soon"
 *   Active season:            "Season 3" + progress bar
 *   Between seasons (next):   "Season 4 Coming Soon"
 *   Last season ended:        "Season 3 Ended"
 *   All 10 done:              "Rewards Complete"
 */
export default function SeasonIndicator({ hasDropdown = false, open = false } = {}) {
  const {
    activeSeason, seasonCount, seasonStart, seasonEnd,
    nextSeasonId, lastSeasonId, allSeasonsComplete, loading,
  } = useSeasonData();

  const now = Math.floor(Date.now() / 1000);
  let label = "CFG Rewards";
  let shortLabel = "CFG";
  let progress = null;

  if (!loading && seasonCount > 0) {
    if (activeSeason > 0 && seasonStart && seasonEnd) {
      // Active season — show progress
      const total = seasonEnd - seasonStart;
      const elapsed = Math.min(now - seasonStart, total);
      progress = Math.round((elapsed / total) * 100);
      label = `Season ${activeSeason}`;
      shortLabel = `S${activeSeason}`;
    } else if (allSeasonsComplete) {
      // All 10 seasons done
      label = "Rewards Complete";
      shortLabel = "Done";
    } else if (nextSeasonId) {
      // Next season exists but hasn't started
      label = `S${nextSeasonId} Soon`;
      shortLabel = `S${nextSeasonId}`;
    } else if (lastSeasonId) {
      // Last season ended, no next season created yet
      label = `S${lastSeasonId} Ended`;
      shortLabel = `S${lastSeasonId}`;
    }
  }

  return (
    <Link
      to={createPageUrl("CfgRewards")}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
      title="CFG Rewards"
    >
      <Medal className="w-3 h-3 text-primary shrink-0" />
      <span className="text-xs font-medium text-foreground whitespace-nowrap">{label}</span>
      {progress !== null && (
        <div className="w-6 h-1 rounded-full bg-muted overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {hasDropdown && (
        <ChevronDown
          className={`w-3 h-3 text-primary/70 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      )}
    </Link>
  );
}
