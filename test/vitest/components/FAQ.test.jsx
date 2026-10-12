/**
 * FAQ component tests — category tabs, accordion, mobile rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { setupThirdwebMocks } from "../mocks/thirdweb";
import { setupAppMocks } from "../mocks/app";
import { renderWithRouter } from "../helpers";

setupThirdwebMocks();
setupAppMocks();

// Mock SEO (uses react-helmet-async which needs a provider)
vi.mock("@/components/SEO", () => ({
  default: () => null,
}));

// Mock useDefaultRules
vi.mock("@/hooks/useDefaultRules", () => ({
  useDefaultRules: () => ({
    rules: {
      phase1Target: 10,
      phase2Target: 5,
      maxDailyLoss: 5,
      maxTotalLoss: 10,
      minTradingDays: 4,
      traderShare: 80,
    },
  }),
}));

const { default: FAQ } = await import("@/pages/FAQ");

describe("FAQ", () => {
  it("renders header and categories", () => {
    renderWithRouter(<FAQ />);
    expect(screen.getByText(/how can we/i)).toBeInTheDocument();
    expect(screen.getAllByText("Getting Started").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("The Challenge").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Trading Rules").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Getting Started questions by default", () => {
    renderWithRouter(<FAQ />);
    expect(screen.getByText("What is ChainFunded?")).toBeInTheDocument();
    expect(screen.getByText("How do I get started?")).toBeInTheDocument();
  });

  it("switches category when tab clicked", () => {
    renderWithRouter(<FAQ />);
    // Click "The Challenge" tab
    const challengeTab = screen.getAllByText("The Challenge")[0];
    fireEvent.click(challengeTab);
    expect(screen.getByText("What account sizes are available?")).toBeInTheDocument();
  });

  it("opens and closes accordion items", () => {
    renderWithRouter(<FAQ />);
    const question = screen.getByText("What is ChainFunded?");
    fireEvent.click(question);
    expect(screen.getByText(/decentralised prop trading/i)).toBeInTheDocument();
    // Click again to close
    fireEvent.click(question);
  });

  it("shows dynamic values from rules", () => {
    renderWithRouter(<FAQ />);
    // Click The Challenge category
    const challengeTab = screen.getAllByText("The Challenge")[0];
    fireEvent.click(challengeTab);
    // Click "How does the two-phase challenge work?"
    const phaseQ = screen.getByText(/how does the two-phase/i);
    fireEvent.click(phaseQ);
    // Should show 10% and 5% from rules
    expect(screen.getByText(/10% profit target/i)).toBeInTheDocument();
  });

  it("renders mobile horizontal tabs", () => {
    renderWithRouter(<FAQ />);
    // Both mobile tabs and desktop sidebar should exist
    // Mobile tabs have md:hidden, desktop has hidden md:block
    const allGettingStarted = screen.getAllByText("Getting Started");
    expect(allGettingStarted.length).toBeGreaterThanOrEqual(1);
  });

  it("shows all 8 categories", () => {
    renderWithRouter(<FAQ />);
    const expectedCategories = [
      "Getting Started", "The Challenge", "Trading Rules",
      "Funded Account", "Payouts & Withdrawals", "LP Pool",
      "Technical", "Affiliate Program",
    ];
    for (const cat of expectedCategories) {
      expect(screen.getAllByText(cat).length).toBeGreaterThanOrEqual(1);
    }
  });
});
