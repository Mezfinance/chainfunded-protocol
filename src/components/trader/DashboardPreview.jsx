import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Lock, Zap } from "lucide-react";
import RuleGauges from "./RuleGauges";
import PnLCalendar from "./PnLCalendar";
import TradeHistory from "./TradeHistory";

const MOCK_ACCOUNT = {
  id: "mock",
  account_size: 50000,
  starting_balance: 50000,
  current_balance: 53200,
  peak_balance: 53200,
  phase: "phase_1",
  status: "active",
  trader_address: "0xDEMO",
  daily_loss_today: 0,
  profit_target_pct: 10,
  max_daily_loss_pct: 5,
  max_total_loss_pct: 10,
  min_trading_days: 4,
  trading_days_count: 3,
};

const MOCK_TRADES = [
  { id: "1", symbol: "BTC/USDT", direction: "long",  entry_price: 61200, exit_price: 63400, size: 5000,  pnl: 179.7,  pnl_pct: 3.59,  status: "closed", close_time: "2026-03-11T14:20:00Z" },
  { id: "2", symbol: "ETH/USDT", direction: "short", entry_price: 3280,  exit_price: 3190,  size: 3000,  pnl: 82.3,   pnl_pct: 2.74,  status: "closed", close_time: "2026-03-10T09:45:00Z" },
  { id: "3", symbol: "SOL/USDT", direction: "long",  entry_price: 145,   exit_price: 138,   size: 2000,  pnl: -96.5,  pnl_pct: -4.83, status: "closed", close_time: "2026-03-09T16:10:00Z" },
  { id: "4", symbol: "BTC/USDT", direction: "long",  entry_price: 60100, exit_price: 62800, size: 8000,  pnl: 359.4,  pnl_pct: 4.49,  status: "closed", close_time: "2026-03-08T11:30:00Z" },
  { id: "5", symbol: "ETH/USDT", direction: "long",  entry_price: 3100,  exit_price: 3260,  size: 4000,  pnl: 206.4,  pnl_pct: 5.16,  status: "closed", close_time: "2026-03-07T08:00:00Z" },
];

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

export default function DashboardPreview({ onConnect, isAuthenticated = false }) {
  return (
    <div className="relative space-y-6">
      {/* Mock stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Account Balance (Equity)" value="$53,200.00" sub="+$3,200 unrealised" />
        <StatCard label="P&L vs Target" value="+6.40%" sub="Target: 10%" positive={true} />
        <StatCard label="Total Realised P&L" value="+$731.30" positive={true} />
        <StatCard label="Win Rate" value="80%" sub="5 closed trades" />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PnLCalendar trades={MOCK_TRADES} />
          <TradeHistory trades={MOCK_TRADES} />
        </div>
        <div>
          <RuleGauges account={MOCK_ACCOUNT} liveBalance={53200} unrealisedPnl={0} />
        </div>
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-transparent via-background/60 to-background/95 flex items-end justify-center pb-16 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto text-center space-y-4 bg-card/80 backdrop-blur-md border border-border rounded-2xl px-8 py-8 shadow-2xl max-w-sm mx-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-grotesk font-bold text-foreground">Your Dashboard Awaits</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isAuthenticated
                ? "Start a challenge to track your live P&L, risk gauges, and trade history in real time."
                : "Connect your wallet and start a challenge to track your live P&L, risk gauges, and trade history."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link to={createPageUrl("Onboarding")}>
              <Button className="w-full bg-primary text-primary-foreground gap-2 glow-green-sm">
                <Zap className="w-4 h-4" /> Start a Challenge
              </Button>
            </Link>
            {!isAuthenticated && (
              <Button variant="outline" className="w-full" onClick={onConnect}>
                Connect Wallet <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">Preview with demo data</Badge>
        </div>
      </div>
    </div>
  );
}