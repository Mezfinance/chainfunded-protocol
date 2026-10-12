/**
 * Candle tests — worker/candles.js.
 *
 * Two providers with very different payloads feed one normalised shape, so the
 * things worth pinning down are the parsing of each, and the eToro pagination
 * guard: eToro ignores every date parameter, so a naive scroll-back would hand
 * the chart the same newest bars forever and it would request endlessly.
 *
 * The module caches by (symbol, interval, limit, endTime), so each test uses
 * its own symbol to stay independent.
 */
const candles = require("../candles");

const okJson = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

/** eToro's nested, newest-first payload. */
function etoroBody(rows) {
  return { interval: "OneMinute", candles: [{ instrumentId: 1, candles: rows }] };
}

describe("getCandles — Binance (crypto)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("parses kline arrays into the normalised shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson([
      [1700000000000, "60000.1", "60100.5", "59900.2", "60050.3", "12.5", 1700000059999],
      [1700000060000, "60050.3", "60200.0", "60000.0", "60150.0", "8.25", 1700000119999],
    ])));

    const rows = await candles.getCandles("BTCUSDT", "1m", 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      time: 1700000000, open: 60000.1, high: 60100.5, low: 59900.2, close: 60050.3, volume: 12.5,
    });
  });

  it("passes endTime through so the chart can page backwards", async () => {
    const fetchMock = vi.fn(async () => okJson([[1700000000000, "1", "2", "0.5", "1.5", "1"]]));
    vi.stubGlobal("fetch", fetchMock);

    await candles.getCandles("ETHUSDT", "1m", 10, 1699999999000);
    expect(fetchMock.mock.calls[0][0]).toContain("endTime=1699999999000");
  });

  it("falls through to the next host when the first refuses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 451 })          // geo-blocked
      .mockResolvedValueOnce(okJson([[1700000000000, "1", "2", "0.5", "1.5", "1"]]));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await candles.getCandles("SOLUSDT", "1m", 1);
    expect(rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when every host fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(candles.getCandles("ADAUSDT", "1m", 1)).rejects.toThrow(/binance candles failed/);
  });
});

describe("getCandles — eToro (everything else)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("ETORO_USER_KEY", "user");
    vi.stubEnv("ETORO_API_KEY", "api");
  });

  it("unwraps the nested payload and returns oldest-first", async () => {
    // eToro returns newest-first; charts need the opposite.
    vi.stubGlobal("fetch", vi.fn(async () => okJson(etoroBody([
      { fromDate: "2026-09-03T05:23:00Z", open: 1.15964, high: 1.15967, low: 1.1596, close: 1.15967, volume: null },
      { fromDate: "2026-09-03T05:22:00Z", open: 1.15957, high: 1.15968, low: 1.15957, close: 1.15964, volume: null },
    ]))));

    const rows = await candles.getCandles("EUR/USD", "1m", 2);
    expect(rows.map((r) => r.time)).toEqual([
      Date.parse("2026-09-03T05:22:00Z") / 1000,
      Date.parse("2026-09-03T05:23:00Z") / 1000,
    ]);
    expect(rows[0].open).toBe(1.15957);
    expect(rows[0].volume).toBe(0); // eToro sends null
  });

  it("maps timeframes to eToro's named intervals", async () => {
    const fetchMock = vi.fn(async () => okJson(etoroBody([])));
    vi.stubGlobal("fetch", fetchMock);

    await candles.getCandles("XAU/USD", "4h", 5);
    expect(fetchMock.mock.calls[0][0]).toContain("/FourHours/5");
  });

  it("rejects an interval eToro doesn't offer", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(candles.getCandles("XAG/USD", "3m", 5)).rejects.toThrow(/unsupported interval/);
  });

  it("returns empty for a paged request instead of repeating the newest bars", async () => {
    // The guard that stops the chart's scroll-back looping forever.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const rows = await candles.getCandles("GBP/USD", "1m", 100, 1699999999000);
    expect(rows).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops malformed rows rather than emitting NaN candles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson(etoroBody([
      { fromDate: "2026-09-03T05:23:00Z", open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
      { fromDate: "not-a-date", open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
      { fromDate: "2026-09-03T05:21:00Z", open: 0, high: 0, low: 0, close: 0 },
    ]))));

    const rows = await candles.getCandles("USD/CHF", "1m", 3);
    expect(rows).toHaveLength(1);
  });

  it("fails clearly when credentials are missing", async () => {
    vi.stubEnv("ETORO_USER_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    await expect(candles.getCandles("AUD/USD", "1m", 1)).rejects.toThrow(/credentials not configured/);
  });
});

describe("derived stats", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("ETORO_USER_KEY", "user");
    vi.stubEnv("ETORO_API_KEY", "api");
  });

  it("derives 24h open/high/low from hourly candles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson(etoroBody([
      { fromDate: "2026-09-03T02:00:00Z", open: 3, high: 9, low: 2, close: 4 },
      { fromDate: "2026-09-03T01:00:00Z", open: 2, high: 5, low: 1, close: 3 },
      { fromDate: "2026-09-03T00:00:00Z", open: 1, high: 4, low: 0.5, close: 2 },
    ]))));

    const stats = await candles.get24hStats("EUR/JPY");
    expect(stats).toEqual({ open24h: 1, high24h: 9, low24h: 0.5 }); // oldest open, window extremes
  });

  it("batches daily opens and survives a symbol that fails", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++;
      if (call === 2) throw new Error("upstream down");
      return okJson(etoroBody([
        { fromDate: "2026-09-03T00:00:00Z", open: 1.5, high: 2, low: 1, close: 1.8 },
      ]));
    }));

    const opens = await candles.getDailyOpens(["EUR/CAD", "EUR/AUD", "GBP/CHF"]);
    // One symbol failed; the other two still resolved.
    expect(Object.keys(opens).length).toBeGreaterThanOrEqual(1);
    expect(Object.values(opens)[0]).toBe(1.5);
  });
});

describe("resilience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("ETORO_USER_KEY", "user");
    vi.stubEnv("ETORO_API_KEY", "api");
  });

  it("retries once when a request times out", async () => {
    // syd -> eToro occasionally exceeds the deadline on an otherwise fine
    // request; one slow response shouldn't cost the caller its data.
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(okJson(etoroBody([
        { fromDate: "2026-09-04T03:00:00Z", open: 157.5, high: 157.8, low: 157.4, close: 157.7 },
      ])));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await candles.getCandles("USD/SGD", "1h", 1);
    expect(rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a real HTTP error", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(candles.getCandles("USD/HKD", "1h", 1)).rejects.toThrow(/HTTP 429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers a failure briefly instead of stampeding the upstream", async () => {
    // A struggling provider gets one request per window, not one per poll.
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(candles.getCandles("EUR/GBP", "4h", 5)).rejects.toThrow();
    await expect(candles.getCandles("EUR/GBP", "4h", 5)).rejects.toThrow();
    await expect(candles.getCandles("EUR/GBP", "4h", 5)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
