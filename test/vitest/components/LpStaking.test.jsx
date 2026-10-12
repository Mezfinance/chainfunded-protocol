/**
 * LpStaking component tests — staking position, emission rate, empty states.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { setupThirdwebMocks } from "../mocks/thirdweb";
import { setupAppMocks } from "../mocks/app";
import { renderWithRouter } from "../helpers";

setupThirdwebMocks();
setupAppMocks();

vi.stubEnv("VITE_CFG_LP_REWARDS_ADDRESS", "0x2222222222222222222222222222222222222222");
vi.stubEnv("VITE_REWARDS_POOL_ADDRESS", "0x4444444444444444444444444444444444444444");

// Mock useChainFundedPool
let mockPoolState = {};
vi.mock("@/hooks/useChainFundedPool", () => ({
  useChainFundedPool: () => mockPoolState,
}));

const { default: LpStaking } = await import("@/components/cfg/LpStaking");

function makeSeason(overrides = {}) {
  return {
    activeSeason: 1,
    totalStaked: 500000n * 10n**6n,
    userStaked: null,
    earnedCfg: null,
    earnedUsdc: null,
    rewardRate: 15898453398453398n, // ~1373 CFG/day
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("LpStaking", () => {
  beforeEach(() => {
    mockPoolState = {
      userCfndBalance: null,
      refetch: vi.fn(),
    };
  });

  it("shows connect wallet message when not authenticated", () => {
    renderWithRouter(<LpStaking season={makeSeason()} isAuthenticated={false} />);
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it("shows empty state when no CFND and nothing staked", () => {
    mockPoolState.userCfndBalance = 0;
    renderWithRouter(<LpStaking season={makeSeason()} isAuthenticated={true} />);
    expect(screen.getByText(/no CFND to stake/i)).toBeInTheDocument();
    expect(screen.getByText(/go to LP Pool/i)).toBeInTheDocument();
  });

  it("shows staking position when user has staked", () => {
    mockPoolState.userCfndBalance = 50000;
    const season = makeSeason({
      userStaked: 100000n * 10n**6n,
      earnedCfg: 500n * 10n**18n,
      earnedUsdc: 25n * 10n**6n,
    });
    renderWithRouter(<LpStaking season={season} isAuthenticated={true} />);
    expect(screen.getByText("Staking Position")).toBeInTheDocument();
    expect(screen.getByText("100000.00")).toBeInTheDocument(); // staked amount
  });

  it("shows CFG and USDC earned with claim buttons", () => {
    mockPoolState.userCfndBalance = 50000;
    const season = makeSeason({
      userStaked: 100000n * 10n**6n,
      earnedCfg: 500n * 10n**18n,
      earnedUsdc: 25n * 10n**6n,
    });
    renderWithRouter(<LpStaking season={season} isAuthenticated={true} />);
    // Should show claim buttons for both
    const claimButtons = screen.getAllByText("Claim");
    expect(claimButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows emission rate info when staked", () => {
    mockPoolState.userCfndBalance = 50000;
    const season = makeSeason({
      userStaked: 100000n * 10n**6n,
      earnedCfg: 0n,
      earnedUsdc: 0n,
    });
    renderWithRouter(<LpStaking season={season} isAuthenticated={true} />);
    expect(screen.getByText("Season Emission Rate")).toBeInTheDocument();
    expect(screen.getByText("Your Share")).toBeInTheDocument();
    expect(screen.getByText("Your Est. Daily Earnings")).toBeInTheDocument();
  });

  it("shows share percentage correctly", () => {
    mockPoolState.userCfndBalance = 0;
    const season = makeSeason({
      userStaked: 250000n * 10n**6n,
      totalStaked: 500000n * 10n**6n,
      earnedCfg: 0n,
      earnedUsdc: 0n,
    });
    renderWithRouter(<LpStaking season={season} isAuthenticated={true} />);
    expect(screen.getByText("50.0%")).toBeInTheDocument(); // 250K / 500K
  });

  it("shows stake prompt when has CFND but not staked", () => {
    mockPoolState.userCfndBalance = 100000;
    const season = makeSeason({
      userStaked: 0n,
    });
    renderWithRouter(<LpStaking season={season} isAuthenticated={true} />);
    expect(screen.getByText(/stake to start earning/i)).toBeInTheDocument();
  });

  it("shows stake and unstake input cards", () => {
    mockPoolState.userCfndBalance = 50000;
    const season = makeSeason({
      userStaked: 100000n * 10n**6n,
      earnedCfg: 0n,
      earnedUsdc: 0n,
    });
    renderWithRouter(<LpStaking season={season} isAuthenticated={true} />);
    expect(screen.getByText("Stake CFND")).toBeInTheDocument();
    expect(screen.getByText("Unstake CFND")).toBeInTheDocument();
  });
});
