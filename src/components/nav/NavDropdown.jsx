import { useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hover-triggered dropdown for top-nav items with sub-pages or tabs.
 *
 * trigger:        { label, icon, active? } — used by the default Button render
 * triggerRender:  optional function returning a custom trigger element. When
 *                 provided, `trigger` is ignored.
 * items:          [{ label, description?, icon?, to, onSelect? }, ...]
 *
 * Opens on mouse enter (with a small delay), closes on leave (with a
 * longer delay so the cursor can travel from trigger to panel without
 * the panel snapping shut). Clicking the default Button trigger navigates
 * to `triggerTo`; custom triggers handle their own click behaviour.
 */
export default function NavDropdown({ trigger, triggerRender, items, triggerTo, align = "left" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const enterT = useRef(null);
  const leaveT = useRef(null);

  const cancelTimers = () => {
    if (enterT.current) { clearTimeout(enterT.current); enterT.current = null; }
    if (leaveT.current) { clearTimeout(leaveT.current); leaveT.current = null; }
  };

  const handleEnter = () => {
    cancelTimers();
    enterT.current = setTimeout(() => setOpen(true), 80);
  };
  const handleLeave = () => {
    cancelTimers();
    leaveT.current = setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => () => cancelTimers(), []);

  const Icon = trigger?.icon;

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {triggerRender ? (
        triggerRender({ open })
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1.5 ${trigger.active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => triggerTo && navigate(triggerTo)}
        >
          {Icon && <Icon className="w-4 h-4" />}
          {trigger.label}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      )}

      {open && (
        <div
          className={`absolute top-full mt-2 ${align === "right" ? "right-0" : "left-0"} z-50`}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="bg-popover border border-border rounded-lg shadow-2xl py-2 min-w-[280px] animate-in fade-in slide-in-from-top-1 duration-150">
            {items.map((it, i) => {
              const ItemIcon = it.icon;
              const content = (
                <div className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors group cursor-pointer">
                  {ItemIcon && (
                    <div className="mt-0.5 w-7 h-7 shrink-0 rounded-md bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <ItemIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {it.label}
                    </div>
                    {it.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {it.description}
                      </div>
                    )}
                  </div>
                </div>
              );
              if (it.onSelect) {
                return (
                  <button
                    key={i}
                    onClick={() => { it.onSelect(); setOpen(false); }}
                    className="w-full text-left"
                  >
                    {content}
                  </button>
                );
              }
              return (
                <Link key={i} to={it.to} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
