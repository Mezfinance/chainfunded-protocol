import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

const COLORS = ["#22e07a", "#4ade80", "#fde047", "#38bdf8", "#f472b6", "#ffffff"];

/**
 * ZoneWinModal — brief centered celebration with confetti on a win.
 * Auto-dismisses after ~3.2s; click anywhere or "Nice" to close.
 */
export default function ZoneWinModal({ open, amount, symbol, direction, onClose }) {
  const canvasRef = useRef(null);

  // Auto-dismiss
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [open, onClose]);

  // Confetti
  useEffect(() => {
    if (!open) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const dpr = window.devicePixelRatio || 1;
    let W = window.innerWidth, H = window.innerHeight;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
    };
    resize();
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const parts = [];
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: Math.random() * W,
        y: -20 - Math.random() * H * 0.6,
        vx: (Math.random() - 0.5) * 70,
        vy: 120 + Math.random() * 200,
        s: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 9,
        col: COLORS[i % COLORS.length],
      });
    }

    let raf, last = performance.now();
    const draw = (ts) => {
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div
        className="relative z-10 mx-4 rounded-2xl border border-green-500/40 bg-card px-8 py-7 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-green-400 mb-2">In Profit</p>
        <p
          className="font-grotesk text-4xl font-bold text-green-400 mb-1"
          style={{ textShadow: "0 0 24px rgba(34,224,122,0.6)" }}
        >
          +${Number(amount).toFixed(2)}
        </p>
        <p className="text-sm text-muted-foreground mb-5">
          {direction} on {symbol} closed in profit · added to your account
        </p>
        <Button onClick={onClose} className="bg-green-500 text-white hover:bg-green-600 font-grotesk font-semibold px-8">
          Nice
        </Button>
      </div>
    </div>
  );
}
