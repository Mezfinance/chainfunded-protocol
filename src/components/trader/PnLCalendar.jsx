/**
 * PnLCalendar — Calendar heatmap of daily trading P&L.
 *
 * Renders a month-view calendar with each day coloured by net P&L:
 * green for profitable days, red for losing days, intensity scaled by
 * magnitude. Supports month navigation. Used in the trader dashboard.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function PnLCalendar({ trades = [] }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [hoveredDay, setHoveredDay] = useState(null);

  const year = viewDate.getUTCFullYear();
  const month = viewDate.getUTCMonth();

  // Map: dateStr → { pnl, trades[] }
  // Bucket by UTC calendar day to match the platform's rule engine — the
  // worker resets daily drawdown and counts trading days on UTC midnight
  // (see worker/executors.js + RuleGauges). Using local time here is what
  // made trades appear on a different day than the rules enforced.
  const dailyData = useMemo(() => {
    const map = {};
    trades
      .filter(t => t.status === "closed" && t.close_time && t.pnl != null)
      .forEach(t => {
        const day = new Date(t.close_time).toISOString().slice(0, 10); // UTC YYYY-MM-DD
        if (!map[day]) map[day] = { pnl: 0, trades: [] };
        map[day].pnl += t.pnl;
        map[day].trades.push(t);
      });
    return map;
  }, [trades]);

  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewDate(new Date(Date.UTC(year, month - 1, 1)));
  const nextMonth = () => setViewDate(new Date(Date.UTC(year, month + 1, 1)));

  const today = new Date();
  const isToday = (d) => d === today.getUTCDate() && month === today.getUTCMonth() && year === today.getUTCFullYear();

  return (
    <Card className="border-border overflow-visible">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Daily P&L Calendar
            <span
              className="text-[10px] font-mono uppercase tracking-wider text-primary/80 border border-primary/30 rounded px-1 py-0.5"
              title="Days are bucketed by UTC, matching the daily-loss reset and trading-day count enforced on-chain."
            >
              UTC
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-foreground w-28 text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;

            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const data = dailyData[dateStr];
            const pnl = data?.pnl;
            const hasData = pnl !== undefined;
            const isProfit = hasData && pnl > 0;
            const isLoss = hasData && pnl < 0;
            const isHovered = hoveredDay === dateStr;

            return (
              <div
                key={day}
                className={`
                  relative flex flex-col items-center justify-center rounded-lg py-1.5 px-0.5 min-h-[52px] text-center cursor-default
                  ${isProfit ? "bg-green-500/10 border border-green-500/20" : ""}
                  ${isLoss ? "bg-red-500/10 border border-red-500/20" : ""}
                  ${!hasData ? "bg-secondary/30 border border-transparent" : ""}
                  ${isToday(day) ? "ring-1 ring-primary/60" : ""}
                  ${isHovered && hasData ? "z-10" : ""}
                `}
                onMouseEnter={() => setHoveredDay(hasData ? dateStr : null)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                <span className={`text-xs font-medium ${isToday(day) ? "text-primary" : "text-muted-foreground"}`}>
                  {day}
                </span>
                {hasData && (
                  <span className={`text-[10px] font-semibold mt-0.5 leading-tight ${isProfit ? "text-green-400" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}${Math.abs(pnl) >= 1000
                      ? `${(pnl / 1000).toFixed(1)}k`
                      : pnl.toFixed(0)}
                  </span>
                )}

                {/* Hover tooltip */}
                {isHovered && data?.trades?.length > 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-44 bg-card border border-border rounded-lg shadow-xl p-2 pointer-events-none">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">
                      {data.trades.length} trade{data.trades.length > 1 ? "s" : ""} · {dateStr}
                    </p>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {data.trades.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-1">
                          <span className="text-[10px] text-foreground truncate">{t.symbol}</span>
                          <span className={`text-[10px] font-semibold shrink-0 ${(t.pnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {(t.pnl ?? 0) >= 0 ? "+" : ""}${(t.pnl ?? 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={`border-t border-border/50 mt-1.5 pt-1 text-[10px] font-semibold flex justify-between ${isProfit ? "text-green-400" : "text-red-400"}`}>
                      <span>Total</span>
                      <span>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
            <span className="text-xs text-muted-foreground">Profit day</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
            <span className="text-xs text-muted-foreground">Loss day</span>
          </div>
          <span className="text-xs text-muted-foreground ml-auto">Hover for details</span>
        </div>
      </CardContent>
    </Card>
  );
}
