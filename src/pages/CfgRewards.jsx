import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Coins, TrendingUp, Droplets, Trophy, BookOpen } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import useSeasonData from "@/hooks/useSeasonData";
import SeasonBanner from "@/components/cfg/SeasonBanner";
import TradingRewards from "@/components/cfg/TradingRewards";
import LpStaking from "@/components/cfg/LpStaking";
import Leaderboard from "@/components/cfg/Leaderboard";
import Seasons from "@/components/cfg/Seasons";

const VALID_TABS = ["trading", "lp", "leaderboard", "seasons"];

const fmtCfg = (wei) => {
  if (!wei) return "0";
  const n = Number(wei) / 1e18;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
};

export default function CfgRewards() {
  const { isAuthenticated, address } = useAuth();
  const season = useSeasonData(address);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "trading";
  const [tab, setTabState] = useState(initialTab);

  // Keep ?tab= and local state in sync
  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (VALID_TABS.includes(fromUrl) && fromUrl !== tab) {
      setTabState(fromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = (t) => {
    setTabState(t);
    setSearchParams(t === "trading" ? {} : { tab: t });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Coins className="w-6 h-6 text-primary" />
            CFG Rewards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Earn CFG governance tokens by trading challenges or staking CFND.
          </p>
        </div>
        {isAuthenticated && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Your CFG Balance</div>
            <div className="font-display font-bold text-lg">
              {season.loading ? (
                <span className="inline-block w-16 h-6 bg-muted animate-pulse rounded" />
              ) : (
                fmtCfg(season.cfgBalance)
              )}
            </div>
          </div>
        )}
      </div>

      {/* Season banner */}
      <SeasonBanner season={season} />

      {/* Tab switcher */}
      <div className="inline-grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-muted rounded-lg">
        <Button
          variant={tab === "trading" ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("trading")}
        >
          <TrendingUp className="w-4 h-4" />
          Trading Rewards
        </Button>
        <Button
          variant={tab === "lp" ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("lp")}
        >
          <Droplets className="w-4 h-4" />
          LP Staking
        </Button>
        <Button
          variant={tab === "leaderboard" ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("leaderboard")}
        >
          <Trophy className="w-4 h-4" />
          Leaderboard
        </Button>
        <Button
          variant={tab === "seasons" ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("seasons")}
        >
          <BookOpen className="w-4 h-4" />
          About Seasons
        </Button>
      </div>

      {/* Tab content */}
      {tab === "trading" && (
        <TradingRewards season={season} isAuthenticated={isAuthenticated} />
      )}
      {tab === "lp" && (
        <LpStaking season={season} isAuthenticated={isAuthenticated} />
      )}
      {tab === "leaderboard" && (
        <Leaderboard season={season} currentAddress={address} />
      )}
      {tab === "seasons" && (
        <Seasons />
      )}
    </div>
  );
}
