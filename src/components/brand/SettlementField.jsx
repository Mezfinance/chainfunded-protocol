import { useEffect, useRef } from "react";

/**
 * SettlementField — the app-wide backdrop.
 *
 * Not decoration: the faint grid is the chain (a ledger lattice), the soft
 * green glow is capital pooled in the protocol, the fine grain gives depth.
 * Fixed behind all content, dark-mode only, motion-safe.
 *
 * Step 3 — the field is alive:
 *  - Ignition: on first load the grid fades in, the glow blooms, and a band of
 *    light sweeps down once (the field "powers on").
 *  - Settlement pulses: light travels along a grid line and blooms — capital
 *    settling on-chain. Three ambient loops run always; dispatching a
 *    `cf:settlement` window event spawns an extra one-shot pulse, so real
 *    protocol events (a payout, a passed challenge, a trade close) can make the
 *    background react. Example:
 *      window.dispatchEvent(new CustomEvent("cf:settlement", { detail: { row: 6 } }))
 *
 * All motion is disabled under prefers-reduced-motion (handled in index.css,
 * and event bursts are skipped here too). Layer styles live in
 * src/index.css (`.settlement-*`). Mounted once in App.
 */
export default function SettlementField() {
  const pulsesRef = useRef(null);

  useEffect(() => {
    const host = pulsesRef.current;
    if (!host) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onSettlement = (e) => {
      if (reduced?.matches) return;
      const row = Number.isFinite(e?.detail?.row) ? e.detail.row : 3 + Math.floor(Math.random() * 12);
      const span = document.createElement("span");
      span.className = "settlement-pulse settlement-pulse--burst";
      span.style.top = `${row * 50}px`;
      span.addEventListener("animationend", () => span.remove(), { once: true });
      host.appendChild(span);
    };
    window.addEventListener("cf:settlement", onSettlement);
    return () => window.removeEventListener("cf:settlement", onSettlement);
  }, []);

  return (
    <div className="settlement-field" aria-hidden="true">
      <div className="settlement-grid" />
      <div className="settlement-glow" />
      <div className="settlement-grain" />
      <div className="settlement-ignite" />
      <div className="settlement-pulses" ref={pulsesRef}>
        <span className="settlement-pulse" style={{ top: "150px", animationDuration: "11s", animationDelay: "0.8s" }} />
        <span className="settlement-pulse" style={{ top: "400px", animationDuration: "13s", animationDelay: "5s" }} />
        <span className="settlement-pulse" style={{ top: "650px", animationDuration: "12s", animationDelay: "9s" }} />
      </div>
    </div>
  );
}
