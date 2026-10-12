/**
 * EquityCurve — Account performance chart (Recharts AreaChart).
 *
 * Plots account equity over time with a gradient fill. Shows the starting
 * balance as a reference line and highlights drawdown periods. Used in both
 * the trading terminal and trader dashboard.
 *
 * @param {Array} trades - Closed trade history with timestamps and P&L
 * @param {number} startingBalance - Initial account balance for the reference line
 */
import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtcDate } from "@/lib/datetime";
import { useChartColors } from "@/lib/useChartColors";

export default function EquityCurve({ trades = [] }) {
  const colors = useChartColors();

  const chartData = useMemo(() => {
    const closed = trades
      .filter(t => t.status === "closed" && t.close_time && t.pnl != null)
      .sort((a, b) => new Date(a.close_time) - new Date(b.close_time));

    let cum = 0;
    return closed.map(t => {
      cum += t.pnl;
      return {
        label: formatUtcDate(t.close_time, { year: false }),
        cumPnl: parseFloat(cum.toFixed(2)),
      };
    });
  }, [trades]);

  if (chartData.length < 2) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">
              Close more trades to see your equity curve
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const vals = chartData.map(d => d.cumPnl);
  const yMin = Math.min(...vals, 0);
  const yMax = Math.max(...vals, 0);
  const range = yMax - yMin || 1;
  // Fraction from SVG top where y=0 lives (SVG y-axis is inverted)
  const zeroFrac = yMax / range;

  const lastVal = chartData[chartData.length - 1].cumPnl;
  const isPositive = lastVal >= 0;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Equity Curve</CardTitle>
          <span className={`text-sm font-bold font-grotesk ${isPositive ? "text-green-400" : "text-red-400"}`}>
            {lastVal >= 0 ? "+" : ""}${lastVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-2">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {/* Fill: green above zero, red below */}
              <linearGradient id="ecFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.up} stopOpacity={0.25} />
                <stop offset={`${zeroFrac * 100}%`} stopColor={colors.up} stopOpacity={0.05} />
                <stop offset={`${zeroFrac * 100}%`} stopColor={colors.down} stopOpacity={0.05} />
                <stop offset="100%" stopColor={colors.down} stopOpacity={0.25} />
              </linearGradient>
              {/* Stroke: green above zero, red below */}
              <linearGradient id="ecStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${zeroFrac * 100}%`} stopColor={colors.up} />
                <stop offset={`${zeroFrac * 100}%`} stopColor={colors.down} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: colors.textColor }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: colors.textColor }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v =>
                v === 0 ? "$0"
                : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k`
                : `$${v.toFixed(0)}`
              }
              domain={[yMin, yMax]}
              width={40}
            />
            <ReferenceLine y={0} stroke={colors.refLine} strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{
                background: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: "6px",
                fontSize: "11px",
                color: colors.tooltipText,
              }}
              formatter={v => [
                `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`,
                "Cumulative P&L",
              ]}
              labelStyle={{ color: colors.tooltipLabel, marginBottom: 2 }}
            />
            <Area
              type="monotone"
              dataKey="cumPnl"
              stroke="url(#ecStroke)"
              strokeWidth={1.5}
              fill="url(#ecFill)"
              dot={false}
              activeDot={{ r: 3, fill: isPositive ? colors.up : colors.down, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
