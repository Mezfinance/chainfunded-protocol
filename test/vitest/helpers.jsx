/**
 * Test rendering helpers — wraps components with required providers.
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Render a component wrapped in MemoryRouter (for Link/useNavigate).
 * Use instead of raw render() for any component that uses react-router.
 */
export function renderWithRouter(ui, { route = "/", ...options } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>,
    options
  );
}

/**
 * Format helpers matching the app's display functions.
 */
export function fmtCfg(wei) {
  if (!wei) return "0";
  const n = Number(wei) / 1e18;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

export function fmtUsdc(wei) {
  if (!wei) return "$0";
  const n = Number(wei) / 1e6;
  return "$" + n.toFixed(2);
}
