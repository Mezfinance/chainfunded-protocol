/**
 * useChartIndicators — manages indicator series on the chart. Overlays render
 * on the main price scale (pane 0); oscillators (RSI, MACD) render in their own
 * sub-panes below. Active indicators persist per wallet+symbol and recompute
 * whenever the candle data (candlesVersion) or a config changes.
 *
 * Sub-pane series are rebuilt only when the sub-pane set/order changes (so pane
 * indices stay contiguous); data ticks just call setData on existing series.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LineSeries, HistogramSeries, LineStyle } from "lightweight-charts";
import { INDICATORS } from "./indicators";
import { loadIndicators, saveIndicators, newIndicatorId } from "./indicatorStore";

export function useChartIndicators({ chartRef, candlesRef, chartReady, candlesVersion, symbol, wallet }) {
  const [indicators, setIndicators] = useState([]);
  const seriesMapRef = useRef(new Map()); // id -> ISeriesApi[]
  const subSigRef = useRef("");
  const walletRef = useRef(wallet);
  const symbolRef = useRef(symbol);
  useEffect(() => { walletRef.current = wallet; symbolRef.current = symbol; }, [wallet, symbol]);

  const persist = useCallback((next) => saveIndicators(walletRef.current, symbolRef.current, next), []);

  const addIndicator = useCallback((type) => {
    const def = INDICATORS[type];
    if (!def) return;
    setIndicators((prev) => {
      const params = { ...def.defaults };
      // Single-instance indicators (everything except moving averages) can only
      // be added once. Moving averages allow multiples, but not an exact
      // duplicate (same type + same params) — that's just an invisible overlap.
      const dup = prev.some((i) => i.type === type
        && (!def.allowMultiple || JSON.stringify(i.params) === JSON.stringify(params)));
      if (dup) return prev;
      const next = [...prev, { id: newIndicatorId(), type, params }];
      persist(next);
      return next;
    });
  }, [persist]);

  const removeIndicator = useCallback((id) => {
    setIndicators((prev) => { const next = prev.filter((i) => i.id !== id); persist(next); return next; });
  }, [persist]);

  const updateIndicator = useCallback((id, params) => {
    setIndicators((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, params: { ...i.params, ...params } } : i));
      persist(next);
      return next;
    });
  }, [persist]);

  // Replace the whole indicator set (used when applying a saved layout).
  const replaceIndicators = useCallback((list) => {
    const next = (list || [])
      .filter((i) => INDICATORS[i.type])
      .map((i) => ({ id: newIndicatorId(), type: i.type, params: { ...INDICATORS[i.type].defaults, ...i.params } }));
    persist(next);
    setIndicators(next);
  }, [persist]);

  useEffect(() => { setIndicators(loadIndicators(wallet, symbol)); }, [symbol, wallet]);

  useEffect(() => {
    if (!chartReady) return;
    const chart = chartRef.current;
    if (!chart) return;
    const candles = candlesRef.current || [];
    const map = seriesMapRef.current;

    const isSub = (i) => INDICATORS[i.type]?.pane === "sub";
    const subs = indicators.filter(isSub);

    const addLine = (l, paneIndex) => chart.addSeries(
      l.kind === "hist" ? HistogramSeries : LineSeries,
      {
        color: l.color,
        lineWidth: l.width || 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      paneIndex,
    );

    // Drop series for indicators that were removed.
    for (const [id, arr] of map) {
      if (!indicators.find((i) => i.id === id)) {
        arr.forEach((s) => { try { chart.removeSeries(s); } catch { /* noop */ } });
        map.delete(id);
      }
    }

    // Rebuild sub-pane series when their set/order changes (keeps pane indices
    // contiguous), then drop any now-empty trailing panes.
    const subSig = subs.map((i) => `${i.id}:${i.type}`).join("|");
    if (subSig !== subSigRef.current) {
      for (const i of subs) {
        const arr = map.get(i.id);
        if (arr) { arr.forEach((s) => { try { chart.removeSeries(s); } catch { /* noop */ } }); map.delete(i.id); }
      }
      subs.forEach((ind, idx) => {
        const def = INDICATORS[ind.type];
        const paneIndex = idx + 1;
        const lines = def.lines(candles, ind.params);
        const arr = lines.map((l) => addLine(l, paneIndex));
        if (def.refLines) {
          def.refLines.forEach((price) => {
            try { arr[0].createPriceLine({ price, color: "#475569", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }); } catch { /* noop */ }
          });
        }
        map.set(ind.id, arr);
      });
      try {
        const wanted = 1 + subs.length;
        const panes = chart.panes();
        for (let pi = panes.length - 1; pi >= wanted; pi--) { try { chart.removePane(pi); } catch { /* noop */ } }
        // Keep the main pane dominant.
        chart.panes()[0]?.setStretchFactor?.(3);
        for (let pi = 1; pi <= subs.length; pi++) chart.panes()[pi]?.setStretchFactor?.(1);
      } catch { /* pane sizing best-effort */ }
      subSigRef.current = subSig;
    }

    // Create/update overlays incrementally; setData all series.
    for (const ind of indicators) {
      const def = INDICATORS[ind.type];
      if (!def) continue;
      const lines = def.lines(candles, ind.params);
      let arr = map.get(ind.id);
      if (!isSub(ind) && (!arr || arr.length !== lines.length)) {
        if (arr) arr.forEach((s) => { try { chart.removeSeries(s); } catch { /* noop */ } });
        arr = lines.map((l) => addLine(l, 0));
        map.set(ind.id, arr);
      }
      if (arr) lines.forEach((l, i) => arr[i]?.setData(l.data));
    }
  }, [indicators, candlesVersion, chartReady, chartRef, candlesRef]);

  useEffect(() => {
    if (chartReady) return undefined;
    return () => { seriesMapRef.current = new Map(); subSigRef.current = ""; };
  }, [chartReady]);

  return { indicators, addIndicator, removeIndicator, updateIndicator, replaceIndicators };
}
