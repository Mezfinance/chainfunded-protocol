import { useTheme } from "next-themes";
import { useMemo } from "react";

/**
 * Returns chart color tokens that adapt to the current theme.
 * Used by CandlestickChart and EquityCurve where libraries need raw color strings.
 */
export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return useMemo(() => ({
    // Semantic P&L colors — forest in light, bright in dark
    up: isDark ? "#22c55e" : "#38a25f",
    down: isDark ? "#ef4444" : "#dc4b4b",
    upFaded: isDark ? "rgba(34,197,94,0.35)" : "rgba(56,162,95,0.30)",
    downFaded: isDark ? "rgba(239,68,68,0.35)" : "rgba(220,75,75,0.30)",

    // Layout / chrome
    textColor: isDark ? "rgba(255,255,255,0.35)" : "rgba(21,47,27,0.50)",
    gridColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(21,47,27,0.06)",
    crosshairColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(21,47,27,0.30)",
    labelBg: isDark ? "#18181b" : "#ffffff",
    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(21,47,27,0.08)",

    // Tooltip
    tooltipBg: isDark ? "#18181b" : "#ffffff",
    tooltipBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(21,47,27,0.12)",
    tooltipText: isDark ? "rgba(255,255,255,0.8)" : "rgba(21,47,27,0.85)",
    tooltipLabel: isDark ? "rgba(255,255,255,0.4)" : "rgba(21,47,27,0.50)",

    // Reference lines
    refLine: isDark ? "rgba(255,255,255,0.2)" : "rgba(21,47,27,0.15)",

    isDark,
  }), [isDark]);
}
