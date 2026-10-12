/**
 * TermsAcceptanceGate tests — scroll requirement, checkbox, age confirmation.
 */
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { setupThirdwebMocks } from "../mocks/thirdweb";
import { setupAppMocks } from "../mocks/app";
import { renderWithRouter } from "../helpers";

setupThirdwebMocks();
setupAppMocks();

// Mock termsAcceptance
vi.mock("@/lib/termsAcceptance", () => ({
  recordTermsAcceptance: vi.fn(async () => {}),
  hasAcceptedTerms: vi.fn(async () => false),
}));

// Mock fetch for terms markdown loading
const MOCK_TERMS = "# Terms and Conditions\n\nThese are mock terms for testing.";
globalThis.fetch = vi.fn(async () => ({
  text: async () => MOCK_TERMS,
  ok: true,
}));

// Mock crypto.subtle for terms version hashing
if (!globalThis.crypto?.subtle) {
  globalThis.crypto = {
    ...globalThis.crypto,
    subtle: {
      digest: vi.fn(async () => new ArrayBuffer(32)),
    },
  };
}

const { default: TermsAcceptanceGate } = await import("@/components/TermsAcceptanceGate");

describe("TermsAcceptanceGate", () => {
  const defaultProps = {
    variant: "standard",
    walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    onAccept: vi.fn(),
  };

  it("renders terms content", async () => {
    renderWithRouter(<TermsAcceptanceGate {...defaultProps} />);
    // Wait for fetch + render — multiple elements match (heading + checkbox text)
    const elements = await screen.findAllByText(/terms and conditions/i);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("checkbox includes age confirmation text", () => {
    renderWithRouter(<TermsAcceptanceGate {...defaultProps} />);
    expect(screen.getByText(/I confirm I am at least 18 years of age/i)).toBeInTheDocument();
  });

  it("checkbox disabled before scrolling to bottom", () => {
    renderWithRouter(<TermsAcceptanceGate {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");
    // Checkbox should be disabled (user hasn't scrolled)
    expect(checkbox).toBeDisabled();
  });

  it("accept button disabled when checkbox unchecked", () => {
    renderWithRouter(<TermsAcceptanceGate {...defaultProps} />);
    const acceptBtn = screen.getByText(/accept terms/i);
    expect(acceptBtn).toBeDisabled();
  });

  it("shows whitelist variant text", () => {
    renderWithRouter(<TermsAcceptanceGate {...defaultProps} variant="whitelist" />);
    expect(screen.getByText(/whitelisted account terms/i)).toBeInTheDocument();
  });

  it("shows standard variant text", () => {
    renderWithRouter(<TermsAcceptanceGate {...defaultProps} variant="standard" />);
    const text = screen.getByText(/I confirm I am at least 18 years of age/i);
    expect(text.textContent).toContain("Evaluation Programme Terms");
    expect(text.textContent).not.toContain("Whitelisted Account Terms");
  });
});
