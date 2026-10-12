/**
 * TradingRewards component tests — points display, empty states, claiming.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  setupThirdwebMocks, mockSendTransaction, mockPrepareContractCall, setMockResponses, resetMocks,
} from "../mocks/thirdweb";
import { setupAppMocks } from "../mocks/app";
import { renderWithRouter } from "../helpers";

setupThirdwebMocks();
setupAppMocks();

vi.stubEnv("VITE_CFG_DISTRIBUTOR_ADDRESS", "0x1111111111111111111111111111111111111111");

const { default: TradingRewards } = await import("@/components/cfg/TradingRewards");

function makeSeason(overrides = {}) {
  return {
    activeSeason: 1,
    seasonCount: 10,
    seasonStart: Math.floor(Date.now() / 1000) - 86400,
    seasonEnd: Math.floor(Date.now() / 1000) + 86400 * 181,
    seasonBudgetTrader: 4500000n * 10n**18n,
    traderTotalPoints: 100000n,
    traderPoints: null,
    traderRegs: [],
    traderClaimable: [],
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("TradingRewards", () => {
  it("shows connect wallet message when not authenticated", () => {
    renderWithRouter(<TradingRewards season={makeSeason()} isAuthenticated={false} />);
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it("shows empty state when no points and no claimable", () => {
    renderWithRouter(<TradingRewards season={makeSeason()} isAuthenticated={true} />);
    expect(screen.getByText(/no trading rewards yet/i)).toBeInTheDocument();
    expect(screen.getByText(/start a challenge/i)).toBeInTheDocument();
  });

  it("shows current season points and pool share", () => {
    const season = makeSeason({
      traderPoints: 10000n,
      traderTotalPoints: 100000n,
    });
    renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
    expect(screen.getByText("This Season")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument(); // 10000/100000
  });

  it("shows estimated CFG at season end", () => {
    const season = makeSeason({
      traderPoints: 10000n,
      traderTotalPoints: 100000n,
      seasonBudgetTrader: 4500000n * 10n**18n,
    });
    renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
    // 10% of 4.5M = 450K
    expect(screen.getByText(/~450.0K/)).toBeInTheDocument();
  });

  it("shows claimable past seasons with claim button", () => {
    const season = makeSeason({
      traderClaimable: [
        { seasonId: 1, cfgAmount: 42300n * 10n**18n, points: 5000n },
        { seasonId: 2, cfgAmount: 18100n * 10n**18n, points: 3000n },
      ],
    });
    renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
    expect(screen.getByText("Claimable Rewards")).toBeInTheDocument();
    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
    expect(screen.getAllByText("Claim")).toHaveLength(2);
  });

  it("shows both current points and claimable", () => {
    const season = makeSeason({
      traderPoints: 5000n,
      traderTotalPoints: 50000n,
      traderClaimable: [
        { seasonId: 1, cfgAmount: 10000n * 10n**18n, points: 1000n },
      ],
    });
    renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
    expect(screen.getByText("This Season")).toBeInTheDocument();
    expect(screen.getByText("Claimable Rewards")).toBeInTheDocument();
  });

  describe("ended season awaiting finalization", () => {
    beforeEach(() => {
      resetMocks();
      mockSendTransaction.mockClear();
      mockPrepareContractCall.mockClear();
    });

    it("shows the earned CFG instead of the empty state", () => {
      const season = makeSeason({
        activeSeason: 2,
        traderPendingFinalize: [{ seasonId: 1, cfgAmount: 209302n * 10n**18n, points: 1000n }],
      });
      renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
      expect(screen.getByText("Season Rewards Ready")).toBeInTheDocument();
      expect(screen.getByText("Season 1")).toBeInTheDocument();
      expect(screen.getByText("209.3K CFG")).toBeInTheDocument();
      expect(screen.queryByText(/no trading rewards yet/i)).not.toBeInTheDocument();
    });

    it("finalizes the season, then claims", async () => {
      setMockResponses({ seasons: [0n, 0n, 0n, 0n, false] });
      const season = makeSeason({
        activeSeason: 2,
        traderPendingFinalize: [{ seasonId: 1, cfgAmount: 209302n * 10n**18n, points: 1000n }],
      });
      renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
      await userEvent.click(screen.getByRole("button", { name: "Claim" }));

      const methods = mockPrepareContractCall.mock.calls.map(([c]) => c.method);
      expect(methods).toEqual(["function finalizeSeason(uint256)", "function claim(uint256)"]);
      expect(mockSendTransaction).toHaveBeenCalledTimes(2);
      expect(season.refetch).toHaveBeenCalled();
    });

    it("skips finalize when someone already finalized the season", async () => {
      setMockResponses({ seasons: [0n, 0n, 0n, 0n, true] });
      const season = makeSeason({
        activeSeason: 2,
        traderPendingFinalize: [{ seasonId: 1, cfgAmount: 209302n * 10n**18n, points: 1000n }],
      });
      renderWithRouter(<TradingRewards season={season} isAuthenticated={true} />);
      await userEvent.click(screen.getByRole("button", { name: "Claim" }));

      const methods = mockPrepareContractCall.mock.calls.map(([c]) => c.method);
      expect(methods).toEqual(["function claim(uint256)"]);
    });
  });
});
