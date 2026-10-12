/**
 * useWorkerPriceFeed tests — the browser side of the worker price stream.
 *
 * jsdom has no EventSource, so one is stubbed here. That's also what lets the
 * tests drive frames deterministically: the things worth pinning down are that
 * a snapshot paints immediately, that session high/low accumulate across ticks,
 * and that a dropped connection retries instead of going silent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.stubEnv("VITE_WORKER_URL", "http://worker.test");

/** Minimal EventSource stand-in; every instance is recorded for assertions. */
class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    FakeEventSource.instances.push(this);
  }
  close() { this.closed = true; }

  // — helpers the tests drive —
  open() { this.readyState = 1; this.onopen?.(); }
  emit(payload) { this.onmessage?.({ data: JSON.stringify(payload) }); }
  fail() { this.onerror?.(new Event("error")); }
}

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

const { default: useWorkerPriceFeed } = await import("@/hooks/useWorkerPriceFeed");

describe("useWorkerPriceFeed", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("subscribes to the worker with the requested symbols", () => {
    renderHook(() => useWorkerPriceFeed(["BTCUSDT", "EUR/USD"]));
    expect(latest().url).toBe(
      "http://worker.test/prices/stream?symbols=BTCUSDT%2CEUR%2FUSD"
    );
  });

  it("opens no connection when no symbols are registered", () => {
    renderHook(() => useWorkerPriceFeed([]));
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("paints from the snapshot frame", async () => {
    const { result } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));

    act(() => {
      latest().open();
      latest().emit({ snapshot: { BTCUSDT: { price: 60000, conf: 1 } } });
    });

    await waitFor(() => expect(result.current.tickers.BTCUSDT?.price).toBe(60000));
    expect(result.current.connected).toBe(true);
  });

  it("applies incremental quote frames", async () => {
    const { result } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));

    act(() => {
      latest().open();
      latest().emit({ snapshot: { BTCUSDT: { price: 60000 } } });
      latest().emit({ quotes: { BTCUSDT: { price: 61000 } } });
    });

    await waitFor(() => expect(result.current.tickers.BTCUSDT.price).toBe(61000));
  });

  it("accumulates session high and low across ticks", async () => {
    const { result } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));

    act(() => {
      latest().open();
      latest().emit({ snapshot: { BTCUSDT: { price: 60000 } } });
      latest().emit({ quotes: { BTCUSDT: { price: 62000 } } });
      latest().emit({ quotes: { BTCUSDT: { price: 59000 } } });
    });

    await waitFor(() => expect(result.current.tickers.BTCUSDT.price).toBe(59000));
    expect(result.current.tickers.BTCUSDT.high24h).toBe(62000);
    expect(result.current.tickers.BTCUSDT.low24h).toBe(59000);
  });

  it("ignores non-positive and malformed prices", async () => {
    const { result } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));

    act(() => {
      latest().open();
      latest().emit({ quotes: { BTCUSDT: { price: 0 } } });
      latest().emit({ quotes: { BTCUSDT: { price: -5 } } });
      latest().emit({ quotes: { BTCUSDT: { price: "nonsense" } } });
      latest().onmessage?.({ data: "not json" });
    });

    expect(result.current.tickers.BTCUSDT).toBeUndefined();
  });

  it("marks disconnected and retries after an error", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));

    act(() => { latest().open(); });
    expect(result.current.connected).toBe(true);

    act(() => { latest().fail(); });
    expect(result.current.connected).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(1);

    // Backoff is jittered between 0.5x and 1x of the 1s base.
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(FakeEventSource.instances.length).toBeGreaterThan(1);
  });

  it("does not treat a capacity refusal as data", async () => {
    const { result } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));

    act(() => {
      latest().open();
      latest().emit({ error: "capacity" });
    });

    expect(Object.keys(result.current.tickers)).toHaveLength(0);
  });

  it("closes the connection on unmount", () => {
    const { unmount } = renderHook(() => useWorkerPriceFeed(["BTCUSDT"]));
    const es = latest();
    unmount();
    expect(es.closed).toBe(true);
  });
});
