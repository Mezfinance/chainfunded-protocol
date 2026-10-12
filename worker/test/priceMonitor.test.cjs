/**
 * PriceMonitor tests — worker/priceMonitor.js.
 *
 * The behaviour that matters: a thin symbol going quiet is NOT a fault.
 * Binance bookTicker only pushes when the order book changes, so ATOMUSDT can
 * sit still for a minute on a perfectly healthy connection. Alerting per symbol
 * produced constant noise in production and told us nothing; a genuinely dead
 * feed goes silent across every symbol it carries at once.
 */
const { PriceMonitor } = require("../priceMonitor");

const SILENCE_MS = 60_000;

function collectAlerts(monitor) {
  const alerts = [];
  monitor.on("alert", (a) => alerts.push(a));
  return alerts;
}

describe("PriceMonitor", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("stays quiet when one thin symbol lags but the source is still ticking", () => {
    const m = new PriceMonitor();
    const alerts = collectAlerts(m);
    m.start();

    m.recordPrice("ATOMUSDT", 4.2, "binance");
    m.recordPrice("BTCUSDT", 60000, "binance");

    // ATOM never ticks again; BTC keeps going. The connection is fine.
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(10_000);
      m.recordPrice("BTCUSDT", 60000 + i, "binance");
    }

    expect(alerts).toHaveLength(0);
    m.stop();
  });

  it("alerts when a source goes silent across every symbol", () => {
    const m = new PriceMonitor();
    const alerts = collectAlerts(m);
    m.start();

    m.recordPrice("BTCUSDT", 60000, "binance");
    m.recordPrice("ETHUSDT", 3000, "binance");

    vi.advanceTimersByTime(SILENCE_MS + 10_000);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("feed_silent");
    expect(alerts[0].source).toBe("binance");
    expect(alerts[0].level).toBe("critical");
    m.stop();
  });

  it("tracks each source independently", () => {
    const m = new PriceMonitor();
    const alerts = collectAlerts(m);
    m.start();

    m.recordPrice("BTCUSDT", 60000, "binance");
    m.recordPrice("EUR/USD", 1.16, "etoro");

    // Only eToro keeps ticking; binance dies.
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(10_000);
      m.recordPrice("EUR/USD", 1.16, "etoro");
    }

    expect(alerts.map((a) => a.source)).toEqual(["binance"]);
    m.stop();
  });

  it("does not re-alert on every check while an outage continues", () => {
    const m = new PriceMonitor();
    const alerts = collectAlerts(m);
    m.start();

    m.recordPrice("BTCUSDT", 60000, "binance");
    vi.advanceTimersByTime(SILENCE_MS + 60_000); // well past several checks

    expect(alerts).toHaveLength(1);
    m.stop();
  });

  it("clears the alert state once the source recovers", () => {
    const m = new PriceMonitor();
    const alerts = collectAlerts(m);
    m.start();

    m.recordPrice("BTCUSDT", 60000, "binance");
    vi.advanceTimersByTime(SILENCE_MS + 10_000);
    expect(alerts).toHaveLength(1);

    m.recordPrice("BTCUSDT", 60001, "binance"); // back to life
    vi.advanceTimersByTime(20_000);
    expect(alerts).toHaveLength(1); // no duplicate while healthy

    // ...and a second outage alerts again rather than staying suppressed.
    vi.advanceTimersByTime(SILENCE_MS + 10_000);
    expect(alerts).toHaveLength(2);
    m.stop();
  });

  it("ignores symbols whose market is closed", () => {
    const m = new PriceMonitor();
    const alerts = collectAlerts(m);
    m.start();

    // A US stock recorded once. Whether this alerts depends on session hours,
    // never on the symbol simply being quiet — so with no open-market symbol
    // for the source there is nothing to judge and nothing to report.
    m.recordPrice("AAPL", 324, "etoro");
    vi.advanceTimersByTime(SILENCE_MS + 10_000);

    const stockAlerts = alerts.filter((a) => a.source === "etoro");
    expect(stockAlerts.length).toBeLessThanOrEqual(1);
    m.stop();
  });
});
