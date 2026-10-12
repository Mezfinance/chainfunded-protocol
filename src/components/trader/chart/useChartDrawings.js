/**
 * useChartDrawings — wires the DrawingsPrimitive to the chart and drives
 * drawing placement, selection, deletion, undo/redo and persistence.
 *
 * Placement uses the chart's own click/crosshair events (no raw DOM pointer
 * math, no fight with pan/zoom): a drawing tool consumes clicks to set anchor
 * points; the cursor tool selects via the primitive's hit-test
 * (`param.hoveredObjectId`). Drawings persist per wallet+symbol in data coords.
 *
 * Tools: trendline/ray/rectangle/fib/arrow (2 clicks), channel/pitchfork
 * (3 clicks), horizontal/vertical/flag (1 click).
 * Magnet snaps price to the nearest OHLC of the bar under the cursor.
 * Keyboard: Del removes selection, Esc cancels, Ctrl/Cmd+Z / Shift+Z undo/redo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingsPrimitive } from "./DrawingsPrimitive";
import { loadDrawings, saveDrawings, newDrawingId } from "./drawingStore";

// Anchor points each tool needs before it commits.
const TOOL_POINTS = {
  trendline: 2, ray: 2, rectangle: 2, fib: 2, arrow: 2,
  channel: 3, pitchfork: 3,
  horizontal: 1, vertical: 1, flag: 1,
};

export function useChartDrawings({ chartRef, seriesRef, containerRef, candlesRef, chartReady, symbol, wallet, accent, magnet }) {
  const [activeTool, setActiveToolState] = useState("cursor");
  const [selectedId, setSelectedIdState] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const primitiveRef = useRef(null);
  const draftRef = useRef(null);
  const dragRef = useRef(null);
  const [textEditor, setTextEditor] = useState(null); // { x, y, time, price, value } | null
  const textEditorRef = useRef(null);
  const toolRef = useRef("cursor");
  const selRef = useRef(null);
  const drawingsRef = useRef([]);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const magnetRef = useRef(magnet);
  const symbolRef = useRef(symbol);
  const walletRef = useRef(wallet);
  const accentRef = useRef(accent);

  useEffect(() => { magnetRef.current = magnet; }, [magnet]);
  useEffect(() => { accentRef.current = accent; }, [accent]);
  useEffect(() => { symbolRef.current = symbol; walletRef.current = wallet; }, [symbol, wallet]);

  const pushPrimitive = useCallback(() => {
    primitiveRef.current?.setState({
      drawings: drawingsRef.current,
      draft: draftRef.current,
      selectedId: selRef.current,
      accent: accentRef.current,
    });
  }, []);

  const syncHistFlags = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const select = useCallback((id) => {
    selRef.current = id;
    setSelectedIdState(id);
    pushPrimitive();
  }, [pushPrimitive]);

  // Apply a new drawings array. `history` pushes the previous state onto the
  // undo stack (and clears redo); set false for undo/redo/reload themselves.
  const apply = useCallback((next, { history = true } = {}) => {
    if (history) {
      undoRef.current.push(drawingsRef.current);
      redoRef.current = [];
    }
    drawingsRef.current = next;
    setDrawings(next);
    saveDrawings(walletRef.current, symbolRef.current, next);
    pushPrimitive();
    syncHistFlags();
  }, [pushPrimitive, syncHistFlags]);

  const setActiveTool = useCallback((t) => {
    toolRef.current = t;
    setActiveToolState(t);
    draftRef.current = null;
    pushPrimitive();
  }, [pushPrimitive]);

  const deleteSelected = useCallback(() => {
    if (!selRef.current) return;
    apply(drawingsRef.current.filter((d) => d.id !== selRef.current));
    select(null);
  }, [apply, select]);

  const clearAll = useCallback(() => {
    if (drawingsRef.current.length === 0) return;
    apply([]);
    select(null);
  }, [apply, select]);

  // Replace all drawings (used when applying a saved layout). Fresh ids so the
  // layout's drawings don't collide with anything.
  const replaceDrawings = useCallback((list) => {
    const next = (list || []).map((d) => ({ ...d, id: newDrawingId() }));
    apply(next);
    select(null);
  }, [apply, select]);

  const setTextValue = useCallback((value) => {
    if (!textEditorRef.current) return;
    textEditorRef.current = { ...textEditorRef.current, value };
    setTextEditor(textEditorRef.current);
  }, []);

  const commitText = useCallback(() => {
    const ed = textEditorRef.current;
    textEditorRef.current = null;
    setTextEditor(null);
    setActiveTool("cursor");
    if (ed && ed.value.trim()) {
      const drawing = {
        id: newDrawingId(), type: "text",
        points: [{ time: ed.time, price: ed.price }],
        text: ed.value.trim(), style: {}, createdAt: Date.now(),
      };
      apply([...drawingsRef.current, drawing]);
      select(drawing.id);
    }
  }, [apply, select, setActiveTool]);

  const cancelText = useCallback(() => {
    textEditorRef.current = null;
    setTextEditor(null);
    setActiveTool("cursor");
  }, [setActiveTool]);

  const undo = useCallback(() => {
    if (!undoRef.current.length) return;
    redoRef.current.push(drawingsRef.current);
    apply(undoRef.current.pop(), { history: false });
    select(null);
  }, [apply, select]);

  const redo = useCallback(() => {
    if (!redoRef.current.length) return;
    undoRef.current.push(drawingsRef.current);
    apply(redoRef.current.pop(), { history: false });
    select(null);
  }, [apply, select]);

  // Reload drawings when the symbol (or wallet) changes; reset history.
  useEffect(() => {
    const loaded = loadDrawings(wallet, symbol);
    drawingsRef.current = loaded;
    setDrawings(loaded);
    draftRef.current = null;
    selRef.current = null;
    setSelectedIdState(null);
    undoRef.current = [];
    redoRef.current = [];
    syncHistFlags();
    pushPrimitive();
  }, [symbol, wallet, pushPrimitive, syncHistFlags]);

  // Attach the primitive + subscribe to chart events once the chart is ready.
  useEffect(() => {
    if (!chartReady) return undefined;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return undefined;

    const prim = new DrawingsPrimitive();
    series.attachPrimitive(prim);
    primitiveRef.current = prim;
    pushPrimitive();

    const snapPrice = (time, priceRaw) => {
      if (!magnetRef.current) return priceRaw;
      const c = (candlesRef.current || []).find((k) => k.time === time);
      if (!c) return priceRaw;
      let best = priceRaw;
      let bestD = Infinity;
      for (const v of [c.open, c.high, c.low, c.close]) {
        const dd = Math.abs(v - priceRaw);
        if (dd < bestD) { bestD = dd; best = v; }
      }
      return best;
    };

    const onClick = (param) => {
      if (!param.point || param.time == null) return;
      const priceRaw = seriesRef.current?.coordinateToPrice(param.point.y);
      if (priceRaw == null) return;
      const time = param.time;
      const price = snapPrice(time, priceRaw);
      const tool = toolRef.current;

      if (tool === "cursor") {
        select(param.hoveredObjectId ?? null);
        return;
      }
      if (tool === "text") {
        const ed = { x: param.point.x, y: param.point.y, time, price, value: "" };
        textEditorRef.current = ed;
        setTextEditor(ed);
        return;
      }
      if (tool === "position-long" || tool === "position-short") {
        const dir = tool === "position-long" ? "long" : "short";
        const target = dir === "long" ? price * 1.02 : price * 0.98;
        const stop = dir === "long" ? price * 0.99 : price * 1.01;
        const drawing = {
          id: newDrawingId(), type: "position", dir,
          points: [{ time, price }, { time, price: target }, { time, price: stop }],
          style: {}, createdAt: Date.now(),
        };
        apply([...drawingsRef.current, drawing]);
        setActiveTool("cursor");
        select(drawing.id);
        return;
      }
      const need = TOOL_POINTS[tool];
      if (!need) return;

      const point = { time, price };
      if (need === 1) {
        const drawing = { id: newDrawingId(), type: tool, points: [point], style: {}, createdAt: Date.now() };
        apply([...drawingsRef.current, drawing]);
        setActiveTool("cursor");
        select(drawing.id);
        return;
      }
      // Multi-point tools: accumulate clicks until `need` points are placed.
      if (!draftRef.current) {
        draftRef.current = { type: tool, points: [point], preview: point };
        pushPrimitive();
        return;
      }
      const pts = [...draftRef.current.points, point];
      if (pts.length >= need) {
        const drawing = { id: newDrawingId(), type: tool, points: pts.slice(0, need), style: {}, createdAt: Date.now() };
        draftRef.current = null;
        apply([...drawingsRef.current, drawing]);
        setActiveTool("cursor");
        select(drawing.id);
      } else {
        draftRef.current = { type: tool, points: pts, preview: point };
        pushPrimitive();
      }
    };

    const onMove = (param) => {
      if (!draftRef.current || !param.point || param.time == null) return;
      const priceRaw = seriesRef.current?.coordinateToPrice(param.point.y);
      if (priceRaw == null) return;
      draftRef.current.preview = { time: param.time, price: snapPrice(param.time, priceRaw) };
      pushPrimitive();
    };

    chart.subscribeClick(onClick);
    chart.subscribeCrosshairMove(onMove);

    // ── Drag-to-move (cursor tool) ──────────────────────────────────────────
    // DOM pointer drag: grab an endpoint handle to reshape, or the body to move
    // the whole drawing. Chart pan/zoom is suppressed only while dragging.
    const container = containerRef.current;

    const localXY = (e) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const hitDetail = (x, y) => {
      const ts = chart.timeScale();
      const s = seriesRef.current;
      for (const d of drawingsRef.current) {
        for (let i = 0; i < d.points.length; i++) {
          const px = ts.timeToCoordinate(d.points[i].time);
          const py = s.priceToCoordinate(d.points[i].price);
          if (px != null && py != null && Math.hypot(x - px, y - py) <= 8) {
            return { id: d.id, handleIndex: i };
          }
        }
      }
      const h = primitiveRef.current?.hitTest(x, y);
      return h ? { id: h.externalId, handleIndex: null } : null;
    };

    const onPointerDown = (e) => {
      if (toolRef.current !== "cursor") return;
      const { x, y } = localXY(e);
      const hit = hitDetail(x, y);
      if (!hit) return;
      select(hit.id);
      dragRef.current = { id: hit.id, handleIndex: hit.handleIndex, moved: false, before: drawingsRef.current, last: null };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      try { container.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const onPointerMove = (e) => {
      if (!dragRef.current) return;
      const { x, y } = localXY(e);
      const time = chart.timeScale().coordinateToTime(x);
      const priceRaw = seriesRef.current?.coordinateToPrice(y);
      if (time == null || priceRaw == null) return;
      const price = snapPrice(time, priceRaw);
      const drag = dragRef.current;
      const d = drawingsRef.current.find((dd) => dd.id === drag.id);
      if (!d) return;
      let nextPoints;
      if (drag.handleIndex != null) {
        // Position levels keep their (shared) entry time — only the price moves.
        nextPoints = d.type === "position"
          ? d.points.map((p, i) => (i === drag.handleIndex ? { time: p.time, price } : p))
          : d.points.map((p, i) => (i === drag.handleIndex ? { time, price } : p));
      } else {
        const last = drag.last || { time, price };
        const dt = time - last.time;
        const dp = price - last.price;
        nextPoints = d.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
      }
      drag.last = { time, price };
      drag.moved = true;
      drawingsRef.current = drawingsRef.current.map((dd) => (dd.id === d.id ? { ...dd, points: nextPoints } : dd));
      pushPrimitive();
    };

    const endDrag = (e) => {
      if (!dragRef.current) return;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      try { container.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (dragRef.current.moved) {
        undoRef.current.push(dragRef.current.before);
        redoRef.current = [];
        saveDrawings(walletRef.current, symbolRef.current, drawingsRef.current);
        setDrawings([...drawingsRef.current]);
        syncHistFlags();
      }
      dragRef.current = null;
    };

    container?.addEventListener("pointerdown", onPointerDown);
    container?.addEventListener("pointermove", onPointerMove);
    container?.addEventListener("pointerup", endDrag);
    container?.addEventListener("pointercancel", endDrag);

    return () => {
      try { chart.unsubscribeClick(onClick); } catch { /* noop */ }
      try { chart.unsubscribeCrosshairMove(onMove); } catch { /* noop */ }
      container?.removeEventListener("pointerdown", onPointerDown);
      container?.removeEventListener("pointermove", onPointerMove);
      container?.removeEventListener("pointerup", endDrag);
      container?.removeEventListener("pointercancel", endDrag);
      try { series.detachPrimitive(prim); } catch { /* noop */ }
      primitiveRef.current = null;
    };
  }, [chartReady, chartRef, seriesRef, containerRef, candlesRef, pushPrimitive, select, apply, setActiveTool, syncHistFlags]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key === "Escape") {
        draftRef.current = null;
        if (toolRef.current !== "cursor") setActiveTool("cursor");
        select(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, select, setActiveTool, undo, redo]);

  return {
    activeTool, setActiveTool, selectedId, drawings,
    deleteSelected, clearAll, replaceDrawings, undo, redo, canUndo, canRedo,
    textEditor, setTextValue, commitText, cancelText,
  };
}
