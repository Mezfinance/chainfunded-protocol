/**
 * Vitest global setup — runs before every test file.
 *
 * - Adds jest-dom matchers (toBeInTheDocument, toHaveTextContent, etc.)
 * - Mocks browser APIs not available in jsdom
 * - Mocks thirdweb contract reads for deterministic tests
 */
import "@testing-library/jest-dom/vitest";

// ── Mock localStorage ────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// ── Mock sessionStorage ──────────────────────────────────────────────────────
Object.defineProperty(globalThis, "sessionStorage", { value: localStorageMock });

// ── Mock window.matchMedia (used by Tailwind/Radix for responsive queries) ──
Object.defineProperty(globalThis, "matchMedia", {
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ── Mock ResizeObserver (used by Recharts, Radix) ────────────────────────────
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── Mock IntersectionObserver ────────────────────────────────────────────────
globalThis.IntersectionObserver = class {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── Mock import.meta.env defaults ────────────────────────────────────────────
// These can be overridden per-test via vi.stubEnv()
if (!import.meta.env.VITE_CHAIN_ID) {
  import.meta.env.VITE_CHAIN_ID = "31337"; // Hardhat local
}
if (!import.meta.env.VITE_THIRDWEB_CLIENT_ID) {
  import.meta.env.VITE_THIRDWEB_CLIENT_ID = "test-placeholder";
}
