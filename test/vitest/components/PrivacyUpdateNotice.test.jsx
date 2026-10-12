/**
 * Privacy Policy update acknowledgement — gating, DB write, and the modal flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the Base44 client so we can assert the DB acknowledgement write.
const createAck = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/api/base44Client", () => ({
  base44: { entities: { TermsAcceptance: { create: createAck } } },
}));

// Auth is mockable per-test.
const authState = vi.hoisted(() => ({ value: { address: null, isAuthenticated: false } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => authState.value }));

import {
  PRIVACY_POLICY_VERSION,
  needsPrivacyAck,
  getAcknowledgedVersion,
  recordPrivacyAck,
} from "@/lib/privacyAcknowledgement";
import PrivacyUpdateNotice from "@/components/PrivacyUpdateNotice";

describe("privacyAcknowledgement gating", () => {
  beforeEach(() => {
    localStorage.clear();
    createAck.mockClear();
    authState.value = { address: null, isAuthenticated: false };
  });

  it("new visitor (not returning) is not prompted", () => {
    expect(needsPrivacyAck()).toBe(false);
  });

  it("returning visitor who hasn't acknowledged is prompted", () => {
    localStorage.setItem("cf_wallet_seen", "1");
    expect(needsPrivacyAck()).toBe(true);
  });

  it("returning visitor who already acknowledged the current version is not prompted", () => {
    localStorage.setItem("cf_wallet_seen", "1");
    localStorage.setItem("cf_privacy_ack", PRIVACY_POLICY_VERSION);
    expect(needsPrivacyAck()).toBe(false);
  });

  it("recordPrivacyAck writes a privacy_policy acceptance to the DB", async () => {
    await recordPrivacyAck({ walletAddress: "0xABC123" });
    expect(createAck).toHaveBeenCalledTimes(1);
    const row = createAck.mock.calls[0][0];
    expect(row.variant).toBe("privacy_policy");
    expect(row.terms_version).toBe(PRIVACY_POLICY_VERSION);
    expect(row.wallet_address).toBe("0xabc123"); // lower-cased
  });
});

describe("PrivacyUpdateNotice modal", () => {
  beforeEach(() => {
    localStorage.clear();
    createAck.mockClear();
    authState.value = { address: null, isAuthenticated: false };
  });

  it("does not render for a brand-new visitor", () => {
    render(<PrivacyUpdateNotice />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returning visitor: shows modal; Confirm disabled until checkbox; records + closes", async () => {
    localStorage.setItem("cf_wallet_seen", "1");
    authState.value = { address: "0xDeadBeef", isAuthenticated: true };
    render(<PrivacyUpdateNotice />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    expect(createAck).toHaveBeenCalledTimes(1);
    expect(createAck.mock.calls[0][0].wallet_address).toBe("0xdeadbeef");
    expect(getAcknowledgedVersion()).toBe(PRIVACY_POLICY_VERSION);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not re-show once acknowledged", () => {
    localStorage.setItem("cf_wallet_seen", "1");
    localStorage.setItem("cf_privacy_ack", PRIVACY_POLICY_VERSION);
    render(<PrivacyUpdateNotice />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
