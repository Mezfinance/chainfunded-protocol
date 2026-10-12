import { useEffect, useRef, useState } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { LogOut, TrendingUp, TrendingDown, CandlestickChart, Activity } from "lucide-react";
import { usePrices } from "@/lib/PriceContext";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import { zoneExitQuote, zoneBuyout, zoneLabel, zoneThresholdsFor } from "@/lib/zoneTrades";
import { playTick } from "@/lib/sfx";

const BUCKET_MS = 5000;   // 5-second candles
const MAX_CANDLES = 48;   // ~4 minutes on screen
const SAMPLE_MS = 120;    // price sampling cadence (candles)

const UP = "#22e07a";
const DOWN = "#ff4d6d";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * ZoneChart — hyper-stylised live 5-second candle chart with rich
 * open-position visuals: in-the-money fill between strike and price, a floating
 * bet pill, a depleting countdown ring + win/lose aura, a settlement burst
 * (particles/flash on win, shake/flash on loss), a pulsing live candle, and a
 * rolling price ticker. Candles build from the Pyth tick stream (no seeding).
 */
export default function ZoneChart({ symbol, displaySymbol, bets = [], config, onExit, showHud = false }) {
  const { getPrice } = usePrices();
  const feedSymbol = toPriceFeedSymbol(displaySymbol || symbol);

  // HUD state (separate from the canvas rAF loop, which is ref-driven).
  const [, setHudTick] = useState(0);
  const [exiting, setExiting] = useState(null);
  // Chart display style — toggleable between candles (default) and a
  // smooth, glowing line. Persisted across navigation in sessionStorage.
  const [chartType, setChartType] = useState(() => {
    if (typeof window === "undefined") return "candles";
    return sessionStorage.getItem("zoneChartType") === "line" ? "line" : "candles";
  });
  const chartTypeRef = useRef(chartType);
  chartTypeRef.current = chartType;
  useEffect(() => {
    try { sessionStorage.setItem("zoneChartType", chartType); } catch {}
  }, [chartType]);
  useEffect(() => {
    const id = setInterval(() => setHudTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const canvasRef = useRef(null);
  const candlesRef = useRef([]);
  const betsRef = useRef(bets);
  const feedRef = useRef(feedSymbol);
  const displayRef = useRef(displaySymbol || symbol);
  const getPriceRef = useRef(getPrice);
  const configRef = useRef(config);

  // Animation state
  const seenPendingRef = useRef(new Map()); // id -> bet (for settlement detection)
  const effectsRef = useRef([]);            // { type:'win'|'loss', t0, particles }
  const shakeUntilRef = useRef(0);
  const dispPriceRef = useRef(null);        // rolling displayed price
  const targetRef = useRef(null);
  const tickFlashRef = useRef({ dir: 0, t0: 0 });
  // Countdown-timer animation state (bottom-centre ring).
  const lastSecRef    = useRef(-1);    // last "secs remaining" value drawn, for tick-edge detection
  const thumpStartRef = useRef(0);     // performance.now() when the current per-second "thump" animation began

  betsRef.current = bets;
  displayRef.current = displaySymbol || symbol;
  getPriceRef.current = getPrice;
  configRef.current = config;

  // Reset everything on pair change.
  useEffect(() => {
    candlesRef.current = [];
    feedRef.current = feedSymbol;
    seenPendingRef.current = new Map();
    effectsRef.current = [];
    dispPriceRef.current = null;
    targetRef.current = null;
  }, [feedSymbol]);

  useEffect(() => {
    let raf = null;
    let lastTs = performance.now();

    // ── Candle sampling ───────────────────────────────────────────────────────
    const sampleId = setInterval(() => {
      const p = getPriceRef.current(feedRef.current);
      if (p == null) return;
      const bucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      if (!last || last.t !== bucket) {
        arr.push({ t: bucket, o: p, h: p, l: p, c: p });
        if (arr.length > MAX_CANDLES) arr.shift();
      } else {
        if (p > last.h) last.h = p;
        if (p < last.l) last.l = p;
        last.c = p;
      }
    }, SAMPLE_MS);

    // ── Settlement detection → spawn burst ─────────────────────────────────────
    const detectSettlements = () => {
      const all = betsRef.current;
      const pend = all.filter((b) => b.status === "pending" && b.symbol === displayRef.current);
      const pendIds = new Set(pend.map((b) => b.id));
      const now = performance.now();
      for (const [id] of seenPendingRef.current) {
        if (!pendIds.has(id)) {
          const settled = all.find((x) => x.id === id);
          if (settled && (settled.status === "win" || settled.status === "loss")) {
            effectsRef.current.push({
              type: settled.status,
              t0: now,
              particles: settled.status === "win" ? makeParticles() : null });
            if (settled.status === "loss") shakeUntilRef.current = now + 380;
          }
          seenPendingRef.current.delete(id);
        }
      }
      for (const b of pend) if (!seenPendingRef.current.has(b.id)) seenPendingRef.current.set(b.id, b);
    };

    function makeParticles() {
      const arr = [];
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 160;
        arr.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 1 });
      }
      return arr;
    }

    // ── Draw ───────────────────────────────────────────────────────────────────
    const draw = (ts) => {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      const now = ts;

      detectSettlements();

      const canvas = canvasRef.current;
      if (!canvas) { raf = requestAnimationFrame(draw); return; }
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 600;
      const cssH = canvas.clientHeight || 280;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();

      // Loss shake
      if (now < shakeUntilRef.current) {
        const amp = 6 * ((shakeUntilRef.current - now) / 380);
        ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
      }

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, cssH);
      bg.addColorStop(0, "#0a0f12");
      bg.addColorStop(1, "#0d1418");
      ctx.fillStyle = bg;
      ctx.fillRect(-10, -10, cssW + 20, cssH + 20);

      const candles = candlesRef.current;
      const padT = 14, padB = 16, padL = 8, padR = 108;
      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB;

      const livePrice = getPriceRef.current(feedRef.current) ?? (candles.length ? candles[candles.length - 1].c : null);
      const myBets = betsRef.current.filter((b) => b.status === "pending" && b.symbol === displayRef.current);

      if (!candles.length || livePrice == null) {
        ctx.fillStyle = "rgba(148,163,184,0.6)";
        ctx.font = "12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for live price…", cssW / 2, cssH / 2);
        ctx.restore();
        raf = requestAnimationFrame(draw);
        return;
      }

      // Rolling displayed price + tick flash
      if (targetRef.current == null) { targetRef.current = livePrice; dispPriceRef.current = livePrice; }
      if (livePrice !== targetRef.current) {
        tickFlashRef.current = { dir: livePrice > targetRef.current ? 1 : -1, t0: now };
        targetRef.current = livePrice;
      }
      dispPriceRef.current += (targetRef.current - dispPriceRef.current) * Math.min(1, dt * 12);
      const dispPrice = dispPriceRef.current;

      // Soonest bet drives ring + aura. Computed early so its barriers feed
      // the price-range calc + the prospective-band fallback below.
      const soonest = myBets.slice().sort((a, b) => new Date(a.settle_at) - new Date(b.settle_at))[0] || null;

      // Prospective bands — when there's no active bet, render the zones the
      // trader WOULD land in if they placed right now (strike = live price,
      // T1/T2 from the default-duration σ). Lower opacity makes it read as a
      // preview; the bands lock to the actual bet's strike the moment a trade
      // is placed.
      let prospective = null;
      if (!soonest && livePrice != null && configRef.current) {
        const cfg = configRef.current;
        const defDur = cfg?.defaultDurationSec
                    || (cfg?.durations && cfg.durations[0])
                    || 60;
        const { t1, t2 } = zoneThresholdsFor(displayRef.current, defDur, cfg);
        if (t1 > 0 && t2 > 0) {
          prospective = { strike: dispPrice, t1, t2, durationSec: defDur };
        }
      }

      // Price range — include candles, strikes, live price, AND the bet's
      // outer KO barriers (or the prospective barriers) so the bands fit.
      let lo = Infinity, hi = -Infinity;
      for (const c of candles) { if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; }
      for (const b of myBets) {
        const s = +b.strike_price; if (s > hi) hi = s; if (s < lo) lo = s;
        const t2 = +b.t2_pct;
        if (t2 > 0) {
          const upT2 = s * (1 + t2), dnT2 = s * (1 - t2);
          if (upT2 > hi) hi = upT2;
          if (dnT2 < lo) lo = dnT2;
        }
      }
      if (livePrice > hi) hi = livePrice;
      if (livePrice < lo) lo = livePrice;
      if (prospective) {
        const upT2 = prospective.strike * (1 + prospective.t2);
        const dnT2 = prospective.strike * (1 - prospective.t2);
        if (upT2 > hi) hi = upT2;
        if (dnT2 < lo) lo = dnT2;
      }
      const span = hi - lo || hi * 0.001 || 1;
      lo -= span * 0.12; hi += span * 0.12;
      const y = (p) => padT + ((hi - p) / (hi - lo)) * plotH;
      const fmt = (p) => p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);

      // Grid + right labels — only show generic gridlines when no bands are
      // rendered, otherwise the bands + barrier labels carry the y-axis story.
      if (!soonest && !prospective) {
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "left";
        for (let i = 0; i <= 4; i++) {
          const yy = padT + (plotH * i) / 4;
          ctx.strokeStyle = "rgba(148,163,184,0.07)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
          ctx.fillStyle = "rgba(148,163,184,0.45)";
          ctx.fillText(fmt(hi - ((hi - lo) * i) / 4), padL + plotW + 6, yy + 3);
        }
      }

      // ── Prospective bands (only when no active bet) ────────────────────────
      // Green-above / red-below default (the "UP perspective"); flips on click
      // because at that point we render the active path with the bet's chosen
      // direction. In-band labels show % since there's no stake yet.
      if (prospective) {
        const ps = prospective.strike;
        const pUpT1 = ps * (1 + prospective.t1);
        const pUpT2 = ps * (1 + prospective.t2);
        const pDnT1 = ps * (1 - prospective.t1);
        const pDnT2 = ps * (1 - prospective.t2);
        const winCol = "rgba(34,224,122,";
        const lossCol = "rgba(255,77,109,";
        const fillBand = (pTop, pBot, color, alpha) => {
          const yTop = Math.max(padT, Math.min(padT + plotH, y(pTop)));
          const yBot = Math.max(padT, Math.min(padT + plotH, y(pBot)));
          if (yBot - yTop < 0.5) return;
          ctx.fillStyle = `${color}${alpha})`;
          ctx.fillRect(padL, yTop, plotW, yBot - yTop);
        };
        // Half the active opacity so it reads as preview.
        fillBand(hi,    pUpT2, winCol,                       0.11);
        fillBand(pUpT2, pUpT1, winCol,                       0.05);
        fillBand(pUpT1, pDnT1, "rgba(148,163,184,",          0.03);
        fillBand(pDnT1, pDnT2, lossCol,                      0.05);
        fillBand(pDnT2, lo,    lossCol,                      0.11);

        const drawBarrier = (price, ko) => {
          const yy = y(price);
          if (yy < padT || yy > padT + plotH) return;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = ko ? "rgba(226,232,240,0.30)" : "rgba(148,163,184,0.20)";
          ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
          ctx.setLineDash([]);
        };
        drawBarrier(pUpT2, true);
        drawBarrier(pUpT1, false);
        drawBarrier(pDnT1, false);
        drawBarrier(pDnT2, true);

        // Strike (prospective — dashed white, lower opacity than the active
        // strike line that follows the bet)
        const ysStrike = y(ps);
        if (ysStrike >= padT && ysStrike <= padT + plotH) {
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = "rgba(226,232,240,0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(padL, ysStrike); ctx.lineTo(padL + plotW, ysStrike); ctx.stroke();
          ctx.setLineDash([]);
        }

        // In-band % labels (no stake yet → percentages, dimmer than active)
        const pay = configRef.current?.zone?.pay || {
          nearWin: 0.2125, nearLoss: 0.25, midWin: 0.425, midLoss: 0.50, koWin: 0.85, koLoss: 1.00 };
        const clampY = (yy) => Math.max(padT + 12, Math.min(padT + plotH - 12, yy));
        const drawBand = (yTop, yBot, name, frac, sign, color, isKo) => {
          const yMid = clampY((yTop + yBot) / 2);
          if (yBot - yTop < 22) return;
          ctx.textAlign = "left";
          ctx.font = `${isKo ? "bold 10px" : "10px"} ui-monospace, monospace`;
          ctx.fillStyle = color;
          ctx.fillText(name, padL + 12, yMid - 3);
          ctx.font = `bold ${isKo ? "12" : "11"}px ui-monospace, monospace`;
          ctx.fillStyle = "rgba(232,240,235,0.62)";
          const pct = (frac * 100).toFixed(frac < 0.3 ? 2 : frac < 0.5 ? 1 : 0);
          ctx.fillText(`${sign}${pct}%`, padL + 12, yMid + 11);
        };
        const winCol3 = "rgba(74,222,128,0.65)";
        const lossCol3 = "rgba(248,113,113,0.65)";
        drawBand(y(hi),    y(pUpT2), "KO WIN",    pay.koWin,    "+", winCol3, true);
        drawBand(y(pUpT2), y(pUpT1), "MID WIN",   pay.midWin,   "+", winCol3, false);
        drawBand(y(pUpT1), y(ps),    "NEAR WIN",  pay.nearWin,  "+", winCol3, false);
        drawBand(y(ps),    y(pDnT1), "NEAR LOSS", pay.nearLoss, "−", lossCol3, false);
        drawBand(y(pDnT1), y(pDnT2), "MID LOSS",  pay.midLoss,  "−", lossCol3, false);
        drawBand(y(pDnT2), y(lo),    "KO LOSS",   pay.koLoss,   "−", lossCol3, true);

        // Right-edge barrier prices (same as active path, slightly dimmer)
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillStyle = "rgba(148,163,184,0.45)";
        ctx.textAlign = "left";
        const barLabel = (price, txt) => {
          const yy = y(price);
          if (yy < padT + 6 || yy > padT + plotH - 6) return;
          ctx.fillText(txt, padL + plotW + 6, yy - 4);
        };
        barLabel(pUpT2, `KO ↑ ${fmt(pUpT2)}`);
        barLabel(pUpT1, `${fmt(pUpT1)}`);
        barLabel(pDnT1, `${fmt(pDnT1)}`);
        barLabel(pDnT2, `KO ↓ ${fmt(pDnT2)}`);
        // strike level
        ctx.fillStyle = "rgba(226,232,240,0.55)";
        ctx.fillText(`if placed: ${fmt(ps)}`, padL + plotW + 6, y(ps) - 4);
      }

      // ── Zone bands (behind candles, focused on the soonest pending bet) ───────
      // Five horizontal bands — Far / Mid / Near / Mid / Far — tinted by which
      // side wins for the trader's chosen direction. Outer Far band is brighter
      // (KO), Mid is softer, Near is near-neutral. Faint barrier lines mark T1/T2.
      if (soonest && +soonest.t1_pct > 0 && +soonest.t2_pct > 0) {
        const s = +soonest.strike_price;
        const t1 = +soonest.t1_pct;
        const t2 = +soonest.t2_pct;
        const isUp = soonest.direction === "up";
        const winCol = "rgba(34,224,122,";   // green
        const lossCol = "rgba(255,77,109,";  // red
        const above = isUp ? winCol : lossCol;
        const below = isUp ? lossCol : winCol;

        const pUpT1 = s * (1 + t1);
        const pUpT2 = s * (1 + t2);
        const pDnT1 = s * (1 - t1);
        const pDnT2 = s * (1 - t2);

        // fillBand(priceTop, priceBot) — top-of-screen = higher price.
        const fillBand = (pTop, pBot, color, alpha) => {
          const yTop = Math.max(padT, Math.min(padT + plotH, y(pTop)));
          const yBot = Math.max(padT, Math.min(padT + plotH, y(pBot)));
          if (yBot - yTop < 0.5) return;
          ctx.fillStyle = `${color}${alpha})`;
          ctx.fillRect(padL, yTop, plotW, yBot - yTop);
        };
        fillBand(hi,    pUpT2, above, 0.22); // Far above
        fillBand(pUpT2, pUpT1, above, 0.10); // Mid above
        fillBand(pUpT1, pDnT1, "rgba(148,163,184,", 0.05); // Near (straddles strike)
        fillBand(pDnT1, pDnT2, below, 0.10); // Mid below
        fillBand(pDnT2, lo,    below, 0.22); // Far below

        // Barrier lines — KO (T2) brighter dashed, T1 fainter dashed.
        const drawBarrier = (price, ko) => {
          const yy = y(price);
          if (yy < padT || yy > padT + plotH) return;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = ko ? "rgba(226,232,240,0.45)" : "rgba(148,163,184,0.30)";
          ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
          ctx.setLineDash([]);
        };
        drawBarrier(pUpT2, true);
        drawBarrier(pUpT1, false);
        drawBarrier(pDnT1, false);
        drawBarrier(pDnT2, true);

        // ── In-band labels: zone name + dollar payout, left side of plot ───────
        // Subtle so they don't fight the candles but always tell the trader
        // what each band pays. Uses the FOCUSED bet's stake.
        const pay = configRef.current?.zone?.pay;
        if (pay) {
          const sk = +soonest.stake;
          const payouts = {
            koWin:    +pay.koWin    * sk,
            midWin:   +pay.midWin   * sk,
            nearWin:  +pay.nearWin  * sk,
            nearLoss: +pay.nearLoss * sk,
            midLoss:  +pay.midLoss  * sk,
            koLoss:   +pay.koLoss   * sk };
          const winCol3 = isUp ? "rgba(74,222,128,0.85)" : "rgba(248,113,113,0.85)";
          const lossCol3 = isUp ? "rgba(248,113,113,0.85)" : "rgba(74,222,128,0.85)";
          // ymid for each band (clamped to plot)
          const clampY = (yy) => Math.max(padT + 12, Math.min(padT + plotH - 12, yy));
          const drawBand = (yTop, yBot, name, dollars, sign, color, isKo) => {
            const yMid = clampY((yTop + yBot) / 2);
            if (yBot - yTop < 22) return; // band too thin to label cleanly
            ctx.textAlign = "left";
            ctx.font = `${isKo ? "bold 10px" : "10px"} ui-monospace, monospace`;
            ctx.fillStyle = color;
            ctx.fillText(name, padL + 12, yMid - 3);
            ctx.font = `bold ${isKo ? "12" : "11"}px ui-monospace, monospace`;
            ctx.fillStyle = "rgba(232,240,235,0.92)";
            ctx.fillText(`${sign}$${dollars.toFixed(2)}`, padL + 12, yMid + 11);
          };
          drawBand(y(hi),    y(pUpT2), isUp ? "KO WIN"   : "KO LOSS",   isUp ? payouts.koWin    : payouts.koLoss,   isUp ? "+" : "−", winCol3,  true);
          drawBand(y(pUpT2), y(pUpT1), isUp ? "MID WIN"  : "MID LOSS",  isUp ? payouts.midWin   : payouts.midLoss,  isUp ? "+" : "−", winCol3,  false);
          drawBand(y(pUpT1), y(s),     isUp ? "NEAR WIN" : "NEAR LOSS", isUp ? payouts.nearWin  : payouts.nearLoss, isUp ? "+" : "−", winCol3,  false);
          drawBand(y(s),     y(pDnT1), isUp ? "NEAR LOSS": "NEAR WIN",  isUp ? payouts.nearLoss : payouts.nearWin,  isUp ? "−" : "+", lossCol3, false);
          drawBand(y(pDnT1), y(pDnT2), isUp ? "MID LOSS" : "MID WIN",   isUp ? payouts.midLoss  : payouts.midWin,   isUp ? "−" : "+", lossCol3, false);
          drawBand(y(pDnT2), y(lo),    isUp ? "KO LOSS"  : "KO WIN",    isUp ? payouts.koLoss   : payouts.koWin,    isUp ? "−" : "+", lossCol3, true);
        }

        // Right-edge price markers at each barrier (so traders can read the
        // exact level the price needs to cross, in dollars).
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillStyle = "rgba(148,163,184,0.65)";
        ctx.textAlign = "left";
        const barLabel = (price, txt) => {
          const yy = y(price);
          if (yy < padT + 6 || yy > padT + plotH - 6) return;
          ctx.fillText(txt, padL + plotW + 6, yy - 4);
        };
        barLabel(pUpT2, `KO ↑ ${fmt(pUpT2)}`);
        barLabel(pUpT1, `${fmt(pUpT1)}`);
        barLabel(pDnT1, `${fmt(pDnT1)}`);
        barLabel(pDnT2, `KO ↓ ${fmt(pDnT2)}`);
      }

      // Strike lines for every pending bet (the soonest gets its on top of the
      // zone backdrop; other bets just get the line so the chart isn't cluttered).
      for (const b of myBets) {
        const ys = y(+b.strike_price);
        if (ys < padT || ys > padT + plotH) continue;
        const isFocus = soonest && b.id === soonest.id;
        ctx.strokeStyle = "rgba(226,232,240,0.7)";
        ctx.globalAlpha = isFocus ? 0.85 : 0.35;
        ctx.lineWidth = isFocus ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(padL, ys); ctx.lineTo(padL + plotW, ys); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ── Candles or Line ───────────────────────────────────────────────────────
      const slot = plotW / MAX_CANDLES;
      const n = candles.length;
      if (chartTypeRef.current === "line" && n > 1) {
        // Sexy line: smooth quadratic-spline path, gradient ribbon below the
        // line, three-layer glow (outer haze → mid soft → inner sharp), and a
        // pulsing comet at the leading tip. Colour adapts to first-vs-last
        // close — green if up over the visible window, red if down.
        const pts = new Array(n);
        for (let i = 0; i < n; i++) {
          pts[i] = {
            x: padL + (MAX_CANDLES - n + i) * slot + slot / 2,
            y: y(candles[i].c) };
        }
        const trendUp = candles[n - 1].c >= candles[0].c;
        const lineRGB = trendUp ? "34, 224, 122" : "255, 77, 109";

        // 1. Gradient ribbon below the line (soft fade to plot bottom)
        const ribbon = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        ribbon.addColorStop(0,    `rgba(${lineRGB}, 0.32)`);
        ribbon.addColorStop(0.55, `rgba(${lineRGB}, 0.10)`);
        ribbon.addColorStop(1,    `rgba(${lineRGB}, 0)`);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, padT + plotH);
        ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
        ctx.lineTo(pts[n - 1].x, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = ribbon;
        ctx.fill();

        // 2. Three-pass stroke for layered glow
        const stroke = (width, blur, alpha) => {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.lineWidth = width;
          ctx.shadowColor = `rgba(${lineRGB}, 0.85)`;
          ctx.shadowBlur = blur;
          ctx.strokeStyle = `rgba(${lineRGB}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
          ctx.stroke();
        };
        stroke(8, 22, 0.18);   // outer haze
        stroke(4, 12, 0.55);   // mid bloom
        stroke(1.8, 0, 1);     // inner sharp
        ctx.shadowBlur = 0;

        // 3. Pulsing comet head at the latest tip
        const tip = pts[n - 1];
        const pulse = 0.5 + 0.5 * Math.sin(now / 200);
        ctx.save();
        ctx.shadowColor = `rgba(${lineRGB}, 0.9)`;
        ctx.shadowBlur = 18 + 10 * pulse;
        ctx.fillStyle = `rgba(${lineRGB}, ${0.55 + 0.35 * pulse})`;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 5 + 2 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const cw = Math.max(2, slot * 0.62);
        for (let i = 0; i < n; i++) {
          const c = candles[i];
          const x = padL + (MAX_CANDLES - n + i) * slot + slot / 2;
          const up = c.c >= c.o;
          const color = up ? UP : DOWN;
          const isLast = i === n - 1;
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = isLast ? 10 + 6 * (0.5 + 0.5 * Math.sin(now / 220)) : 9;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
          const yo = y(c.o), yc = y(c.c);
          ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(2, Math.abs(yc - yo)));
          // Live-candle comet
          if (isLast) {
            ctx.beginPath();
            ctx.arc(x, y(c.c), 3 + 1.5 * (0.5 + 0.5 * Math.sin(now / 180)), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.shadowBlur = 0;
      }

      // ── Live price line + rolling ticker ──────────────────────────────────────
      const ly = y(dispPrice);
      const flashing = now - tickFlashRef.current.t0 < 260;
      const labelCol = flashing ? (tickFlashRef.current.dir > 0 ? UP : DOWN) : "#e2e8f0";
      ctx.strokeStyle = "rgba(226,232,240,0.7)";
      ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + plotW, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = labelCol;
      roundRect(ctx, padL + plotW, ly - 9, padR - 2, 18, 3); ctx.fill();
      ctx.fillStyle = "#0a0f12";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText(fmt(dispPrice), padL + plotW + 6, ly + 3);

      // ── Floating BUYOUT pill at the live price (focused bet only) ─────────
      // Tracks the live price line so the trader sees what they get RIGHT NOW
      // if they hit EXIT, anchored to where their eye is already focused.
      if (soonest) {
        const zi = zoneBuyout(soonest, livePrice, configRef.current);
        const wn = zi.pnl > 0;
        const auraCol = wn ? UP : DOWN;
        const pillText = `BUYOUT  ${zi.pnl >= 0 ? "+" : "−"}$${Math.abs(zi.pnl).toFixed(2)}`;
        ctx.font = "bold 12px ui-monospace, monospace";
        const wpill = ctx.measureText(pillText).width + 22;
        // Anchor just LEFT of the right-edge price tag so it never collides.
        const px = padL + plotW - wpill - 14;
        let py = ly - 12;
        py = Math.max(padT + 2, Math.min(py, padT + plotH - 22));
        // Glowing pill
        ctx.save();
        ctx.shadowColor = auraCol;
        ctx.shadowBlur = 16;
        ctx.fillStyle = wn ? "rgba(34,224,122,0.28)" : "rgba(255,77,109,0.28)";
        ctx.strokeStyle = auraCol;
        ctx.lineWidth = 1.5;
        roundRect(ctx, px, py, wpill, 22, 11); ctx.fill(); ctx.stroke();
        ctx.restore();
        // Text
        ctx.fillStyle = wn ? UP : DOWN;
        ctx.fillText(pillText, px + 11, py + 15);
        // Thin connector line from pill to live-price line so the eye links them
        ctx.strokeStyle = `${wn ? "rgba(34,224,122," : "rgba(255,77,109,"}0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + wpill, py + 11); ctx.lineTo(padL + plotW, ly); ctx.stroke();
      }

      // ── Bet pills (right side, never clipped) ─────────────────────────────────
      let pillRow = 0;
      for (const b of myBets) {
        const s = +b.strike_price;
        const isUp = b.direction === "up";
        const col = isUp ? UP : DOWN;
        const secs = Math.max(0, Math.ceil((new Date(b.settle_at).getTime() - Date.now()) / 1000));
        const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, "0");
        // Pill shows the live BUYOUT value so it agrees with the exit button
        // (not the literal zone payoff, which over-promises with time remaining).
        const zoneInfo = zoneBuyout(b, livePrice, configRef.current);
        const pnlNow = zoneInfo.pnl;
        const winning = pnlNow > 0;
        const text = `${isUp ? "▲ UP" : "▼ DOWN"} · ${zoneLabel(zoneInfo.zone)} · ${mm}:${ss} · ${pnlNow >= 0 ? "+" : "−"}$${Math.abs(pnlNow).toFixed(2)}`;
        ctx.font = "bold 11px ui-monospace, monospace";
        const w = ctx.measureText(text).width + 16;
        const px = padL + plotW - w - 6;
        let py = y(s) - 24 - pillRow * 26;
        py = Math.max(padT + 2, Math.min(py, padT + plotH - 22));
        ctx.fillStyle = winning ? "rgba(34,224,122,0.18)" : "rgba(255,77,109,0.18)";
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.shadowColor = col; ctx.shadowBlur = secs <= 10 ? 14 : 6;
        roundRect(ctx, px, py, w, 20, 6); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = winning ? UP : DOWN;
        ctx.fillText(text, px + 8, py + 14);
        pillRow++;
      }

      // ── Countdown ring + aura (soonest bet) ───────────────────────────────────
      if (soonest) {
        const s = +soonest.strike_price;
        // Border colour follows which side of the strike the LIVE TICKER is on
        // (i.e. which zone band it sits in), not the buyout sign — so the
        // border stays green while the price is in any win zone even when the
        // buyout is dragged slightly negative by margin/τ-decay near the strike.
        // Matches the "Current Zone" badge logic in ZoneActiveCard.
        const zi = zoneBuyout(soonest, livePrice, configRef.current);
        const winning = zi.fav > 0;
        const total = Math.max(1000, new Date(soonest.settle_at).getTime() - new Date(soonest.lock_at || Date.now() - 60000).getTime());
        const remain = Math.max(0, new Date(soonest.settle_at).getTime() - Date.now());
        const frac = Math.max(0, Math.min(1, remain / total));
        const secs = Math.ceil(remain / 1000);
        const urgent = secs <= 10;
        const auraCol = winning ? UP : DOWN;

        // Aura border — chill outside the final 10s, dramatic inside it: faster
        // pulse, brighter glow, thicker stroke, plus a second wider halo ring.
        const calmPulse = 0.5 + 0.5 * Math.sin(now / 220);
        const urgPulse  = 0.5 + 0.5 * Math.sin(now / 110);
        ctx.save();
        ctx.strokeStyle = auraCol; ctx.shadowColor = auraCol;
        if (urgent) {
          // Outer halo (extra wide blur, thin stroke) for the "energy field" feel
          ctx.shadowBlur  = 28 + 30 * urgPulse;
          ctx.globalAlpha = 0.42 + 0.32 * urgPulse;
          ctx.lineWidth   = 1;
          roundRect(ctx, 1.5, 1.5, cssW - 3, cssH - 3, 8); ctx.stroke();
          // Inner bright border
          ctx.shadowBlur  = 18 + 14 * urgPulse;
          ctx.globalAlpha = 0.78 + 0.22 * urgPulse;
          ctx.lineWidth   = 3 + 1.5 * urgPulse;
          roundRect(ctx, 1.5, 1.5, cssW - 3, cssH - 3, 8); ctx.stroke();
        } else {
          ctx.shadowBlur  = 10 + 10 * calmPulse * 0.45;
          ctx.globalAlpha = 0.45 + 0.25 * 0.45;
          ctx.lineWidth   = 2;
          roundRect(ctx, 1.5, 1.5, cssW - 3, cssH - 3, 8); ctx.stroke();
        }
        ctx.restore();

        // ── Big countdown ring (bottom-CENTRE of chart) ───────────────────────
        // Animation curve as time runs down: calm green > 20s → amber 11–20s →
        // red 6–10s → bright red final 5s. Stroke widens, glow grows, number
        // "thumps" each second in the urgent band, and a high-pitched tick +
        // mobile vibrate fire on each second in the last 5s.
        const COL_CALM   = [34, 224, 122];        // green
        const COL_WARN   = [251, 191, 36];        // amber
        const COL_URGENT = [255, 77,  109];       // red
        const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
        const lerpRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
        // Smooth colour easing across two thresholds so the temperature shifts
        // continuously instead of snapping.
        let baseRGB;
        if (secs > 20)      baseRGB = COL_CALM;
        else if (secs > 10) baseRGB = lerpRGB(COL_WARN,   COL_CALM,   (secs - 10) / 10);
        else if (secs > 5)  baseRGB = lerpRGB(COL_URGENT, COL_WARN,   (secs - 5)  / 5);
        else                baseRGB = COL_URGENT;
        const baseCss = `rgb(${baseRGB.map(Math.round).join(",")})`;

        // Per-second tick: scale-thump + sound + vibrate when crossing into
        // a lower second within the urgent band.
        const prevSec = lastSecRef.current;
        if (secs !== prevSec) {
          lastSecRef.current = secs;
          if (secs > 0 && secs <= 15) {
            thumpStartRef.current = now;
            // Pitch + gain ramp as we approach zero.
            const pitch = 700 + (15 - secs) * 60;
            const gain  = 0.03 + (15 - secs) * 0.006;
            try { playTick({ pitch, gain }); } catch {}
            if (secs <= 3 && typeof navigator !== "undefined" && navigator.vibrate) {
              try { navigator.vibrate(secs === 1 ? [120] : [60]); } catch {}
            }
          }
        }
        // Thump = brief scale pulse (~220ms) right after a tick.
        const thumpDt = now - thumpStartRef.current;
        const THUMP_MS = 220;
        const thumpAmt = secs <= 5 ? 0.18 : secs <= 10 ? 0.12 : secs <= 15 ? 0.06 : 0;
        const thump = thumpDt < THUMP_MS
          ? thumpAmt * Math.sin(Math.PI * (thumpDt / THUMP_MS))
          : 0;

        // Size + position: middle of the bottom section of the chart.
        const baseR = Math.max(34, Math.min(58, plotH * 0.12));
        const rr = baseR * (1 + thump);
        const rx = padL + plotW / 2;
        const ry = padT + plotH - baseR - 10;

        // Stroke width grows with urgency.
        const stroke = secs > 20 ? 4 : secs > 10 ? 5 : secs > 5 ? 7 : 9;
        // Pulsing glow — faster in the urgent band.
        const pulseHz = secs > 20 ? 220 : secs > 10 ? 160 : secs > 5 ? 110 : 70;
        const pulse = 0.5 + 0.5 * Math.sin(now / pulseHz);
        const glow = secs > 20 ? 8 + 6 * pulse : secs > 10 ? 14 + 10 * pulse : secs > 5 ? 22 + 14 * pulse : 32 + 20 * pulse;

        // Backdrop disc so candles behind don't bleed through the digit.
        ctx.save();
        ctx.fillStyle = "rgba(8,14,18,0.82)";
        ctx.beginPath(); ctx.arc(rx, ry, rr + 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Track ring (background of the depleting arc).
        ctx.lineWidth = stroke;
        ctx.strokeStyle = "rgba(148,163,184,0.18)";
        ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();

        // Depleting arc.
        ctx.save();
        ctx.strokeStyle = baseCss;
        ctx.shadowColor = baseCss;
        ctx.shadowBlur = glow;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
        ctx.restore();

        // Number — large, monospace, thumps with the ring.
        const numSize = Math.round(rr * 0.92);
        ctx.fillStyle = baseCss;
        ctx.shadowColor = baseCss;
        ctx.shadowBlur = secs <= 10 ? 10 : 0;
        ctx.font = `900 ${numSize}px ui-monospace, "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(secs), rx, ry - 2);
        ctx.shadowBlur = 0;

        // "SEC" label below the number.
        ctx.font = `600 ${Math.round(rr * 0.22)}px ui-sans-serif, sans-serif`;
        ctx.fillStyle = "rgba(232,240,235,0.55)";
        ctx.fillText("SEC", rx, ry + rr * 0.62);

        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      // ── Settlement effects (particles / flash) ────────────────────────────────
      const cx = padL + plotW * 0.66;
      const cy = y(livePrice);
      effectsRef.current = effectsRef.current.filter((fx) => {
        const dur = fx.type === "win" ? 1000 : 520;
        const age = now - fx.t0;
        if (age > dur) return false;
        const k = age / dur;
        const col = fx.type === "win" ? UP : DOWN;
        // Flash overlay
        ctx.fillStyle = fx.type === "win" ? "rgba(34,224,122," : "rgba(255,77,109,";
        ctx.fillStyle += `${(1 - k) * 0.35})`;
        ctx.fillRect(0, 0, cssW, cssH);
        // Particles (win)
        if (fx.particles) {
          ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
          for (const p of fx.particles) {
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt * 1.1;
            if (p.life <= 0) continue;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.beginPath(); ctx.arc(cx + p.x, cy + p.y, 2.5, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
        return true;
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { clearInterval(sampleId); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active bets on the displayed pair → HUD rows with live early-exit.
  const hudBets = bets.filter((b) => b.status === "pending" && b.symbol === (displaySymbol || symbol));
  const doExit = async (betId) => {
    if (exiting || !onExit) return;
    setExiting(betId);
    try { await onExit(betId); } finally { setExiting(null); }
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-[#0a0f12]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <span className="font-grotesk text-sm font-semibold text-foreground">{displaySymbol || symbol}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border bg-secondary/40 p-0.5">
            <button
              type="button"
              onClick={() => setChartType("line")}
              aria-pressed={chartType === "line"}
              title="Line"
              className={`flex items-center justify-center w-7 h-6 rounded-[3px] transition-colors ${
                chartType === "line"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType("candles")}
              aria-pressed={chartType === "candles"}
              title="Candles"
              className={`flex items-center justify-center w-7 h-6 rounded-[3px] transition-colors ${
                chartType === "candles"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            {chartType === "line" ? "tick · live" : "5s · live"}
          </span>
        </div>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} className="block w-full h-[320px] sm:h-[400px] lg:h-[480px]" />

        {/* Bottom HUD — opt-in legacy strip. The sidebar ZoneActiveCard is the
            canonical exit surface in the new layout; this is kept behind a
            prop so a mobile / no-sidebar context can re-enable it. */}
        {showHud && hudBets.length > 0 && onExit && (
          <div className="absolute inset-x-0 bottom-0 bg-black/55 backdrop-blur-sm border-t border-border/60 divide-y divide-white/5">
            {hudBets.map((b) => {
              const live = getPrice(toPriceFeedSymbol(b.symbol));
              const isUp = b.direction === "up";
              const secs = Math.max(0, Math.ceil((new Date(b.settle_at).getTime() - Date.now()) / 1000));
              const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, "0");
              const quote = live != null ? zoneExitQuote(b, live, config) : null;
              const pnl = quote?.pnl ?? 0;
              const winning = quote != null ? pnl > 0 : null; // net of fee
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    {isUp ? <TrendingUp className="w-4 h-4 text-green-400 shrink-0" /> : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
                    <span className="font-semibold text-foreground">{isUp ? "UP" : "DOWN"}</span>
                    <span className="text-muted-foreground">${Number(b.stake).toFixed(2)}</span>
                    <span className="font-mono text-foreground tabular-nums">{mm}:{ss}</span>
                    {winning != null && (
                      <span className={winning ? "text-green-400" : "text-red-400"}>· {winning ? "winning" : "losing"}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => doExit(b.id)}
                    disabled={exiting != null || quote == null}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      pnl >= 0
                        ? "border-green-500/40 text-green-400 hover:bg-green-500/15"
                        : "border-red-500/40 text-red-400 hover:bg-red-500/15"
                    }`}
                    title="Close this position now at its current value"
                  >
                    {exiting === b.id ? <BoltLoader className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                    Exit {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
