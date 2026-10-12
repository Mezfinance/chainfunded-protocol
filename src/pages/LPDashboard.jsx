import SEO from "@/components/SEO";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Droplets, RefreshCw, TrendingUp, Wallet, DollarSign, Gift, Trash2, Coins, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUtcDate } from "@/lib/datetime";
import PoolStats from "../components/lp/PoolStats";
import DepositWithdraw from "../components/lp/DepositWithdraw";
import { useChainFundedPool } from "@/hooks/useChainFundedPool";

const STATUS_COLORS = {
  active: "bg-green-500/10 text-green-400 border-green-500/30",
  withdrawn: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function LPDashboard() {
  const { address, isAdmin } = useAuth();
  const [positions, setPositions] = useState([]);
  const [posLoading, setPosLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Unique LP addresses from all positions — passed to hook so it fetches live yield for each
  const lpAddresses = [...new Set(positions.map((p) => p.lp_address).filter(Boolean))];

  // Live on-chain data — polls every 15s
  const onChain = useChainFundedPool(address, lpAddresses);

  const fetchPositions = async () => {
    setPosLoading(true);
    try {
      const pos = await base44.entities.LPPosition.list("-created_date", 50);
      setPositions(Array.isArray(pos) ? pos : []);
    } catch (err) {
      console.error("Failed to load positions:", err);
    } finally {
      setPosLoading(false);
    }
  };

  useEffect(() => { fetchPositions(); }, []);

  const handleDeletePosition = async (id) => {
    setDeletingId(id);
    try {
      await base44.entities.LPPosition.delete(id);
      setPositions((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete position:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRefresh = () => {
    onChain.refetch();
    fetchPositions();
  };

  const activePositions = positions.filter((p) => p.status === "active");
  const loading = onChain.loading || posLoading;

  return (
    <div className="space-y-8">
      <SEO title="Liquidity Provider Dashboard" noindex />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-grotesk font-bold text-foreground flex items-center gap-2">
            <Droplets className="w-6 h-6 text-primary" /> LP Pool
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Deploy capital to back trader payouts and earn a share of challenge fee income
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* LP Capital Risk Warning */}
      <div className="bg-red-500/5 border border-red-500/25 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-red-400">Capital at Risk</p>
          <p className="text-muted-foreground">
            Your deposited USDC backs <span className="text-foreground">real trader payouts</span>. If cumulative payouts exceed challenge fee income, your deposited capital may be reduced. LP positions are not guaranteed and carry the risk of partial or total loss.
          </p>
          <p className="text-muted-foreground">
            Only deposit funds you can afford to lose. Past yield figures do not guarantee future returns. Withdrawals are subject to pool liquidity at the time of withdrawal.
          </p>
        </div>
      </div>

      {/* Contract error */}
      {onChain.error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {onChain.error}
        </div>
      )}

      {/* Pool Stats — live from contract */}
      {onChain.loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border">
              <CardContent className="pt-5 pb-4">
                <div className="w-8 h-8 rounded-lg bg-secondary animate-pulse mb-3" />
                <div className="h-5 w-24 bg-secondary animate-pulse rounded mb-2" />
                <div className="h-3 w-16 bg-secondary animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <PoolStats onChain={onChain} activeLpCount={activePositions.length} />
      )}

      {/* Info Banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Active LPs:</span>
          <span className="text-foreground font-semibold">{activePositions.length}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">LP Capital:</span>
          <span className="text-foreground font-semibold">
            {onChain.lpCapitalUsdc != null
              ? `$${onChain.lpCapitalUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Gift className="w-4 h-4 text-green-400" />
          <span className="text-muted-foreground">Profit Pool:</span>
          <span className="text-green-400 font-semibold">
            {onChain.profitPoolUsdc != null
              ? `$${onChain.profitPoolUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">CFND NAV:</span>
          <span className={`font-semibold ${onChain.cfndPriceUsdc != null && onChain.cfndPriceUsdc < 0.99 ? "text-yellow-400" : "text-primary"}`}>
            {onChain.cfndPriceUsdc != null ? `$${onChain.cfndPriceUsdc.toFixed(4)}` : "—"}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deposit / Withdraw */}
        <div className="lg:col-span-1">
          <DepositWithdraw onChain={onChain} onSuccess={handleRefresh} />
        </div>

        {/* Positions Table */}
        <div className="lg:col-span-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" /> LP Positions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {positions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No LP positions yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="text-left text-xs text-muted-foreground px-4 py-2">LP Address</th>
                        <th className="text-right text-xs text-muted-foreground px-4 py-2">Total Deposited</th>
                        <th className="text-right text-xs text-muted-foreground px-4 py-2">CFND Tokens</th>
                        <th className="text-right text-xs text-muted-foreground px-4 py-2">Yield Earned</th>
                        <th className="text-right text-xs text-muted-foreground px-4 py-2">Last Deposit</th>
                        <th className="text-right text-xs text-muted-foreground px-4 py-2">Status</th>
                        {isAdmin && <th className="w-8 px-4 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Aggregate positions by LP address
                        const byAddress = new Map();
                        for (const pos of positions) {
                          const addr = pos.lp_address || "unknown";
                          const existing = byAddress.get(addr);
                          if (existing) {
                            existing.totalDeposited += pos.usdc_deposited ?? 0;
                            existing.totalCfnd += pos.cfnd_tokens ?? 0;
                            existing.yieldDb += pos.yield_earned_usdc ?? 0;
                            if (pos.deposit_date > (existing.latestDate || "")) existing.latestDate = pos.deposit_date;
                            if (pos.status === "active") existing.status = "active";
                            existing.ids.push(pos.id);
                          } else {
                            byAddress.set(addr, {
                              address: addr,
                              totalDeposited: pos.usdc_deposited ?? 0,
                              totalCfnd: pos.cfnd_tokens ?? 0,
                              yieldDb: pos.yield_earned_usdc ?? 0,
                              latestDate: pos.deposit_date,
                              status: pos.status,
                              ids: [pos.id],
                            });
                          }
                        }

                        return [...byAddress.values()].map((lp) => (
                        <tr key={lp.address} className="border-b border-border/50 hover:bg-secondary/20">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {lp.address.length > 12
                              ? `${lp.address.slice(0, 6)}...${lp.address.slice(-4)}`
                              : lp.address}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground">
                            ${lp.totalDeposited.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-yellow-400">
                            {lp.totalCfnd.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-green-400">
                            {onChain.lpYields?.[lp.address] != null
                              ? `$${onChain.lpYields[lp.address].toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                              : `$${lp.yieldDb.toLocaleString()}`}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                            {lp.latestDate
                              ? (() => {
                                  try {
                                    return formatUtcDate(lp.latestDate);
                                  } catch {
                                    return lp.latestDate;
                                  }
                                })()
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge
                              variant="outline"
                              className={`text-xs ${STATUS_COLORS[lp.status]}`}
                            >
                              {lp.status}
                            </Badge>
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => lp.ids.forEach((id) => handleDeletePosition(id))}
                                disabled={lp.ids.some((id) => deletingId === id)}
                                className="text-muted-foreground/40 hover:text-red-400 transition-colors disabled:opacity-30"
                                title="Delete all positions for this LP"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
