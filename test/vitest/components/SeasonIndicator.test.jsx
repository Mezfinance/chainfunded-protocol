/**
 * SeasonIndicator component tests — all 6 display states.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { setupThirdwebMocks } from "../mocks/thirdweb";
import { setupAppMocks } from "../mocks/app";
import { renderWithRouter } from "../helpers";

setupThirdwebMocks();
setupAppMocks();

// Mock useSeasonData with controllable state
let mockSeasonState = {};

vi.mock("@/hooks/useSeasonData", () => ({
  default: () => mockSeasonState,
}));

const { default: SeasonIndicator } = await import("@/components/cfg/SeasonIndicator");

function setSeasonState(overrides) {
  mockSeasonState = {
    activeSeason: null,
    seasonCount: null,
    seasonStart: null,
    seasonEnd: null,
    nextSeasonId: null,
    lastSeasonId: null,
    allSeasonsComplete: false,
    loading: false,
    ...overrides,
  };
}

describe("SeasonIndicator", () => {
  beforeEach(() => {
    setSeasonState({});
  });

  it("shows 'CFG Rewards' when no contract data", () => {
    setSeasonState({ loading: false, seasonCount: 0 });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("CFG Rewards")).toBeInTheDocument();
  });

  it("shows 'CFG Rewards' while loading", () => {
    setSeasonState({ loading: true });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("CFG Rewards")).toBeInTheDocument();
  });

  it("shows 'Rewards S1 Coming Soon' when pre-season", () => {
    const now = Math.floor(Date.now() / 1000);
    setSeasonState({
      seasonCount: 10,
      nextSeasonId: 1,
      nextSeasonStart: now + 86400,
    });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("Rewards S1 Coming Soon")).toBeInTheDocument();
  });

  it("shows 'Rewards S3' with progress bar during active season", () => {
    const now = Math.floor(Date.now() / 1000);
    setSeasonState({
      activeSeason: 3,
      seasonCount: 10,
      seasonStart: now - 86400 * 91, // halfway through 182-day season
      seasonEnd: now + 86400 * 91,
    });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("Rewards S3")).toBeInTheDocument();
    // Progress bar should be present (the container div)
    const progressBar = document.querySelector(".bg-primary.rounded-full.h-full");
    expect(progressBar).toBeTruthy();
  });

  it("shows 'Rewards S4 Coming Soon' between seasons", () => {
    setSeasonState({
      seasonCount: 10,
      nextSeasonId: 4,
      nextSeasonStart: Math.floor(Date.now() / 1000) + 86400 * 30,
    });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("Rewards S4 Coming Soon")).toBeInTheDocument();
  });

  it("shows 'Rewards S3 Ended' when last season ended", () => {
    setSeasonState({
      seasonCount: 3,
      lastSeasonId: 3,
    });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("Rewards S3 Ended")).toBeInTheDocument();
  });

  it("shows 'Rewards Complete' when all 10 seasons done", () => {
    setSeasonState({
      seasonCount: 10,
      allSeasonsComplete: true,
    });
    renderWithRouter(<SeasonIndicator />);
    expect(screen.getByText("Rewards Complete")).toBeInTheDocument();
  });

  it("links to CfgRewards page", () => {
    setSeasonState({ loading: false, seasonCount: 0 });
    renderWithRouter(<SeasonIndicator />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/CfgRewards");
  });

  it("does not show progress bar when no active season", () => {
    setSeasonState({ seasonCount: 10, nextSeasonId: 1 });
    renderWithRouter(<SeasonIndicator />);
    const progressBar = document.querySelector(".bg-primary.rounded-full.h-full");
    expect(progressBar).toBeNull();
  });
});
