/**
 * Consent flow — geo-gated X pixel/CAPI marketing consent.
 *
 * End-to-end of the consent layer: EU opt-in gate, non-EU default-on, decline,
 * fail-safe when geo is unknown, persistence of a prior choice, and the
 * "Manage cookies" re-open path. The pixel layer is mocked so we assert the
 * enable/disable decisions without actually loading uwt.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Hoisted so the vi.mock factory can reference them safely.
const { enableXTracking, disableXTracking } = vi.hoisted(() => ({
  enableXTracking: vi.fn(),
  disableXTracking: vi.fn(),
}));
vi.mock("@/lib/xpixel", () => ({
  enableXTracking,
  disableXTracking,
  isXTrackingEnabled: () => false,
}));

import { ConsentProvider } from "@/lib/consent";
import ConsentBanner from "@/components/ConsentBanner";
import ManageCookiesLink from "@/components/ManageCookiesLink";

function mockGeo(consentRequired, { reject = false } = {}) {
  globalThis.fetch = vi.fn(async () => {
    if (reject) throw new Error("network down");
    return { json: async () => ({ country: consentRequired ? "DE" : "US", consentRequired }) };
  });
}

function renderConsent() {
  return render(
    <ConsentProvider>
      <ConsentBanner />
      <ManageCookiesLink className="manage" />
    </ConsentProvider>
  );
}

describe("consent flow", () => {
  beforeEach(() => {
    localStorage.clear();
    enableXTracking.mockClear();
    disableXTracking.mockClear();
  });

  it("EU visitor: shows the banner and fires nothing until Accept", async () => {
    mockGeo(true);
    renderConsent();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(enableXTracking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    expect(enableXTracking).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("cf_marketing_consent")).toBe("granted");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("EU visitor: Decline keeps tracking off and records the choice", async () => {
    mockGeo(true);
    renderConsent();

    fireEvent.click(await screen.findByRole("button", { name: /decline/i }));

    expect(enableXTracking).not.toHaveBeenCalled();
    expect(disableXTracking).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("cf_marketing_consent")).toBe("denied");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("non-EU visitor: enables by default with no banner", async () => {
    mockGeo(false);
    renderConsent();

    await waitFor(() => expect(enableXTracking).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("cf_marketing_consent")).toBe("granted");
  });

  it("geo lookup failure: fails safe to the banner, no tracking", async () => {
    mockGeo(true, { reject: true });
    renderConsent();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(enableXTracking).not.toHaveBeenCalled();
  });

  it("prior consent persists: enables immediately, no banner, no geo call", async () => {
    localStorage.setItem("cf_marketing_consent", "granted");
    globalThis.fetch = vi.fn();
    renderConsent();

    await waitFor(() => expect(enableXTracking).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("Manage cookies re-opens the banner so a choice can be changed", async () => {
    mockGeo(false); // non-EU → no banner initially
    renderConsent();
    await waitFor(() => expect(enableXTracking).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /manage cookies/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
