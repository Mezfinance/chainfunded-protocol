/**
 * App-level mocks — AuthContext, Base44 client, thirdwebClient, router.
 *
 * Usage in tests:
 *   import { setAuthState } from "../mocks/app";
 *   setAuthState({ isAuthenticated: true, address: "0x...", isAdmin: true });
 */

import { vi } from "vitest";

// ── Auth state ───────────────────────────────────────────────────────────────

const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

let authState = {
  address: TEST_ADDRESS,
  isAuthenticated: true,
  isAdmin: false,
  isSanctioned: false,
};

export function setAuthState(overrides) {
  authState = { ...authState, ...overrides };
}

export function resetAuthState() {
  authState = {
    address: TEST_ADDRESS,
    isAuthenticated: true,
    isAdmin: false,
    isSanctioned: false,
  };
}

// ── Base44 mock ──────────────────────────────────────────────────────────────

let entityStore = {};

export function seedEntity(entityName, records) {
  entityStore[entityName] = records;
}

export function resetEntities() {
  entityStore = {};
}

const mockBase44Entity = (name) => ({
  filter: vi.fn(async () => entityStore[name] || []),
  get: vi.fn(async (id) => (entityStore[name] || []).find(r => r.id === id)),
  create: vi.fn(async (data) => {
    const record = { id: Date.now().toString(), ...data };
    if (!entityStore[name]) entityStore[name] = [];
    entityStore[name].push(record);
    return record;
  }),
  update: vi.fn(async (id, data) => {
    const records = entityStore[name] || [];
    const idx = records.findIndex(r => r.id === id);
    if (idx >= 0) records[idx] = { ...records[idx], ...data };
    return records[idx];
  }),
  delete: vi.fn(async (id) => {
    const records = entityStore[name] || [];
    entityStore[name] = records.filter(r => r.id !== id);
  }),
});

// ── Module mock setup ────────────────────────────────────────────────────────

export function setupAppMocks() {
  // Mock AuthContext
  vi.mock("@/lib/AuthContext", () => ({
    useAuth: () => authState,
    AuthProvider: ({ children }) => children,
  }));

  // Mock Base44 client
  vi.mock("@/api/base44Client", () => ({
    base44: {
      entities: new Proxy({}, {
        get: (_, name) => mockBase44Entity(name),
      }),
      functions: {
        invoke: vi.fn(async (name, params) => {
          if (name === "generatePayoutProof") {
            return {
              signatures: ["0x" + "ab".repeat(65)],
              grossProfitUsdc: params.grossProfitUsdc || "100000000",
              worstDailyLossBps: "200",
              maxDrawdownBps: "500",
              tradingDaysCount: "5",
              bestDayBps: "4000",
              payoutId: "test-payout-001",
              deadline: String(Math.floor(Date.now() / 1000) + 3600),
            };
          }
          return {};
        }),
      },
    },
  }));

  // Mock thirdwebClient
  vi.mock("@/lib/thirdwebClient", () => ({
    thirdwebClient: { _isMockClient: true },
    chain: { id: 31337 },
    wallets: [],
    appMetadata: { name: "ChainFunded", url: "http://localhost:5173" },
    explorerTxUrl: (hash) => `https://sepolia.etherscan.io/tx/${hash}`,
  }));

  // Mock gasEstimate
  vi.mock("@/lib/gasEstimate", () => ({
    getGasReimbursement: vi.fn(async () => 0n),
    isInAppWallet: vi.fn(() => false),
  }));

  // Mock utils
  vi.mock("@/utils", async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      createPageUrl: (page) => `/${page}`,
    };
  });
}
