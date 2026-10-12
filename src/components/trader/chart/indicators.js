/**
 * Indicator math + registry. Each indicator turns candle data into one or more
 * lines/histograms. Overlays (default) draw on the main price scale; entries
 * flagged `pane: "sub"` (RSI, MACD, Stochastic, ATR, Volume) render in their
 * own pane below the chart.
 *
 * VWAP (volume-based) is still pending a decentralised volume source. Volume
 * bars only populate where the feed supplies volume (crypto exchanges and
 * AV-merged Pyth assets); pure-Pyth bars have none.
 */
function sma(candles, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

function ema(candles, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close;
    prev = i === 0 ? c : c * k + prev * (1 - k);
    if (i >= period - 1) out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

function bollinger(candles, period, mult) {
  const mid = []; const up = []; const lo = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const m = sum / period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) { const d = candles[j].close - m; v += d * d; }
    const sd = Math.sqrt(v / period);
    const t = candles[i].time;
    mid.push({ time: t, value: m });
    up.push({ time: t, value: m + mult * sd });
    lo.push({ time: t, value: m - mult * sd });
  }
  return { mid, up, lo };
}

function rsi(candles, period) {
  const out = [];
  if (candles.length <= period) return out;
  let gain = 0; let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = candles[i].close - candles[i - 1].close;
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  gain /= period; loss /= period;
  const push = (i) => {
    const rs = loss === 0 ? Infinity : gain / loss;
    out.push({ time: candles[i].time, value: loss === 0 ? 100 : 100 - 100 / (1 + rs) });
  };
  push(period);
  for (let i = period + 1; i < candles.length; i++) {
    const ch = candles[i].close - candles[i - 1].close;
    const g = ch >= 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    push(i);
  }
  return out;
}

function emaArr(vals, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev;
  for (let i = 0; i < vals.length; i++) {
    prev = i === 0 ? vals[i] : vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function smaSeries(arr, period) {
  if (period <= 1) return arr.slice();
  const out = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i].value;
    if (i >= period) sum -= arr[i - period].value;
    if (i >= period - 1) out.push({ time: arr[i].time, value: sum / period });
  }
  return out;
}

// Stochastic %K/%D: raw %K = position of close within the period high-low
// range, smoothed by smoothK; %D = SMA of %K over smoothD.
function stochastic(candles, period, smoothK, smoothD) {
  const rawK = [];
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity; let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    rawK.push({ time: candles[i].time, value: range === 0 ? 0 : (100 * (candles[i].close - ll)) / range });
  }
  const k = smaSeries(rawK, smoothK);
  const d = smaSeries(k, smoothD);
  return { k, d };
}

// Average True Range via Wilder's smoothing (RMA).
function atr(candles, period) {
  if (candles.length < 2) return [];
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high; const l = candles[i].low; const pc = candles[i - 1].close;
    tr.push({ time: candles[i].time, value: Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)) });
  }
  if (tr.length < period) return [];
  const out = [];
  let prev = 0;
  for (let i = 0; i < period; i++) prev += tr[i].value;
  prev /= period;
  out.push({ time: tr[period - 1].time, value: prev });
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i].value) / period;
    out.push({ time: tr[i].time, value: prev });
  }
  return out;
}

// Volume bars, coloured up/down by candle direction. Volume is only present on
// candles where the feed supplies it (crypto exchanges, AV-merged Pyth assets);
// candles without it are skipped.
function volumeBars(candles) {
  const out = [];
  for (const c of candles) {
    if (!Number.isFinite(c.volume) || c.volume <= 0) continue;
    out.push({ time: c.time, value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)" });
  }
  return out;
}

function macd(candles, fast, slow, signal) {
  const closes = candles.map((c) => c.close);
  const ef = emaArr(closes, fast);
  const es = emaArr(closes, slow);
  const macdLine = closes.map((_, i) => ef[i] - es[i]);
  const sig = emaArr(macdLine, signal);
  const out = { macd: [], signal: [], hist: [] };
  for (let i = slow; i < candles.length; i++) {
    const t = candles[i].time;
    const h = macdLine[i] - sig[i];
    out.macd.push({ time: t, value: macdLine[i] });
    out.signal.push({ time: t, value: sig[i] });
    out.hist.push({ time: t, value: h, color: h >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)" });
  }
  return out;
}

export const INDICATORS = {
  sma: {
    label: "SMA",
    legendColor: "#3b82f6",
    allowMultiple: true,
    summary: (p) => `SMA ${p.period}`,
    defaults: { period: 20 },
    lines: (c, p) => [{ key: "sma", data: sma(c, p.period), color: "#3b82f6", width: 1.5 }],
  },
  ema: {
    label: "EMA",
    legendColor: "#f59e0b",
    allowMultiple: true,
    summary: (p) => `EMA ${p.period}`,
    defaults: { period: 21 },
    lines: (c, p) => [{ key: "ema", data: ema(c, p.period), color: "#f59e0b", width: 1.5 }],
  },
  bb: {
    label: "Bollinger Bands",
    legendColor: "#94a3b8",
    summary: (p) => `BB ${p.period}, ${p.mult}`,
    defaults: { period: 20, mult: 2 },
    lines: (c, p) => {
      const b = bollinger(c, p.period, p.mult);
      return [
        { key: "mid", data: b.mid, color: "#94a3b8", width: 1 },
        { key: "up", data: b.up, color: "#22c55e", width: 1 },
        { key: "lo", data: b.lo, color: "#ef4444", width: 1 },
      ];
    },
  },
  rsi: {
    label: "RSI",
    pane: "sub",
    legendColor: "#a855f7",
    summary: (p) => `RSI ${p.period}`,
    defaults: { period: 14 },
    refLines: [70, 30],
    lines: (c, p) => [{ key: "rsi", data: rsi(c, p.period), color: "#a855f7", width: 1.5 }],
  },
  macd: {
    label: "MACD",
    pane: "sub",
    legendColor: "#3b82f6",
    summary: (p) => `MACD ${p.period},${p.slow},${p.signal}`,
    defaults: { period: 12, slow: 26, signal: 9 },
    lines: (c, p) => {
      const m = macd(c, p.period, p.slow, p.signal);
      return [
        { key: "hist", data: m.hist, kind: "hist" },
        { key: "macd", data: m.macd, color: "#3b82f6", width: 1.5 },
        { key: "signal", data: m.signal, color: "#f59e0b", width: 1.5 },
      ];
    },
  },
  stoch: {
    label: "Stochastic",
    pane: "sub",
    legendColor: "#3b82f6",
    summary: (p) => `Stoch ${p.period} ${p.smoothK} ${p.smoothD}`,
    defaults: { period: 14, smoothK: 3, smoothD: 3 },
    refLines: [80, 20],
    lines: (c, p) => {
      const s = stochastic(c, p.period, p.smoothK ?? 3, p.smoothD ?? 3);
      return [
        { key: "k", data: s.k, color: "#3b82f6", width: 1.5 },
        { key: "d", data: s.d, color: "#f59e0b", width: 1.5 },
      ];
    },
  },
  atr: {
    label: "ATR",
    pane: "sub",
    legendColor: "#06b6d4",
    summary: (p) => `ATR ${p.period}`,
    defaults: { period: 14 },
    lines: (c, p) => [{ key: "atr", data: atr(c, p.period), color: "#06b6d4", width: 1.5 }],
  },
  volume: {
    label: "Volume",
    pane: "sub",
    legendColor: "#94a3b8",
    summary: () => "Volume",
    defaults: {},
    lines: (c) => [{ key: "vol", data: volumeBars(c), kind: "hist" }],
  },
};

export const INDICATOR_LIST = Object.entries(INDICATORS).map(([type, def]) => ({ type, label: def.label }));
