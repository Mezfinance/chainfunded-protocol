import { useState, useEffect } from "react";
import { fetchZoneConfig } from "@/lib/zoneTrades";

const POLL_MS = 20_000;

/**
 * Resolves whether the connected wallet may use Zone Trading and the live
 * config the worker is currently quoting.
 *
 * The worker is the source of truth for `enabled`, `allowed`, AND the
 * per-pair live σ that drives band widths. Because σ adapts to current vol,
 * we poll every POLL_MS so the chart's prospective bands match what the
 * worker will snapshot at placement. Without the poll, the chart can show
 * one set of bands while placement uses a different (tighter) one — which
 * reads as "KOed inside the line I saw". Fails closed on errors.
 */
export function useZoneAccess(address, symbol) {
  const [state, setState] = useState({ enabled: false, allowed: false, config: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      // Pass the currently-viewed symbol so the worker warms its σ on
      // demand. On pair switch this effect re-runs (symbol is in deps)
      // and the first poll triggers a warm-start for the new pair.
      fetchZoneConfig(address, symbol)
        .then((cfg) => {
          if (cancelled) return;
          setState({ enabled: !!cfg.enabled, allowed: !!cfg.allowed, config: cfg, loading: false });
        })
        .catch(() => {
          if (!cancelled) setState((s) => s.config ? { ...s, loading: false } : { enabled: false, allowed: false, config: null, loading: false });
        });
    };
    setState((s) => ({ ...s, loading: true }));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [address, symbol]);

  return state;
}
