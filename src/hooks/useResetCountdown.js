import { useEffect, useState } from "react";

// Time remaining until the next 00:00 UTC — when the daily-loss limit resets
// and a new trading day begins (worker/index.js resetDailyLoss). Returns a
// preformatted "Xh YYm" label and ticks once a second so any consumer stays live.
function compute() {
  const now = new Date();
  const next = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0
  );
  const totalSec = Math.max(0, Math.floor((next - now.getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return { h, m, label: `${h}h ${String(m).padStart(2, "0")}m` };
}

export function useResetCountdown() {
  const [state, setState] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setState(compute()), 1000);
    return () => clearInterval(id);
  }, []);
  return state;
}
