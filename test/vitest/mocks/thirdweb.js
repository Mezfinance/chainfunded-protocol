/**
 * Thirdweb mock — deterministic contract read responses for unit tests.
 *
 * Mocks: readContract, getContract, prepareContractCall, useSendTransaction,
 * useActiveAccount, useConnectModal, useDisconnect, useActiveWallet
 *
 * Usage in tests:
 *   import { setMockResponses, resetMocks } from "../mocks/thirdweb";
 *   beforeEach(() => resetMocks());
 *   setMockResponses({ "function balanceOf(address) view returns (uint256)": 1000000n });
 */

import { vi } from "vitest";

// ── Response store ───────────────────────────────────────────────────────────
// Key: method signature string → value to return
let mockResponses = {};
let sendTxCallback = null;

export function setMockResponses(responses) {
  mockResponses = { ...mockResponses, ...responses };
}

export function setSendTxCallback(cb) {
  sendTxCallback = cb;
}

export function resetMocks() {
  mockResponses = {};
  sendTxCallback = null;
}

// ── Mock implementations ─────────────────────────────────────────────────────

export const mockReadContract = vi.fn(async ({ method, params }) => {
  // Extract the function name from the method signature
  const match = method.match(/function\s+(\w+)/);
  const fnName = match ? match[1] : method;

  // Check for exact method match first, then function name
  if (method in mockResponses) return mockResponses[method];
  if (fnName in mockResponses) return mockResponses[fnName];

  // Check for parameterised responses: "fnName:param" format
  if (params && params.length > 0) {
    const paramKey = `${fnName}:${params[0]}`;
    if (paramKey in mockResponses) return mockResponses[paramKey];
  }

  console.warn(`[mock] No response for: ${fnName}(${params?.join(", ") || ""})`);
  return 0n;
});

export const mockGetContract = vi.fn(({ address }) => ({
  address,
  _isMockContract: true,
}));

export const mockPrepareContractCall = vi.fn(({ method, params }) => ({
  _method: method,
  _params: params,
  _isMockTx: true,
}));

export const mockSendTransaction = vi.fn(async (tx) => {
  if (sendTxCallback) return sendTxCallback(tx);
  return { transactionHash: "0x" + "ab".repeat(32) };
});

export const mockWaitForReceipt = vi.fn(async () => ({
  status: "success",
  transactionHash: "0x" + "ab".repeat(32),
}));

// ── React hook mocks ─────────────────────────────────────────────────────────

const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export const mockUseActiveAccount = vi.fn(() => ({
  address: TEST_ADDRESS,
}));

export const mockUseConnectModal = vi.fn(() => ({
  connect: vi.fn(),
}));

export const mockUseDisconnect = vi.fn(() => ({
  disconnect: vi.fn(),
}));

export const mockUseActiveWallet = vi.fn(() => ({
  _isMockWallet: true,
}));

export const mockUseSendTransaction = vi.fn(() => ({
  mutateAsync: mockSendTransaction,
}));

export const mockSwitchChain = vi.fn(async () => {});
export const mockUseSwitchActiveWalletChain = vi.fn(() => mockSwitchChain);

// ── Module mock setup (call from vi.mock) ────────────────────────────────────

export function setupThirdwebMocks() {
  // Mock "thirdweb" package
  vi.mock("thirdweb", () => ({
    readContract: mockReadContract,
    getContract: mockGetContract,
    prepareContractCall: mockPrepareContractCall,
    waitForReceipt: mockWaitForReceipt,
    getContractEvents: vi.fn(async () => []),
    prepareEvent: vi.fn(() => ({})),
    createThirdwebClient: vi.fn(() => ({ _isMockClient: true })),
  }));

  // Mock "thirdweb/react"
  vi.mock("thirdweb/react", () => ({
    useActiveAccount: mockUseActiveAccount,
    useConnectModal: mockUseConnectModal,
    useDisconnect: mockUseDisconnect,
    useActiveWallet: mockUseActiveWallet,
    useSendTransaction: mockUseSendTransaction,
    useSwitchActiveWalletChain: mockUseSwitchActiveWalletChain,
    ThirdwebProvider: ({ children }) => children,
  }));

  // Mock "thirdweb/chains"
  vi.mock("thirdweb/chains", () => ({
    sepolia: { id: 11155111 },
    baseSepolia: { id: 84532 },
    base: { id: 8453 },
    ethereum: { id: 1 },
  }));

  // Mock "thirdweb/wallets"
  vi.mock("thirdweb/wallets", () => ({
    createWallet: vi.fn(() => ({})),
    inAppWallet: vi.fn(() => ({})),
  }));

  // Mock "thirdweb/extensions/erc20"
  vi.mock("thirdweb/extensions/erc20", () => ({
    approve: vi.fn(() => ({ _isMockApproval: true })),
  }));
}
