/**
 * PoolStats — LP pool health dashboard cards.
 *
 * Displays key pool metrics: total value locked (TVL), CFND supply,
 * solvency ratio, NAV per CFND, active LP count, and profit pool.
 * Data read from ChainFundedPool contract via useChainFundedPool hook.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Droplets, TrendingUp, DollarSign, Coins, Gift, ShieldCheck } from "lucide-react";

function solvencyColor(ratio) {
  if (ratio == null) return { color: "text-muted-foreground", bg: "bg-secondary" };
  if (ratio >= 1.0)  return { color: "text-green-400",  bg: "bg-green-500/10" };
  if (ratio >= 0.8)  return { color: "text-yellow-400", bg: "bg-yellow-500/10" };
  return { color: "text-red-400", bg: "bg-red-500/10" };
}

function navColor(price) {
  if (price == null) return "text-blue-400";
  if (price >= 0.99) return "text-blue-400";
  if (price >= 0.80) return "text-yellow-400";
  return "text-red-400";
}

/**
 * @param {object} onChain - Live data from useChainFundedPool
 * @param {number} activeLpCount - Number of active LP positions (from Base44)
 */
export default function PoolStats({ onChain = {}, activeLpCount = 0 }) {
  const { lpCapitalUsdc, profitPoolUsdc, cfndSupply, cfndPriceUsdc, solvencyRatio } = onChain;

  const fmt = (n, decimals = 2) =>
    n != null ? n.toLocaleString(undefined, { maximumFractionDigits: decimals }) : "—";

  const solv = solvencyColor(solvencyRatio);
  const navC = navColor(cfndPriceUsdc);

  const stats = [
    {
      label: "LP Capital",
      value: lpCapitalUsdc != null ? `$${fmt(lpCapitalUsdc)}` : "—",
      sub: "Deployed capital backing trades",
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "LP Profit Pool",
      value: profitPoolUsdc != null ? `$${fmt(profitPoolUsdc)}` : "—",
      sub: "Accrued fee share (claimable)",
      icon: Gift,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Solvency Ratio",
      value: solvencyRatio != null ? `${(solvencyRatio * 100).toFixed(1)}%` : "—",
      sub: solvencyRatio != null && solvencyRatio < 1.0
        ? "Pool depleted — withdrawals pro-rated"
        : "Capital / CFND supply",
      icon: ShieldCheck,
      color: solv.color,
      bg: solv.bg,
    },
    {
      label: "CFND NAV",
      value: cfndPriceUsdc != null ? `$${cfndPriceUsdc.toFixed(4)}` : "—",
      sub: cfndPriceUsdc != null && cfndPriceUsdc < 0.99
        ? "Below peg — capital impaired"
        : "Price per CFND token",
      icon: TrendingUp,
      color: navC,
      bg: cfndPriceUsdc != null && cfndPriceUsdc < 0.99 ? "bg-yellow-500/10" : "bg-blue-500/10",
    },
    {
      label: "CFND Supply",
      value: cfndSupply != null ? fmt(cfndSupply) : "—",
      sub: "Tokens outstanding",
      icon: Coins,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Active LPs",
      value: activeLpCount.toString(),
      sub: "Liquidity providers",
      icon: Droplets,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
        <Card key={label} className="border-border">
          <CardContent className="pt-5 pb-4">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-lg font-grotesk font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
