/**
 * SupportChat tests — bubble, open, collapse states.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@testing-library/react";

// Mock fetch for chat API
globalThis.fetch = vi.fn(async () => ({
  json: async () => ({ reply: "I can help with that!" }),
  ok: true,
}));

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

const { default: SupportChat } = await import("@/components/SupportChat");

describe("SupportChat", () => {
  it("renders bubble by default", () => {
    render(<SupportChat />);
    const bubble = screen.getByLabelText("Open support chat");
    expect(bubble).toBeInTheDocument();
  });

  it("opens chat when bubble clicked", () => {
    render(<SupportChat />);
    fireEvent.click(screen.getByLabelText("Open support chat"));
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a question...")).toBeInTheDocument();
  });

  it("shows initial greeting message", () => {
    render(<SupportChat />);
    fireEvent.click(screen.getByLabelText("Open support chat"));
    expect(screen.getByText(/how can I help/i)).toBeInTheDocument();
  });

  it("closes chat with X button", () => {
    render(<SupportChat />);
    fireEvent.click(screen.getByLabelText("Open support chat"));
    // Find the X close button
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find(b => b.querySelector(".lucide-x"));
    if (xButton) fireEvent.click(xButton);
    // Should show bubble again
    expect(screen.getByLabelText("Open support chat")).toBeInTheDocument();
  });

  it("collapses to edge tab", () => {
    render(<SupportChat />);
    // Find the collapse arrow button (next to the bubble)
    const collapseBtn = screen.getByLabelText("Hide support chat");
    fireEvent.click(collapseBtn);
    // Should show the edge tab
    expect(screen.getByLabelText("Show support chat")).toBeInTheDocument();
  });

  it("restores from collapsed state", () => {
    render(<SupportChat />);
    // Collapse
    fireEvent.click(screen.getByLabelText("Hide support chat"));
    // Restore
    fireEvent.click(screen.getByLabelText("Show support chat"));
    // Should show bubble again
    expect(screen.getByLabelText("Open support chat")).toBeInTheDocument();
  });

  it("shows Discord escalation link when chat open", () => {
    render(<SupportChat />);
    fireEvent.click(screen.getByLabelText("Open support chat"));
    expect(screen.getByText(/need a human/i)).toBeInTheDocument();
  });

  it("has input field with max length", () => {
    render(<SupportChat />);
    fireEvent.click(screen.getByLabelText("Open support chat"));
    const input = screen.getByPlaceholderText("Ask a question...");
    expect(input.getAttribute("maxlength")).toBe("500");
  });
});
