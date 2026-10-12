import { Card, CardContent } from "@/components/ui/card";
import { Coins, TrendingUp, Droplets, Calendar, Landmark, Vote, Users, Lock, Sparkles } from "lucide-react";

/**
 * Static explainer for CFG token economics, the season schedule, and how
 * trading + LP rewards are emitted. Numbers come straight from the
 * deployed contracts (CFGToken, CFGDistributor, CFGLPRewards) — keep them
 * in sync if any constants change on-chain.
 */

// 0-indexed season → CFG budget in millions
const TRADER_SCHEDULE = [4.5, 3.0, 2.25, 1.5, 1.125, 0.75, 0.5625, 0.5625, 0.375, 0.375];
const LP_SCHEDULE     = [3.0, 2.0, 1.5,  1.0, 0.75,  0.5,  0.375,  0.375,  0.25,  0.25 ];

const ALLOCATIONS = [
  { label: "Community Treasury", pct: 46, icon: Landmark, color: "bg-primary/15 text-primary",       note: "Timelock-controlled, released via governance vote" },
  { label: "Team & Founders",    pct: 20, icon: Users,    color: "bg-blue-500/15 text-blue-400",     note: "4-year vest, 6-month cliff" },
  { label: "Trading Rewards",    pct: 15, icon: TrendingUp, color: "bg-green-500/15 text-green-400", note: "5-year emission to active traders" },
  { label: "LP Rewards",         pct: 10, icon: Droplets, color: "bg-cyan-500/15 text-cyan-400",     note: "5-year emission to CFND stakers" },
  { label: "Airdrop Reserve",    pct:  5, icon: Sparkles, color: "bg-amber-500/15 text-amber-400",   note: "Timelock escrow, distributed via governance" },
  { label: "Advisors",           pct:  2, icon: Vote,     color: "bg-purple-500/15 text-purple-400", note: "10% TGE unlock, 12-month linear vest" },
  { label: "Investors",          pct:  2, icon: Vote,     color: "bg-purple-500/15 text-purple-400", note: "10% TGE unlock, 12-month linear vest" },
];

const TOTAL_SUPPLY        = 100_000_000;
const TRADER_TOTAL        = 15_000_000;
const LP_TOTAL            = 10_000_000;
const SEASON_DURATION_DAYS = 182;
const TOTAL_SEASONS       = 10;

const fmtM = (n) => `${n.toFixed(n < 1 ? 3 : n < 10 ? 2 : 1)}M`;

export default function Seasons() {
  return (
    <div className="space-y-6">

      {/* Intro */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            <h2 className="font-display font-bold text-lg">CFG — Governance Token</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            CFG is the governance token of the ChainFunded protocol. Holders vote on
            protocol parameters, treasury allocation, and signer key rotation. Fixed
            supply of <span className="text-foreground font-semibold">{TOTAL_SUPPLY.toLocaleString()} CFG</span> —
            no inflation, no further minting after deployment.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <Stat icon={Vote}     label="Voting power"   value="1 CFG = 1 vote (delegated)" />
            <Stat icon={Lock}     label="Total supply"   value={`${TOTAL_SUPPLY.toLocaleString()} CFG`} />
            <Stat icon={Calendar} label="Reward horizon" value={`5 years · ${TOTAL_SEASONS} seasons`} />
          </div>
        </CardContent>
      </Card>

      {/* How seasons work */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="font-display font-bold text-lg">How Seasons Work</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            CFG rewards emit over <span className="text-foreground font-semibold">{TOTAL_SEASONS} seasons</span> of{" "}
            <span className="text-foreground font-semibold">{SEASON_DURATION_DAYS} days</span> each — roughly five years.
            Each season has its own CFG budget, front-loaded so early participants
            earn the largest share. Two parallel programs run on the same season
            timeline:
          </p>
          <ul className="space-y-2 text-sm pl-1">
            <li className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">Trading Rewards</span> —
                Traders register their challenge accounts to accrue points based on
                account size and phase. At season end, each registration's CFG share
                is computed from <code className="text-xs bg-muted/40 px-1 rounded">points / totalPoints</code>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Droplets className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">LP Staking Rewards</span> —
                CFND stakers earn CFG continuously at a per-second rate of{" "}
                <code className="text-xs bg-muted/40 px-1 rounded">seasonBudget / 182&nbsp;days</code>,
                proportional to their share of the staked supply.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Season schedule */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="font-display font-bold text-lg">Season Budgets</h2>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left  py-2 px-3 font-medium">Season</th>
                  <th className="text-right py-2 px-3 font-medium">Trading</th>
                  <th className="text-right py-2 px-3 font-medium">LP Staking</th>
                  <th className="text-right py-2 px-3 font-medium">Combined</th>
                </tr>
              </thead>
              <tbody>
                {TRADER_SCHEDULE.map((trader, i) => {
                  const lp       = LP_SCHEDULE[i];
                  const combined = trader + lp;
                  return (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="py-2 px-3 font-display font-semibold text-foreground">Season {i + 1}</td>
                      <td className="py-2 px-3 text-right text-foreground tabular-nums">{fmtM(trader)} CFG</td>
                      <td className="py-2 px-3 text-right text-foreground tabular-nums">{fmtM(lp)} CFG</td>
                      <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">{fmtM(combined)} CFG</td>
                    </tr>
                  );
                })}
                <tr className="bg-primary/5 font-semibold">
                  <td className="py-2 px-3 text-foreground">Total</td>
                  <td className="py-2 px-3 text-right text-foreground tabular-nums">{fmtM(TRADER_TOTAL / 1e6)} CFG</td>
                  <td className="py-2 px-3 text-right text-foreground tabular-nums">{fmtM(LP_TOTAL / 1e6)} CFG</td>
                  <td className="py-2 px-3 text-right text-foreground tabular-nums">{fmtM((TRADER_TOTAL + LP_TOTAL) / 1e6)} CFG</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Budgets halve roughly every two seasons. Unclaimed CFG from past seasons
            stays in the distributor — claim them any time from the Trading Rewards
            tab.
          </p>
        </CardContent>
      </Card>

      {/* Token allocation */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            <h2 className="font-display font-bold text-lg">Token Allocation</h2>
          </div>

          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden border border-border">
            {ALLOCATIONS.map((a) => (
              <div
                key={a.label}
                className={a.color.split(" ")[0]}
                style={{ width: `${a.pct}%` }}
                title={`${a.label} — ${a.pct}%`}
              />
            ))}
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ALLOCATIONS.map((a) => {
              const Icon = a.icon;
              const cfgAmount = (TOTAL_SUPPLY * a.pct) / 100;
              return (
                <li key={a.label} className="flex items-start gap-3 p-3 rounded-md border border-border bg-secondary/20">
                  <div className={`w-8 h-8 shrink-0 rounded-md ${a.color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-sm text-foreground">{a.label}</span>
                      <span className="text-xs font-bold text-foreground tabular-nums">{a.pct}%</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {(cfgAmount / 1e6).toFixed(cfgAmount < 1e6 ? 1 : 0)}M CFG · {a.note}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-secondary/20">
      <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-display font-semibold text-foreground text-sm">{value}</div>
      </div>
    </div>
  );
}
