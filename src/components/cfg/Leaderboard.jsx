import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, TrendingUp, Droplets } from "lucide-react";
import useLeaderboard from "@/hooks/useLeaderboard";

const fmtCfg = (wei) => {
  if (!wei) return "0";
  const n = Number(wei) / 1e18;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
};

const fmtPts = (pts) => {
  if (!pts) return "0";
  const n = Number(pts);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
};

const fmtAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";

const rankColor = (i) =>
  i === 0 ? "text-yellow-400"
  : i === 1 ? "text-zinc-300"
  : i === 2 ? "text-amber-600"
  : "text-muted-foreground";

function RankList({ rows, valueLabel, formatValue, currentAddress, emptyMessage }) {
  if (!rows.length) {
    return <div className="text-xs text-muted-foreground py-8 text-center">{emptyMessage}</div>;
  }
  return (
    <ol className="divide-y divide-border">
      {rows.map((r, i) => {
        const isYou = currentAddress && r.address.toLowerCase() === currentAddress.toLowerCase();
        return (
          <li
            key={r.address}
            className={`flex items-center justify-between py-2 px-3 text-sm ${isYou ? "bg-primary/5" : ""}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`font-display font-bold w-6 tabular-nums ${rankColor(i)}`}>#{i + 1}</span>
              <span className="font-mono text-xs text-foreground truncate">
                {fmtAddr(r.address)}
                {isYou && <span className="text-primary ml-1.5 font-semibold">you</span>}
              </span>
            </div>
            <div className="text-right">
              <div className="font-display font-semibold text-foreground tabular-nums">{formatValue(r)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{valueLabel(r)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Leaderboard({ season, currentAddress }) {
  const [scope, setScope] = useState("all");
  const { activeSeason, seasonStart } = season;
  const { traders, lps, loading, error, source } = useLeaderboard({
    scope,
    activeSeason,
    seasonStartTs: seasonStart,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <h2 className="font-display font-bold text-lg">Leaderboard</h2>
        </div>
        <div className="inline-grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <Button
            variant={scope === "season" ? "default" : "ghost"}
            size="sm"
            onClick={() => setScope("season")}
            disabled={!activeSeason}
          >
            Current Season
          </Button>
          <Button
            variant={scope === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setScope("all")}
          >
            All Time
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 px-2">Error loading leaderboard: {error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Top Traders</h3>
            </div>
            {loading ? (
              <SkeletonRows />
            ) : (
              <RankList
                rows={traders}
                valueLabel={() => "points"}
                formatValue={(r) => fmtPts(r.points)}
                currentAddress={currentAddress}
                emptyMessage={scope === "season" ? "No registrations this season yet" : "No registrations yet"}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Top LPs</h3>
            </div>
            {loading ? (
              <SkeletonRows />
            ) : (
              <RankList
                rows={lps}
                valueLabel={() => "CFG earned"}
                formatValue={(r) => fmtCfg(r.value)}
                currentAddress={currentAddress}
                emptyMessage={scope === "season" ? "No CFG earned this season yet" : "No CFG earned yet"}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        {scope === "season"
          ? "Top traders by points earned in the active season · Top LPs by CFG earned (claimed this season + live unclaimed)"
          : "Top traders by lifetime points · Top LPs by lifetime CFG earned (claimed + unclaimed)"}
      </p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="h-8 bg-muted/40 animate-pulse rounded" />
      ))}
    </div>
  );
}

