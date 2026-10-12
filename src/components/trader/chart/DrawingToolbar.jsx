/**
 * DrawingToolbar — desktop left rail / mobile bottom bar for chart drawing
 * tools. Related tools collapse into flyout groups (Lines, Position) so the
 * rail stays short and scales as more tools are added.
 * See docs/charting-scope.md §8b for the mobile pattern.
 */
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2, Spline, MoveUpRight, Minus, Square, AlignJustify, Type,
  TrendingUp, TrendingDown, ChevronRight, Equal, GitFork, ArrowUpRight, Flag,
  Magnet, Undo2, Redo2, Trash2, Eraser,
} from "lucide-react";

function ToolButton({ active, onClick, title, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      className={`relative w-8 h-8 flex items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <div className="bg-border my-0.5 h-px hidden lg:block" />;

// A button that opens a small flyout of related tools. Shows the active
// sub-tool's icon when one is selected, with a corner marker to signal a group.
//
// The flyout is rendered in a portal with fixed positioning rather than as an
// absolutely-positioned child. The toolbar is `overflow-x-auto` (so the rail
// scrolls on mobile), and a non-visible overflow on one axis makes the browser
// clip the other axis too — which previously cut off the flyout when it popped
// above the mobile bottom bar. Portaling to <body> sidesteps the clip entirely.
function ToolGroup({ defaultIcon: DefaultIcon, title, options, activeTool, setActiveTool }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const active = options.find((o) => o.id === activeTool);
  const Icon = active ? active.icon : DefaultIcon;

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    // Mobile (bottom bar, < lg): open upward, anchored to the button's top.
    // Desktop (left rail): open to the right, anchored to the button's top.
    const isMobile = window.innerWidth < 1024;
    setPos(isMobile
      ? { isMobile, left: r.left, bottom: window.innerHeight - r.top + 6 }
      : { isMobile, left: r.right + 6, top: r.top });
    setOpen(true);
  };

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <ToolButton active={!!active} onClick={toggle} title={title}>
        <Icon className={`w-4 h-4 ${active?.iconClass || ""}`} />
        <ChevronRight className="absolute right-0 bottom-0 w-2.5 h-2.5 opacity-50" />
      </ToolButton>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            style={pos.isMobile
              ? { left: pos.left, bottom: pos.bottom }
              : { left: pos.left, top: pos.top }}
            className={`fixed z-[61] flex gap-1 rounded-lg border border-border bg-card p-1 shadow-xl ${
              pos.isMobile ? "flex-row" : "flex-col"
            }`}
          >
            {options.map((o) => (
              <ToolButton
                key={o.id}
                active={activeTool === o.id}
                onClick={() => { setActiveTool(o.id); setOpen(false); }}
                title={o.label}
              >
                <o.icon className={`w-4 h-4 ${o.iconClass || ""}`} />
              </ToolButton>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

const LINE_TOOLS = [
  { id: "trendline", icon: Spline, label: "Trend line" },
  { id: "ray", icon: MoveUpRight, label: "Ray" },
  { id: "horizontal", icon: Minus, label: "Horizontal line" },
  { id: "vertical", icon: Minus, iconClass: "rotate-90", label: "Vertical line" },
  { id: "channel", icon: Equal, label: "Parallel channel" },
  { id: "pitchfork", icon: GitFork, label: "Pitchfork" },
  { id: "fib", icon: AlignJustify, label: "Fibonacci retracement" },
];
const POSITION_TOOLS = [
  { id: "position-long", icon: TrendingUp, label: "Long position" },
  { id: "position-short", icon: TrendingDown, label: "Short position" },
];
const MARK_TOOLS = [
  { id: "arrow", icon: ArrowUpRight, label: "Arrow" },
  { id: "flag", icon: Flag, label: "Flag" },
];

export default function DrawingToolbar({
  activeTool, setActiveTool, magnet, setMagnet,
  hasSelection, onDelete, onClear, hasDrawings,
  onUndo, onRedo, canUndo, canRedo,
}) {
  return (
    <div className="z-20 flex gap-1 bg-card shrink-0
                    w-full flex-row overflow-x-auto border-t border-border p-1
                    lg:order-first lg:w-auto lg:h-full lg:flex-col lg:overflow-visible lg:border-t-0 lg:border-r lg:p-1.5">
      <ToolButton active={activeTool === "cursor"} onClick={() => setActiveTool("cursor")} title="Cursor / select (Esc)">
        <MousePointer2 className="w-4 h-4" />
      </ToolButton>
      <ToolGroup defaultIcon={Spline} title="Lines" options={LINE_TOOLS} activeTool={activeTool} setActiveTool={setActiveTool} />
      <ToolButton active={activeTool === "rectangle"} onClick={() => setActiveTool("rectangle")} title="Rectangle">
        <Square className="w-4 h-4" />
      </ToolButton>
      <ToolButton active={activeTool === "text"} onClick={() => setActiveTool("text")} title="Text">
        <Type className="w-4 h-4" />
      </ToolButton>
      <ToolGroup defaultIcon={TrendingUp} title="Position" options={POSITION_TOOLS} activeTool={activeTool} setActiveTool={setActiveTool} />
      <ToolGroup defaultIcon={Flag} title="Marks" options={MARK_TOOLS} activeTool={activeTool} setActiveTool={setActiveTool} />

      <Divider />

      <ToolButton active={magnet} onClick={() => setMagnet((m) => !m)} title="Magnet — snap to OHLC">
        <Magnet className="w-4 h-4" />
      </ToolButton>
      <ToolButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
        <Undo2 className="w-4 h-4" />
      </ToolButton>
      <ToolButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
        <Redo2 className="w-4 h-4" />
      </ToolButton>

      <Divider />

      <ToolButton onClick={onDelete} disabled={!hasSelection} title="Delete selected (Del)">
        <Trash2 className="w-4 h-4" />
      </ToolButton>
      <ToolButton onClick={onClear} disabled={!hasDrawings} title="Clear all drawings">
        <Eraser className="w-4 h-4" />
      </ToolButton>
    </div>
  );
}
