/**
 * useSeasonData hook tests — all 6 season states + user data.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { setupThirdwebMocks, setMockResponses, resetMocks, mockReadContract } from "../mocks/thirdweb";
import { setupAppMocks } from "../mocks/app";

// Must call setup before importing the hook
setupThirdwebMocks();
setupAppMocks();

// Stub env vars before import
vi.stubEnv("VITE_CFG_DISTRIBUTOR_ADDRESS", "0x1111111111111111111111111111111111111111");
vi.stubEnv("VITE_CFG_LP_REWARDS_ADDRESS", "0x2222222222222222222222222222222222222222");
vi.stubEnv("VITE_CFG_TOKEN_ADDRESS", "0x3333333333333333333333333333333333333333");

const { default: useSeasonData } = await import("@/hooks/useSeasonData");

describe("useSeasonData", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns loading state initially", () => {
    setMockResponses({
      activeSeason: 0n,
      seasonCount: 0n,
    });

    const { result } = renderHook(() => useSeasonData());
    expect(result.current.loading).toBe(true);
  });

  it("returns no-seasons state when seasonCount is 0", async () => {
    setMockResponses({
      activeSeason: 0n,
      seasonCount: 0n,
      totalStaked: 0n,
      currentRewardRate: 0n,
    });

    const { result } = renderHook(() => useSeasonData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeSeason).toBe(0);
    expect(result.current.seasonCount).toBe(0);
  });

  it("returns active season with start/end times", async () => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 86400; // started 1 day ago
    const end = now + 86400 * 181; // 181 days left

    setMockResponses({
      activeSeason: 1n,
      seasonCount: 10n,
      // seasons(1) returns a tuple
      seasons: [BigInt(start), BigInt(end), 4500000n * 10n**18n, 50000n, false],
      totalStaked: 100000n * 10n**6n,
      currentRewardRate: 15898453398453398n,
    });

    const { result } = renderHook(() => useSeasonData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeSeason).toBe(1);
    expect(result.current.seasonCount).toBe(10);
    expect(result.current.seasonStart).toBe(start);
    expect(result.current.seasonEnd).toBe(end);
  });

  it("fetches user-specific data when address provided", async () => {
    const now = Math.floor(Date.now() / 1000);

    setMockResponses({
      activeSeason: 1n,
      seasonCount: 1n,
      seasons: [BigInt(now - 100), BigInt(now + 86400 * 182), 4500000n * 10n**18n, 10000n, false],
      getTraderRegistrations: [1n, 2n],
      totalStaked: 50000n * 10n**6n,
      currentRewardRate: 15898453398453398n,
      stakedBalance: 10000n * 10n**6n,
      earnedCfg: 500n * 10n**18n,
      earnedUsdc: 25n * 10n**6n,
      balanceOf: 1000n * 10n**18n,
    });

    // Mock individual registration reads
    mockReadContract.mockImplementation(async ({ method, params }) => {
      const match = method.match(/function\s+(\w+)/);
      const fn = match ? match[1] : method;

      if (fn === "activeSeason") return 1n;
      if (fn === "seasonCount") return 1n;
      if (fn === "seasons") return [BigInt(now - 100), BigInt(now + 86400 * 182), 4500000n * 10n**18n, 10000n, false];
      if (fn === "getTraderRegistrations") return [1n, 2n];
      if (fn === "registrations") {
        return [
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // trader
          1000n * 10n**6n, // accountSizeUsdc
          1,               // phase
          false,           // isWhitelist
          1000n,           // points
          1n,              // seasonId
          false,           // claimed
        ];
      }
      if (fn === "previewClaim") return [100n * 10n**18n, 500n];
      if (fn === "totalStaked") return 50000n * 10n**6n;
      if (fn === "currentRewardRate") return 15898453398453398n;
      if (fn === "stakedBalance") return 10000n * 10n**6n;
      if (fn === "earnedCfg") return 500n * 10n**18n;
      if (fn === "earnedUsdc") return 25n * 10n**6n;
      if (fn === "balanceOf") return 1000n * 10n**18n;

      return 0n;
    });

    const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const { result } = renderHook(() => useSeasonData(addr));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.earnedCfg).toBe(500n * 10n**18n);
    expect(result.current.earnedUsdc).toBe(25n * 10n**6n);
    expect(result.current.userStaked).toBe(10000n * 10n**6n);
    expect(result.current.cfgBalance).toBe(1000n * 10n**18n);
  });

  it("detects next season when between seasons", async () => {
    const now = Math.floor(Date.now() / 1000);
    const futureStart = now + 86400 * 30; // 30 days from now

    mockReadContract.mockImplementation(async ({ method, params }) => {
      const match = method.match(/function\s+(\w+)/);
      const fn = match ? match[1] : method;

      if (fn === "activeSeason") return 0n;
      if (fn === "seasonCount") return 2n;
      if (fn === "seasons") {
        const seasonId = Number(params?.[0] ?? 1);
        if (seasonId === 1) return [BigInt(now - 86400 * 200), BigInt(now - 86400 * 18), 4500000n * 10n**18n, 5000n, true];
        if (seasonId === 2) return [BigInt(futureStart), BigInt(futureStart + 86400 * 182), 3000000n * 10n**18n, 0n, false];
        return [0n, 0n, 0n, 0n, false];
      }
      if (fn === "totalStaked") return 0n;
      if (fn === "currentRewardRate") return 0n;

      return 0n;
    });

    const { result } = renderHook(() => useSeasonData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeSeason).toBe(0);
    expect(result.current.nextSeasonId).toBe(2);
    expect(result.current.nextSeasonStart).toBe(futureStart);
  });

  it("detects all seasons complete", async () => {
    const now = Math.floor(Date.now() / 1000);

    mockReadContract.mockImplementation(async ({ method, params }) => {
      const match = method.match(/function\s+(\w+)/);
      const fn = match ? match[1] : method;

      if (fn === "activeSeason") return 0n;
      if (fn === "seasonCount") return 10n;
      if (fn === "seasons") {
        // All seasons in the past and finalized
        const i = Number(params?.[0] ?? 1);
        const start = now - 86400 * 182 * (11 - i);
        const end = start + 86400 * 182;
        return [BigInt(start), BigInt(end), 1000000n * 10n**18n, 5000n, true];
      }
      if (fn === "totalStaked") return 0n;
      if (fn === "currentRewardRate") return 0n;

      return 0n;
    });

    const { result } = renderHook(() => useSeasonData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allSeasonsComplete).toBe(true);
  });

  it("surfaces an ended season nobody has finalized, with the trader's share", async () => {
    const now = Math.floor(Date.now() / 1000);
    const trader = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    mockReadContract.mockImplementation(async ({ method, params }) => {
      const fn = method.match(/function\s+(\w+)/)?.[1];
      const id = Number(params?.[0] ?? 0);
      if (fn === "activeSeason") return 2n;
      if (fn === "seasonCount") return 10n;
      if (fn === "seasons" && id === 1) {
        return [BigInt(now - 86400 * 183), BigInt(now - 86400), 4500000n * 10n**18n, 21500n, false];
      }
      if (fn === "seasons") return [BigInt(now - 3600), BigInt(now + 86400 * 181), 3000000n * 10n**18n, 0n, false];
      if (fn === "getTraderRegistrations") return id === 1 ? [7n] : [];
      if (fn === "registrations") return [trader, 1000n * 10n**6n, 1, false, 1000n, 1n, false];
      if (fn === "previewClaim") return [0n, 0n];
      return 0n;
    });

    const { result } = renderHook(() => useSeasonData(trader));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.lastEndedSeason).toMatchObject({ id: 1, totalPoints: 21500n, finalized: false });
    expect(result.current.pendingFinalize.map(s => s.id)).toEqual([1]);
    expect(result.current.traderPendingFinalize).toEqual([
      { seasonId: 1, points: 1000n, cfgAmount: (1000n * 4500000n * 10n**18n) / 21500n },
    ]);
  });

  it("handles error gracefully", async () => {
    mockReadContract.mockRejectedValue(new Error("RPC error"));

    const { result } = renderHook(() => useSeasonData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
  });
});
