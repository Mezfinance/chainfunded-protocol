/**
 * CandlestickChart — Live price chart using TradingView Lightweight Charts.
 *
 * All OHLC candle data comes from the worker (consistent with the live ticker,
 * which streams from the same worker). Volume is overlaid from exchange REST
 * (crypto) or Alpha Vantage (stocks). Live candle updates poll every 2s.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getAssetConfig, ASSET_CLASS } from "@/lib/assetConfig";
import { getMarketStatus } from "@/lib/marketHours";
import { getStartProviderIdx } from "@/lib/geoProvider";
import { fetchCandles as fetchCandlesFromWorker } from "@/lib/workerCandles";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import { useChartColors } from "@/lib/useChartColors";
import { useAuth } from "@/lib/AuthContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { PencilRuler, CandlestickChart as CandleIcon, LineChart as LineIcon, AreaChart as AreaIcon, ChevronDown } from "lucide-react";
import DrawingToolbar from "./chart/DrawingToolbar";
import { useChartDrawings } from "./chart/useChartDrawings";
import IndicatorMenu from "./chart/IndicatorMenu";
import IndicatorLegend from "./chart/IndicatorLegend";
import { useChartIndicators } from "./chart/useChartIndicators";
import LayoutMenu from "./chart/LayoutMenu";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
// On mobile the full set doesn't fit, so we surface a primary subset inline and
// tuck the rest behind a "More" dropdown. Desktop still shows all of them.
const MORE_TIMEFRAMES = ["1m", "4h", "1w", "1M"];

// Monthly candles are crypto-only: Binance offers a 1M kline, eToro rejects the
// interval outright, so FX, commodities and stocks have no monthly source.
// Offering the button anywhere else just produces an empty chart.
const CRYPTO_ONLY_TIMEFRAMES = new Set(["1M"]);
const DEFAULT_TIMEFRAME = "1h";
const FALLBACK_TIMEFRAME = "1w"; // coarsest frame every asset class supports

function timeframesFor(assetClass) {
  if (assetClass === ASSET_CLASS.CRYPTO) return TIMEFRAMES;
  return TIMEFRAMES.filter((tf) => !CRYPTO_ONLY_TIMEFRAMES.has(tf));
}

// ── Exchange REST fallback for crypto candles + volume ──────────────────────
// Used ONLY when the worker's candle endpoint fails (see fetchCandles) and for
// the volume overlay (neither provider has volume). Order is GEO-AWARE, which
// is why this path is unreliable for blocked regions: getStartProviderIdx
// (geoProvider.js) picks the best starting exchange for the user's region —
// e.g. US → Binance.US, China/Canada/UK → OKX, much of Africa/Europe → Bybit —
// then we wrap through the rest. Indices match geoProvider's mapping:
//   0 Binance.com · 1 Binance.US · 2 Tokocrypto · 3 OKX · 4 Bybit
const OKX_BARS = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H",
  "4h": "4H", "1d": "1D", "1w": "1W",
};
const BYBIT_INTERVALS = {
  "1m": "1", "5m": "5", "15m": "15", "1h": "60",
  "4h": "240", "1d": "D", "1w": "W",
};
const toOkxSymbol = (s) => s.replace(/USDT$/, "-USDT");

const EXCHANGE_PROVIDERS = [
  { kind: "binance", host: "https://api.binance.com" },   // 0
  { kind: "binance", host: "https://api.binance.us" },    // 1
  { kind: "binance", host: "https://www.tokocrypto.site" }, // 2
  { kind: "okx" },                                         // 3
  { kind: "bybit" },                                       // 4
];

// Geo-aware provider order: start at the best provider for the user's region,
// then wrap through the rest. Defaults to index 0 if geo detection fails.
async function exchangeOrder() {
  let start = 0;
  try { start = await getStartProviderIdx(); } catch { start = 0; }
  if (!Number.isInteger(start) || start < 0 || start >= EXCHANGE_PROVIDERS.length) start = 0;
  return EXCHANGE_PROVIDERS.map((_, i) => (start + i) % EXCHANGE_PROVIDERS.length);
}

// One provider → OHLCV candles in Binance format [ms, o, h, l, c, v].
async function providerCandles(p, symbol, interval, limit, endTime) {
  if (p.kind === "binance") {
    let url = `${p.host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    return res.json();
  }
  if (p.kind === "okx") {
    const bar = OKX_BARS[interval] || interval;
    let url = `https://www.okx.com/api/v5/market/candles?instId=${toOkxSymbol(symbol)}&bar=${bar}&limit=300`;
    if (endTime) url += `&after=${endTime}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.code === "0" && json.data?.length) {
      return json.data.slice().reverse().map((k) => [Number(k[0]), k[1], k[2], k[3], k[4], k[5]]);
    }
    throw new Error("okx empty");
  }
  // bybit
  const bybitInt = BYBIT_INTERVALS[interval] || interval;
  let url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInt}&limit=${limit}`;
  if (endTime) url += `&end=${endTime}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = await res.json();
  if (json.retCode === 0 && json.result?.list?.length) {
    return json.result.list.slice().reverse().map((k) => [Number(k[0]), k[1], k[2], k[3], k[4], k[5], k[6]]);
  }
  throw new Error("bybit empty");
}

/** Crypto candle fallback (Binance/OKX/Bybit), geo-ordered. */
async function fetchExchangeCandles(symbol, interval, limit = 1000, endTime = null) {
  for (const idx of await exchangeOrder()) {
    try {
      const data = await providerCandles(EXCHANGE_PROVIDERS[idx], symbol, interval, limit, endTime);
      if (Array.isArray(data) && data.length) return data;
    } catch { /* try next provider */ }
  }
  throw new Error("All exchange kline endpoints failed");
}

// One provider → volume map { [unixSeconds]: volume }, or null.
async function providerVolume(p, symbol, interval) {
  if (p.kind === "binance") {
    const url = `${p.host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const data = await res.json();
    const map = {};
    for (const k of data) map[Math.floor(Number(k[0]) / 1000)] = parseFloat(k[5]);
    return Object.keys(map).length > 0 ? map : null;
  }
  if (p.kind === "okx") {
    const bar = OKX_BARS[interval] || interval;
    const url = `https://www.okx.com/api/v5/market/candles?instId=${toOkxSymbol(symbol)}&bar=${bar}&limit=300`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    if (json.code === "0" && json.data?.length) {
      const map = {};
      for (const k of json.data) map[Math.floor(Number(k[0]) / 1000)] = parseFloat(k[5]);
      return Object.keys(map).length > 0 ? map : null;
    }
    throw new Error("okx empty");
  }
  // bybit
  const bybitInt = BYBIT_INTERVALS[interval] || interval;
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInt}&limit=1000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const json = await res.json();
  if (json.retCode === 0 && json.result?.list?.length) {
    const map = {};
    for (const k of json.result.list) map[Math.floor(Number(k[0]) / 1000)] = parseFloat(k[5]);
    return Object.keys(map).length > 0 ? map : null;
  }
  throw new Error("bybit empty");
}

/** Crypto volume overlay (Binance/OKX/Bybit), geo-ordered. */
async function fetchExchangeVolume(symbol, interval) {
  for (const idx of await exchangeOrder()) {
    try {
      const map = await providerVolume(EXCHANGE_PROVIDERS[idx], symbol, interval);
      if (map) return map;
    } catch { /* try next provider */ }
  }
  return null;
}

// ── Alpha Vantage volume overlay for non-crypto assets ───────────────────────
// Neither the eToro feed nor its candles carry volume; Alpha Vantage provides
// historical OHLCV for FX, stocks and commodities that we merge in for volume.
const AV_API_KEY = import.meta.env.VITE_ALPHAVANTAGE_API_KEY || "";
const AV_BASE = "https://www.alphavantage.co/query";

// Map our internal symbols → Alpha Vantage function + symbol params
function toAlphaVantageParams(symbol, interval) {
  const config = getAssetConfig(symbol);
  const cls = config.assetClass;

  // Intraday vs daily/weekly/monthly
  const isIntraday = ["1m", "5m", "15m", "1h", "4h"].includes(interval);
  const avInterval = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "60min", "4h": "60min" }[interval];

  // FX endpoints return only OHLC — no volume data available
  if (cls === "fx") return null;

  if (cls === "stocks") {
    // Intraday is premium-only on free AV tier — skip
    if (isIntraday) return null;
    if (interval === "1w") return { function: "TIME_SERIES_WEEKLY", symbol };
    if (interval === "1M") return { function: "TIME_SERIES_MONTHLY", symbol };
    return { function: "TIME_SERIES_DAILY", symbol, outputsize: "full" };
  }

  // Commodities — AV commodity endpoints return price only, no volume
  return null;
}

// Normalize a UTC timestamp to the Monday 00:00 of its week
function toWeekStart(ts) {
  const d = new Date(ts * 1000);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  return ts - diff * 86400;
}

// Fetch volume data from Alpha Vantage keyed by timestamp (seconds) → volume
async function fetchAlphaVantageVolume(symbol, interval) {
  if (!AV_API_KEY) return null;
  const params = toAlphaVantageParams(symbol, interval);
  if (!params) return null;

  const qs = new URLSearchParams({ ...params, apikey: AV_API_KEY, datatype: "json" });
  const res = await fetch(`${AV_BASE}?${qs}`);
  if (!res.ok) return null;
  const data = await res.json();

  // Alpha Vantage returns different keys depending on function
  const tsKey = Object.keys(data).find(k => k !== "Meta Data" && k.toLowerCase().includes("time series"));
  if (!tsKey) return null;
  const series = data[tsKey];

  // For commodity endpoints, data is an array [{date, value}] — no volume
  if (Array.isArray(series)) return null;

  const isWeekly = interval === "1w";

  // Build timestamp → volume map
  const volumeMap = {};
  for (const [dateStr, bar] of Object.entries(series)) {
    const vol = parseFloat(bar["5. volume"] ?? bar["6. volume"] ?? 0);
    if (!vol) continue;
    // Parse date string → unix seconds (UTC)
    const ts = Math.floor(new Date(dateStr + (dateStr.includes(" ") ? "Z" : "T00:00:00Z")).getTime() / 1000);
    // For weekly: AV keys by Friday, our candles key by Monday — normalize to week-start
    const key = isWeekly ? toWeekStart(ts) : ts;
    volumeMap[key] = vol;
  }

  return Object.keys(volumeMap).length > 0 ? volumeMap : null;
}

// Merge AV volume data into parsed volume array (matches by timestamp)
function mergeExternalVolume(volumes, volumeMap, interval) {
  if (!volumeMap) return volumes;
  const isWeekly = interval === "1w";
  return volumes.map(v => {
    const key = isWeekly ? toWeekStart(v.time) : v.time;
    const avVol = volumeMap[key];
    return avVol !== undefined ? { ...v, value: avVol } : v;
  });
}

// Check if volume data is available for a given symbol + timeframe
function hasVolumeData(symbol, interval) {
  const config = getAssetConfig(symbol);
  if (config.assetClass === ASSET_CLASS.CRYPTO) return true; // volume from exchange REST
  return toAlphaVantageParams(symbol, interval) !== null;
}

/**
 * Candles from the worker. Crypto routes to Binance klines, everything else to
 * eToro, both behind one endpoint — the browser never calls an exchange, so a
 * geo-blocked trader charts the same data as everyone else.
 *
 * Returned in the array shape parseKlines expects:
 *   [ timeMs, open, high, low, close, volume ]
 */
async function fetchWorkerCandles(symbol, interval, limit = 1000, endTime = null) {
  const rows = await fetchCandlesFromWorker(symbol, interval, limit, endTime);
  if (!rows.length) {
    // Empty is also how the worker reports "no older history" for non-crypto:
    // eToro ignores date parameters, so its 1000-bar window cannot be paged.
    if (endTime) return [];
    throw new Error(`No candle data for ${symbol}`);
  }
  return rows.map((c) => [
    c.time * 1000,
    String(c.open),
    String(c.high),
    String(c.low),
    String(c.close),
    String(c.volume ?? 0),
  ]);
}

/** Worker first for every asset class; crypto keeps the exchange REST fallback. */
function fetchCandles(symbol, interval, limit = 1000, endTime = null) {
  const config = getAssetConfig(symbol);
  if (config.assetClass === ASSET_CLASS.CRYPTO) {
    return fetchWorkerCandles(symbol, interval, limit, endTime)
      .catch(() => fetchExchangeCandles(symbol, interval, limit, endTime));
  }
  return fetchWorkerCandles(symbol, interval, limit, endTime);
}

function buildChartOptions(c) {
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: c.textColor,
      fontSize: 11,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    },
    grid: {
      vertLines: { color: c.gridColor },
      horzLines: { color: c.gridColor },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: c.crosshairColor, labelBackgroundColor: c.labelBg },
      horzLine: { color: c.crosshairColor, labelBackgroundColor: c.labelBg },
    },
    rightPriceScale: { borderColor: c.borderColor },
    timeScale: {
      borderColor: c.borderColor,
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
  };
}

function buildCandleOpts(c) {
  return {
    upColor: c.up,
    downColor: c.down,
    borderUpColor: c.up,
    borderDownColor: c.down,
    wickUpColor: c.up,
    wickDownColor: c.down,
  };
}

function fmtOHLC(v, tf) {
  if (v == null) return "—";
  if (tf === "1M" || tf === "1w" || tf === "1d")
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1000)
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(5);
}

function fmtVolume(v) {
  if (v == null || v === 0) return null;
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

function fmtCandleTime(unixSec, tf) {
  const d = new Date(unixSec * 1000);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mon = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const yr = d.getUTCFullYear();
  if (tf === "1d" || tf === "1w" || tf === "1M") return `${mon} ${day}, ${yr}`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mon} ${day}, ${hh}:${mm}`;
}

function parseKlines(data, upFaded = "rgba(34,197,94,0.35)", downFaded = "rgba(239,68,68,0.35)") {
  const candles = [];
  const volumes = [];
  for (const k of data) {
    const open  = parseFloat(k[1]);
    const close = parseFloat(k[4]);
    candles.push({ time: Math.floor(k[0] / 1000), open, high: parseFloat(k[2]), low: parseFloat(k[3]), close, volume: parseFloat(k[5]) });
    volumes.push({
      time: Math.floor(k[0] / 1000),
      value: parseFloat(k[5]),
      color: close >= open ? upFaded : downFaded,
    });
  }
  return { candles, volumes };
}

function computeHLMarkers(candles, tf, upColor = "#22c55e", downColor = "#ef4444") {
  if (!candles.length) return [];
  const highC = candles.reduce((m, c) => c.high > m.high ? c : m, candles[0]);
  const lowC  = candles.reduce((m, c) => c.low  < m.low  ? c : m, candles[0]);
  return [
    { time: highC.time, position: "aboveBar", color: upColor, shape: "arrowDown", text: `H  ${fmtOHLC(highC.high, tf)}`, size: 1 },
    { time: lowC.time,  position: "belowBar", color: downColor, shape: "arrowUp",   text: `L  ${fmtOHLC(lowC.low,  tf)}`,  size: 1 },
  ].sort((a, b) => a.time - b.time);
}

// Mobile-only "More" timeframe dropdown. Uses a Radix Popover (portals out, so
// the chart toolbar's overflow-x clipping never hides it). The trigger shows the
// active timeframe when one of the secondary frames is selected.
function MoreTimeframesMenu({ timeframe, setTimeframe, available }) {
  const [open, setOpen] = useState(false);
  const moreFrames = MORE_TIMEFRAMES.filter((tf) => available.includes(tf));
  const isMoreActive = moreFrames.includes(timeframe);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="More timeframes"
          className={`shrink-0 flex items-center gap-0.5 px-2 py-0.5 text-xs rounded font-medium transition-all ${
            isMoreActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {isMoreActive ? timeframe : "More"}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        <div className="flex items-center gap-0.5">
          {moreFrames.map((tf) => (
            <button
              key={tf}
              onClick={() => { setTimeframe(tf); setOpen(false); }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${
                timeframe === tf
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CandlestickChart({ symbol, sl, tp, position = null, livePrice = null, onApplyPosition = null }) {
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME);
  const availableTimeframes = useMemo(
    () => timeframesFor(getAssetConfig(symbol).assetClass),
    [symbol],
  );
  const [hoverInfo, setHoverInfo]  = useState(null); // { candle, volume, point, time }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const colors = useChartColors();

  const containerRef    = useRef(null);
  const chartRef        = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lineSeriesRef   = useRef(null); // close-price line (chart type: line)
  const areaSeriesRef   = useRef(null); // close-price area (chart type: area)
  const markersRef      = useRef(null); // v5 series-markers primitive
  const slLineRef       = useRef(null);
  const tpLineRef       = useRef(null);
  // Selected open-position overlay lines (entry / SL / TP / liquidation).
  const posEntryLineRef = useRef(null);
  const posSlLineRef    = useRef(null);
  const posTpLineRef    = useRef(null);
  const posLiqLineRef   = useRef(null);
  const dataReadyRef    = useRef(false); // true once initial candles are set

  // ── All-history state ──────────────────────────────────────────────
  const allCandlesRef      = useRef([]);   // full loaded candle array
  const allVolumesRef      = useRef([]);   // matching volume array
  const externalVolumeRef     = useRef(null); // cached volume map (exchange for crypto, AV for stocks)
  const oldestMsRef        = useRef(null); // open-time (ms) of oldest loaded candle
  const loadingMoreRef     = useRef(false);
  const allLoadedRef       = useRef(false);

  // Refs so handlers always see fresh symbol/timeframe/colors without dep issues
  const colorsRef    = useRef(colors);
  const symbolRef    = useRef(symbol);
  const timeframeRef = useRef(timeframe);
  useEffect(() => { colorsRef.current = colors; }, [colors]);
  useEffect(() => {
    symbolRef.current = symbol;
    // (all timeframes the worker supports: 1m through 1w)
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);

  // Switching from a crypto 1M chart to FX/commodities/stocks would leave the
  // selector on a frame with no data behind it. Fall back rather than render
  // an empty chart the user has to fix themselves.
  useEffect(() => {
    if (!availableTimeframes.includes(timeframe)) setTimeframe(FALLBACK_TIMEFRAME);
  }, [availableTimeframes, timeframe]);

  // Called from the visible-range handler whenever it needs more history
  const loadMoreFnRef = useRef(null);

  // ── Drawing tools (Phase 1) ─────────────────────────────────────────
  const { address } = useAuth();
  const [chartReady, setChartReady] = useState(false);
  const [magnet, setMagnet] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chartType, setChartType] = useState("candles"); // candles | line | area
  const [scaleMode, setScaleMode] = useState("normal");  // normal | log | pct
  const [candlesVersion, setCandlesVersion] = useState(0); // bumps when candle data changes
  const { indicators, addIndicator, removeIndicator, updateIndicator, replaceIndicators } = useChartIndicators({
    chartRef,
    candlesRef: allCandlesRef,
    chartReady,
    candlesVersion,
    symbol,
    wallet: address,
  });
  const {
    activeTool, setActiveTool, selectedId, drawings, deleteSelected, clearAll, replaceDrawings,
    undo, redo, canUndo, canRedo,
    textEditor, setTextValue, commitText, cancelText,
  } = useChartDrawings({
    chartRef,
    seriesRef: candleSeriesRef,
    containerRef,
    candlesRef: allCandlesRef,
    chartReady,
    symbol,
    wallet: address,
    accent: colors.up,
    magnet,
  });

  // Apply a saved layout: replace drawings + indicators, set chart type + scale.
  const applyLayout = useCallback((layout) => {
    replaceDrawings(layout.drawings || []);
    replaceIndicators(layout.indicators || []);
    if (layout.chartType) setChartType(layout.chartType);
    if (layout.scaleMode) setScaleMode(layout.scaleMode);
  }, [replaceDrawings, replaceIndicators]);

  // Contextual "Send to order" pill anchored to the selected position drawing.
  // Tracks the box's top-right corner each frame so it follows pan/zoom/resize.
  const drawingsLiveRef = useRef(drawings);
  drawingsLiveRef.current = drawings;
  // Read the active tool inside the (once-subscribed) crosshair handler.
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const [posPill, setPosPill] = useState(null); // { x, y } | null
  useEffect(() => {
    if (!chartReady || !selectedId || !onApplyPosition) { setPosPill(null); return undefined; }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      const cont = containerRef.current;
      const d = drawingsLiveRef.current.find((x) => x.id === selectedId && x.type === "position");
      if (!chart || !series || !cont || !d) { setPosPill((p) => (p ? null : p)); return; }
      const x0 = chart.timeScale().timeToCoordinate(d.points[0].time);
      const ys = d.points.map((p) => series.priceToCoordinate(p.price)).filter((v) => v != null);
      if (x0 == null || ys.length === 0) { setPosPill((p) => (p ? null : p)); return; }
      const x1 = Math.min(x0 + 140, cont.clientWidth);
      const topY = Math.min(...ys);
      setPosPill((prev) => (prev && Math.abs(prev.x - x1) < 0.5 && Math.abs(prev.y - topY) < 0.5 ? prev : { x: x1, y: topY }));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chartReady, selectedId, onApplyPosition]);

  // Chart type: candles keep their colours; line/area show their series with the
  // candles made transparent (so they stay the anchor for drawings/markers).
  useEffect(() => {
    const candle = candleSeriesRef.current;
    const line = lineSeriesRef.current;
    const area = areaSeriesRef.current;
    if (!candle) return;
    const transparent = {
      upColor: "rgba(0,0,0,0)", downColor: "rgba(0,0,0,0)",
      borderUpColor: "rgba(0,0,0,0)", borderDownColor: "rgba(0,0,0,0)",
      wickUpColor: "rgba(0,0,0,0)", wickDownColor: "rgba(0,0,0,0)",
    };
    if (chartType === "candles") {
      candle.applyOptions(buildCandleOpts(colors));
      line?.applyOptions({ visible: false });
      area?.applyOptions({ visible: false });
    } else if (chartType === "line") {
      candle.applyOptions(transparent);
      line?.applyOptions({ visible: true, color: colors.up });
      area?.applyOptions({ visible: false });
    } else if (chartType === "area") {
      candle.applyOptions(transparent);
      area?.applyOptions({ visible: true, lineColor: colors.up, topColor: colors.upFaded });
      line?.applyOptions({ visible: false });
    }
  }, [chartType, colors, chartReady]);

  // Price-scale mode: normal / logarithmic / percentage.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const mode = scaleMode === "log" ? PriceScaleMode.Logarithmic
      : scaleMode === "pct" ? PriceScaleMode.Percentage
      : PriceScaleMode.Normal;
    try { chart.priceScale("right").applyOptions({ mode }); } catch { /* noop */ }
  }, [scaleMode, chartReady]);

  // ── 1. Create chart once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, buildChartOptions(colors));
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, buildCandleOpts(colors));
    candleSeriesRef.current = candleSeries;
    // v5: markers are a series primitive, not series.setMarkers().
    markersRef.current = createSeriesMarkers(candleSeries, []);

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

    // Close-price line/area series for the "line"/"area" chart types. Kept in
    // sync with the candles; hidden unless their type is active. The candle
    // series stays the anchor for drawings/markers/price lines.
    const lineSeries = chart.addSeries(LineSeries, {
      color: colors.up, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false,
    });
    lineSeriesRef.current = lineSeries;
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: colors.up, topColor: colors.upFaded, bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false,
    });
    areaSeriesRef.current = areaSeries;

    // Crosshair → floating candle info popup. On desktop this tracks hover;
    // touch devices have no hover, so we skip it there and drive the popup
    // from tap (subscribeClick) instead — otherwise the card flashes and
    // vanishes as the finger lifts.
    const isCoarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;

    // True only when the cursor is vertically within the candle's high–low
    // range (+ a few px), so the card shows when hovering the candle itself,
    // not just anywhere in that bar's column.
    const overCandle = (candle, y) => {
      if (!candle || y == null) return false;
      const hY = candleSeries.priceToCoordinate(candle.high);
      const lY = candleSeries.priceToCoordinate(candle.low);
      if (hY == null || lY == null) return false;
      const tol = 6;
      return y >= hY - tol && y <= lY + tol;
    };

    chart.subscribeCrosshairMove((param) => {
      if (isCoarsePointer) return;
      if (activeToolRef.current !== "cursor") { setHoverInfo(null); return; }
      if (!param.time || !param.point) { setHoverInfo(null); return; }
      const candle = param.seriesData.get(candleSeries) ?? null;
      const vol = param.seriesData.get(volSeries) ?? null;
      if (!candle || !overCandle(candle, param.point.y)) { setHoverInfo(null); return; }
      setHoverInfo({ candle, volume: vol?.value ?? null, point: param.point, time: param.time });
    });

    // Tap a candle (mobile) to pin its info card; tap empty space to dismiss.
    chart.subscribeClick((param) => {
      if (activeToolRef.current !== "cursor") { setHoverInfo(null); return; }
      if (!param.time || !param.point) { setHoverInfo(null); return; }
      const candle = param.seriesData.get(candleSeries) ?? null;
      const vol = param.seriesData.get(volSeries) ?? null;
      if (!candle || !overCandle(candle, param.point.y)) { setHoverInfo(null); return; }
      setHoverInfo({ candle, volume: vol?.value ?? null, point: param.point, time: param.time });
    });

    // Visible range → recompute H/L markers + lazy-load older history
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;

      const candles = allCandlesRef.current;
      if (!candles.length) return;

      // ── Update H/L markers for visible candles ──
      const from = Math.max(0, Math.floor(range.from));
      const to   = Math.min(candles.length - 1, Math.ceil(range.to));
      if (from <= to) {
        const visible = candles.slice(from, to + 1);
        const c = colorsRef.current;
        const markers = computeHLMarkers(visible, timeframeRef.current, c.up, c.down);
        markersRef.current?.setMarkers(markers);
      }

      // ── Lazy-load more history when near the left edge ──
      if (range.from < 100 && !loadingMoreRef.current && !allLoadedRef.current) {
        loadMoreFnRef.current?.();
      }
    });

    setChartReady(true);

    return () => {
      setChartReady(false);
      slLineRef.current = null;
      tpLineRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lineSeriesRef.current = null;
      areaSeriesRef.current = null;
      markersRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1b. Sync theme colors when user toggles light/dark ─────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions(buildChartOptions(colors));
    candleSeriesRef.current?.applyOptions(buildCandleOpts(colors));
    // Re-color volume bars
    const vols = allVolumesRef.current;
    if (vols.length && volumeSeriesRef.current) {
      const recolored = vols.map((v, i) => {
        const c = allCandlesRef.current[i];
        return { ...v, color: c && c.close >= c.open ? colors.upFaded : colors.downFaded };
      });
      allVolumesRef.current = recolored;
      volumeSeriesRef.current.setData(recolored);
    }
    // Re-color H/L markers
    const candles = allCandlesRef.current;
    if (candles.length && candleSeriesRef.current) {
      markersRef.current?.setMarkers(computeHLMarkers(candles, timeframeRef.current, colors.up, colors.down));
    }
  }, [colors]);

  // ── 2. Initial load + set up loadMore when symbol/timeframe changes ──
  useEffect(() => {
    const candle = candleSeriesRef.current;
    const vol    = volumeSeriesRef.current;
    const chart  = chartRef.current;
    if (!candle || !vol || !chart) return;

    let cancelled = false;

    // Reset all history state
    allCandlesRef.current  = [];
    allVolumesRef.current  = [];
    externalVolumeRef.current = null;
    oldestMsRef.current    = null;
    loadingMoreRef.current = false;
    allLoadedRef.current   = false;
    loadMoreFnRef.current  = null;
    dataReadyRef.current   = false;

    setLoading(true);
    setError(false);
    candle.setData([]);
    markersRef.current?.setMarkers([]);
    vol.setData([]);

    const isCrypto = getAssetConfig(symbol).assetClass === ASSET_CLASS.CRYPTO;
    const showVolume = hasVolumeData(symbol, timeframe);

    // Show/hide volume pane — expand candles to full height when no volume
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: showVolume ? 0.82 : 1, bottom: 0 },
    });
    if (!showVolume) vol.setData([]);

    fetchCandles(symbol, timeframe, 1000)
      .then((data) => {
        if (cancelled || !Array.isArray(data) || !data.length) throw new Error();

        const { candles: newCandles, volumes: newVolumes } = parseKlines(data);

        allCandlesRef.current = newCandles;
        allVolumesRef.current = showVolume ? newVolumes : [];
        oldestMsRef.current   = data[0][0]; // open time (ms) of oldest candle
        // Crypto pages backwards via Binance endTime; fewer than 1000 bars means
        // we've reached the end. Non-crypto cannot page at all — eToro ignores
        // date parameters — so its first response is all the history there is.
        if (isCrypto ? data.length < 1000 : true) allLoadedRef.current = true;

        candle.setData(newCandles);
        const closeLine = newCandles.map((c) => ({ time: c.time, value: c.close }));
        lineSeriesRef.current?.setData(closeLine);
        areaSeriesRef.current?.setData(closeLine);
        if (showVolume) vol.setData(newVolumes);

        // Initial H/L over all loaded candles
        markersRef.current?.setMarkers(computeHLMarkers(newCandles, timeframe, colorsRef.current.up, colorsRef.current.down));

        // Show last ~80 candles by default
        chart.timeScale().setVisibleLogicalRange({
          from: newCandles.length - 80,
          to:   newCandles.length + 2,
        });

        setLoading(false);
        dataReadyRef.current = true;
        setCandlesVersion((v) => v + 1);

        // ── Overlay volume from external source (non-crypto only) ──
        // Crypto candles from exchanges already include volume.
        if (showVolume && !isCrypto) {
          fetchAlphaVantageVolume(symbol, timeframe)
            .then(volumeMap => {
              if (cancelled || !volumeMap) return;
              externalVolumeRef.current = volumeMap;
              const merged = mergeExternalVolume(allVolumesRef.current, volumeMap, timeframe);
              allVolumesRef.current = merged;
              volumeSeriesRef.current?.setData(merged);
            })
            .catch(() => {}); // volume failure is non-critical
        }

        // ── loadMore: prepend older batches on demand ──
        const doLoadMore = async () => {
          if (loadingMoreRef.current || allLoadedRef.current || cancelled) return;
          const sym = symbolRef.current;
          const tf  = timeframeRef.current;

          loadingMoreRef.current = true;
          setLoadingMore(true);

          try {
            const endTime = oldestMsRef.current - 1;
            const raw = await fetchCandles(sym, tf, 1000, endTime);
            if (cancelled || !Array.isArray(raw) || !raw.length) {
              allLoadedRef.current = true;
              return;
            }

            const isCryptoSym = getAssetConfig(sym).assetClass === ASSET_CLASS.CRYPTO;
            if (isCryptoSym ? raw.length < 1000 : raw.length < 2) allLoadedRef.current = true;
            oldestMsRef.current = raw[0][0];

            const { candles: prepCandles, volumes: prepVolumes } = parseKlines(raw);
            const merged = [...prepCandles, ...allCandlesRef.current];
            allCandlesRef.current = merged;

            if (showVolume) {
              const enrichedPrepVol = externalVolumeRef.current
                ? mergeExternalVolume(prepVolumes, externalVolumeRef.current, timeframeRef.current)
                : prepVolumes;
              const mergedVol = [...enrichedPrepVol, ...allVolumesRef.current];
              allVolumesRef.current = mergedVol;
              volumeSeriesRef.current?.setData(mergedVol);
            }

            // Preserve the current viewport — logical indices shift right by prepended count
            const currentChart = chartRef.current;
            const currentRange = currentChart?.timeScale().getVisibleLogicalRange();
            const prependCount = prepCandles.length;

            candleSeriesRef.current?.setData(merged);
            const mergedLine = merged.map((c) => ({ time: c.time, value: c.close }));
            lineSeriesRef.current?.setData(mergedLine);
            areaSeriesRef.current?.setData(mergedLine);
            setCandlesVersion((v) => v + 1);

            if (currentRange && currentChart) {
              currentChart.timeScale().setVisibleLogicalRange({
                from: currentRange.from + prependCount,
                to:   currentRange.to  + prependCount,
              });
            }
          } catch { /* ignore network errors */ } finally {
            if (!cancelled) {
              loadingMoreRef.current = false;
              setLoadingMore(false);
            }
          }
        };

        loadMoreFnRef.current = doLoadMore;
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[chart] Failed to load candles:", err.message);
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      loadMoreFnRef.current = null;
    };
  }, [symbol, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Live candle updates ─────────────────────────────────────────
  // Both classes poll the worker every 2s for the in-progress candle.
  useEffect(() => {
    let cancelled = false;
    const isCrypto = getAssetConfig(symbol).assetClass === ASSET_CLASS.CRYPTO;

    const showVol = hasVolumeData(symbol, timeframeRef.current);

    function applyKlineUpdate(t, open, high, low, close, vol) {
      const candleSeries = candleSeriesRef.current;
      const volSeries    = volumeSeriesRef.current;
      if (!candleSeries || !dataReadyRef.current) return;
      candleSeries.update({ time: t, open, high, low, close });
      lineSeriesRef.current?.update({ time: t, value: close });
      areaSeriesRef.current?.update({ time: t, value: close });
      if (showVol && volSeries) volSeries.update({
        time: t, value: vol,
        color: close >= open
          ? colorsRef.current.upFaded
          : colorsRef.current.downFaded,
      });
      const arr = allCandlesRef.current;
      if (arr.length && arr[arr.length - 1].time === t) {
        arr[arr.length - 1] = { time: t, open, high, low, close, volume: vol };
      } else if (arr.length && t > arr[arr.length - 1].time) {
        arr.push({ time: t, open, high, low, close, volume: vol });
      }
      setCandlesVersion((v) => v + 1);
    }

    // Self-scheduling poll with failure backoff: 2s on success, doubling up to
    // 30s while the source errors (429) or returns nothing (e.g. closed FX
    // market), so we don't hammer the feed when it can't serve us.
    const BASE_MS = 2000;
    const MAX_MS = 30_000;
    let delay = BASE_MS;
    let timer = null;

    const assetClass = getAssetConfig(symbol).assetClass;

    const poll = async () => {
      // Skip polling while the market is closed (e.g. FX/stocks on weekends):
      // Benchmarks has no fresh bar, so this would just spin and 429. Re-check
      // in 60s. Crypto trades 24/7 so it never pauses.
      if (!isCrypto && !getMarketStatus(assetClass)?.isOpen) {
        if (!cancelled) timer = setTimeout(poll, 60_000);
        return;
      }
      let ok = false;
      try {
        let raw;
        try {
          raw = await fetchWorkerCandles(symbol, timeframe, 2);
        } catch {
          if (isCrypto) raw = await fetchExchangeCandles(symbol, timeframe, 2);
        }
        if (!cancelled && raw?.length) {
          const last = raw[raw.length - 1];
          applyKlineUpdate(
            Math.floor(last[0] / 1000),
            parseFloat(last[1]), parseFloat(last[2]),
            parseFloat(last[3]), parseFloat(last[4]), parseFloat(last[5]),
          );
          ok = true;
        }
      } catch { /* ignore */ }
      if (cancelled) return;
      delay = ok ? BASE_MS : Math.min(delay * 2, MAX_MS);
      timer = setTimeout(poll, delay);
    };

    poll(); // immediate first update, then self-schedules

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [symbol, timeframe]);

  // ── 4. SL / TP price lines ─────────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (slLineRef.current) { series.removePriceLine(slLineRef.current); slLineRef.current = null; }
    if (sl) {
      slLineRef.current = series.createPriceLine({
        price: sl, color: colors.down, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL",
      });
    }
  }, [sl, colors]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (tpLineRef.current) { series.removePriceLine(tpLineRef.current); tpLineRef.current = null; }
    if (tp) {
      tpLineRef.current = series.createPriceLine({
        price: tp, color: colors.up, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP",
      });
    }
  }, [tp, colors]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4b. Selected open-position lines (entry / SL / TP / liq) ───────
  // Reusable across chart libraries — only the line-drawing call changes
  // when we migrate to TradingView Advanced Charts.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return undefined;

    const clear = () => {
      for (const ref of [posEntryLineRef, posSlLineRef, posTpLineRef, posLiqLineRef]) {
        if (ref.current) { try { series.removePriceLine(ref.current); } catch { /* noop */ } ref.current = null; }
      }
    };
    clear();
    if (!position?.entry_price) return clear;

    const isLong   = position.direction === "long";
    const lev      = position.leverage || 1;
    const size     = position.size || 0;
    const margin   = lev > 0 ? size / lev : size;
    const entry    = position.entry_price;

    // Liquidation price (matches ActivePositions: ~95% of margin wipes out).
    let liq = null;
    if (lev > 1) liq = isLong ? entry * (1 - 0.95 / lev) : entry * (1 + 0.95 / lev);

    // Live unrealised P&L for the entry-line label.
    let pnlText = "";
    if (livePrice && entry) {
      const pct = (livePrice - entry) / entry;
      const pnl = (isLong ? 1 : -1) * pct * size;
      const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
      pnlText = `  ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`;
    }

    const sideLabel = `${isLong ? "LONG" : "SHORT"}${lev > 1 ? ` ${lev}×` : ""}`;

    posEntryLineRef.current = series.createPriceLine({
      price: entry,
      color: colors.isDark ? "#94a3b8" : "#475569",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `${sideLabel}${pnlText}`,
    });
    if (position.sl) {
      posSlLineRef.current = series.createPriceLine({
        price: position.sl, color: colors.down, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Pos SL",
      });
    }
    if (position.tp) {
      posTpLineRef.current = series.createPriceLine({
        price: position.tp, color: colors.up, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Pos TP",
      });
    }
    if (liq) {
      posLiqLineRef.current = series.createPriceLine({
        price: liq, color: "#f59e0b", lineWidth: 1,
        lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "LIQ",
      });
    }

    return clear;
  }, [position, livePrice, colors]); // eslint-disable-line react-hooks/exhaustive-deps

  const hCandle = hoverInfo?.candle;
  const isUp = hCandle ? hCandle.close >= hCandle.open : true;
  return (
    <div className="flex flex-col h-full bg-background min-w-0">
      {/* Toolbar — single row that scrolls horizontally on narrow screens
          instead of wrapping. Children are shrink-0 so they keep their size
          and overflow into the scroll area rather than compressing. The
          Layouts/Indicators menus portal out (Radix Popover) so the row's
          overflow clipping never hides them. */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border shrink-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {availableTimeframes.map((tf) => {
          // Secondary frames collapse into the "More" dropdown on mobile only.
          const inMore = MORE_TIMEFRAMES.includes(tf);
          return (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`shrink-0 px-2.5 py-0.5 text-xs rounded font-medium transition-all ${inMore ? "hidden lg:block" : ""} ${
                timeframe === tf
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf}
            </button>
          );
        })}
        {/* Mobile-only dropdown holding the secondary timeframes */}
        <div className="lg:hidden shrink-0">
          <MoreTimeframesMenu timeframe={timeframe} setTimeframe={setTimeframe} available={availableTimeframes} />
        </div>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {loadingMore && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Loading history…</span>
          )}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {[["candles", CandleIcon, "Candles"], ["line", LineIcon, "Line"], ["area", AreaIcon, "Area"]].map(([t, Icon, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setChartType(t)}
                title={label}
                aria-label={label}
                className={`p-1 transition-colors ${chartType === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setScaleMode((m) => (m === "normal" ? "log" : m === "log" ? "pct" : "normal"))}
            title="Price scale — normal / logarithmic / percent"
            className="px-1.5 py-0.5 text-[10px] rounded font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {scaleMode === "normal" ? "Lin" : scaleMode === "log" ? "Log" : "%"}
          </button>
          <LayoutMenu
            wallet={address}
            getCurrent={() => ({
              drawings,
              indicators: indicators.map((i) => ({ type: i.type, params: i.params })),
              chartType,
              scaleMode,
            })}
            onApply={applyLayout}
          />
          <IndicatorMenu
            indicators={indicators}
            addIndicator={addIndicator}
            removeIndicator={removeIndicator}
            updateIndicator={updateIndicator}
            hasVolume={hasVolumeData(symbol, timeframe)}
          />
          <button
            type="button"
            onClick={() => setToolsOpen((o) => { const next = !o; if (!next) setActiveTool("cursor"); return next; })}
            title="Drawing tools"
            aria-label="Drawing tools"
            aria-pressed={toolsOpen}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded font-medium transition-colors ${
              toolsOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PencilRuler className="w-3.5 h-3.5" /> Tools
          </button>
        </div>
      </div>

      {/* Chart row: drawing toolbar gutter (desktop) / bottom bar (mobile) + chart */}
      <div className="flex-1 flex min-h-0 max-lg:flex-col">
      <div className="relative flex-1 min-h-0 min-w-0">
        <div ref={containerRef} className={`absolute inset-0 transition-opacity duration-150 ${loading ? "opacity-0" : "opacity-100"} ${activeTool !== "cursor" ? "cursor-crosshair" : ""}`} />

        {textEditor && (
          <input
            autoFocus
            value={textEditor.value}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitText(); }
              else if (e.key === "Escape") { e.preventDefault(); cancelText(); }
            }}
            placeholder="Text…"
            style={{ left: textEditor.x, top: textEditor.y - 8 }}
            className="absolute z-30 w-40 bg-card border border-primary rounded px-1.5 py-0.5 text-xs text-foreground outline-none shadow-lg"
          />
        )}

        <IndicatorLegend indicators={indicators} onRemove={removeIndicator} candlesRef={allCandlesRef} candlesVersion={candlesVersion} />

        {posPill && onApplyPosition && (
          <button
            type="button"
            onClick={() => {
              const d = drawingsLiveRef.current.find((x) => x.id === selectedId && x.type === "position");
              if (!d) return;
              onApplyPosition({
                side: d.dir,
                entry: d.points[0].price,
                target: d.points[1].price,
                stop: d.points[2].price,
                nonce: Date.now(),
              });
            }}
            style={{ left: posPill.x, top: posPill.y }}
            title="Load this position into the order ticket"
            className="absolute z-30 -translate-x-full -translate-y-[130%] whitespace-nowrap flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
          >
            Send to order →
          </button>
        )}

        {/* Floating candle info popup */}
        {hoverInfo && hCandle && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: Math.min(hoverInfo.point.x + 16, (containerRef.current?.clientWidth ?? 400) - 200),
              top: Math.max(8, Math.min(hoverInfo.point.y - 60, (containerRef.current?.clientHeight ?? 300) - 160)),
            }}
          >
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl px-3 py-2 min-w-[180px]">
              {/* Timestamp */}
              <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">
                {fmtCandleTime(hoverInfo.time, timeframe)}
              </div>

              {/* OHLC grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                {[["Open", hCandle.open], ["High", hCandle.high], ["Low", hCandle.low], ["Close", hCandle.close]].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono ${
                      label === "Open" || label === "Close"
                        ? isUp ? "text-green-400" : "text-red-400"
                        : "text-foreground"
                    }`}>
                      {fmtOHLC(val, timeframe)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Change + Volume */}
              <div className="border-t border-border/50 mt-1.5 pt-1.5 flex flex-col gap-0.5 text-[11px]">
                {/* Change from open */}
                {(() => {
                  const chg = hCandle.close - hCandle.open;
                  const chgPct = hCandle.open !== 0 ? (chg / hCandle.open) * 100 : 0;
                  const up = chg >= 0;
                  return (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Change</span>
                      <span className={`font-mono font-semibold ${up ? "text-green-400" : "text-red-400"}`}>
                        {up ? "+" : ""}{chgPct.toFixed(2)}%
                      </span>
                    </div>
                  );
                })()}

                {/* Range */}
                {(() => {
                  const range = hCandle.high - hCandle.low;
                  const rangePct = hCandle.low !== 0 ? (range / hCandle.low) * 100 : 0;
                  return (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Range</span>
                      <span className="font-mono text-foreground">
                        {fmtOHLC(range, timeframe)} ({rangePct.toFixed(2)}%)
                      </span>
                    </div>
                  );
                })()}

                {/* Volume */}
                {hoverInfo.volume != null && hoverInfo.volume > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="font-mono text-foreground">{fmtVolume(hoverInfo.volume)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-muted-foreground animate-pulse">Loading chart…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-red-400">Failed to load chart data</span>
          </div>
        )}
      </div>

      {toolsOpen && (
        <DrawingToolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          magnet={magnet}
          setMagnet={setMagnet}
          hasSelection={!!selectedId}
          onDelete={deleteSelected}
          onClear={clearAll}
          hasDrawings={drawings.length > 0}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}
      </div>
    </div>
  );
}
