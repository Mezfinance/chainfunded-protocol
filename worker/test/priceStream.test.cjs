/**
 * Price fanout tests — priceStream.js + the GET /prices/stream route.
 *
 * The broadcaster is what every trader reads instead of connecting to an
 * exchange, so the things worth pinning down are: quotes coalesce rather than
 * forwarding per tick, each subscriber only sees its own symbols, and a
 * disconnect actually releases the slot.
 */
const http = require("http");
const { EventEmitter } = require("events");
const { PriceBroadcaster } = require("../priceStream");

const FLUSH_MS = 250; // matches priceStream.js default

function collector() {
  const frames = [];
  return { frames, send: (payload) => frames.push(payload) };
}

describe("PriceBroadcaster", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("mirrors an attached feed's price events", () => {
    const feed = new EventEmitter();
    const b = new PriceBroadcaster().attach(feed);

    feed.emit("price", { symbol: "BTCUSDT", price: 60000, conf: 1, publishTimeMs: 123 });

    const snap = b.snapshot(null);
    expect(snap.BTCUSDT.price).toBe(60000);
    expect(snap.BTCUSDT.conf).toBe(1);
  });

  it("ignores quotes without a usable price", () => {
    const b = new PriceBroadcaster();
    b.note({ symbol: "BTCUSDT", price: 0 });
    b.note({ symbol: "BTCUSDT", price: -1 });
    b.note({ symbol: null, price: 10 });
    expect(Object.keys(b.snapshot(null))).toHaveLength(0);
  });

  it("coalesces a burst into a single flush carrying the latest price", () => {
    // Binance bookTicker can fire many times a second per symbol; forwarding
    // each one to every browser is the thing this design exists to avoid.
    const b = new PriceBroadcaster();
    const c = collector();
    b.addSubscriber({ send: c.send });

    for (let i = 1; i <= 50; i++) b.note({ symbol: "BTCUSDT", price: 60000 + i, conf: 1 });
    vi.advanceTimersByTime(FLUSH_MS);

    expect(c.frames).toHaveLength(1);
    expect(c.frames[0].quotes.BTCUSDT.price).toBe(60050);
  });

  it("sends nothing when no quote changed", () => {
    const b = new PriceBroadcaster();
    const c = collector();
    b.addSubscriber({ send: c.send });

    vi.advanceTimersByTime(FLUSH_MS * 4);
    expect(c.frames).toHaveLength(0);
  });

  it("filters each subscriber to its own symbols", () => {
    const b = new PriceBroadcaster();
    const crypto = collector();
    const fx = collector();
    const all = collector();

    b.addSubscriber({ symbols: new Set(["BTCUSDT"]), send: crypto.send });
    b.addSubscriber({ symbols: new Set(["EUR/USD"]), send: fx.send });
    b.addSubscriber({ symbols: null, send: all.send });

    b.note({ symbol: "BTCUSDT", price: 60000, conf: 1 });
    b.note({ symbol: "EUR/USD", price: 1.16, conf: 0.00001 });
    vi.advanceTimersByTime(FLUSH_MS);

    expect(Object.keys(crypto.frames[0].quotes)).toEqual(["BTCUSDT"]);
    expect(Object.keys(fx.frames[0].quotes)).toEqual(["EUR/USD"]);
    expect(Object.keys(all.frames[0].quotes).sort()).toEqual(["BTCUSDT", "EUR/USD"]);
  });

  it("snapshot honours the symbol filter", () => {
    const b = new PriceBroadcaster();
    b.note({ symbol: "BTCUSDT", price: 60000, conf: 1 });
    b.note({ symbol: "EUR/USD", price: 1.16, conf: 0.00001 });

    expect(Object.keys(b.snapshot(new Set(["EUR/USD"])))).toEqual(["EUR/USD"]);
    expect(Object.keys(b.snapshot(new Set(["NOPE"])))).toHaveLength(0);
  });

  it("releases the slot on unsubscribe and stops delivering", () => {
    const b = new PriceBroadcaster();
    const c = collector();
    const off = b.addSubscriber({ send: c.send });

    expect(b.subscriberCount).toBe(1);
    off();
    expect(b.subscriberCount).toBe(0);

    b.note({ symbol: "BTCUSDT", price: 60000, conf: 1 });
    vi.advanceTimersByTime(FLUSH_MS);
    expect(c.frames).toHaveLength(0);
  });

  it("emits a null heartbeat so idle connections aren't reaped", () => {
    const b = new PriceBroadcaster();
    const c = collector();
    b.addSubscriber({ send: c.send });

    vi.advanceTimersByTime(20_000);
    expect(c.frames.filter((f) => f === null).length).toBeGreaterThan(0);
  });

  it("keeps flushing to healthy subscribers when one throws", () => {
    const b = new PriceBroadcaster();
    const good = collector();
    b.addSubscriber({ send: () => { throw new Error("socket gone"); } });
    b.addSubscriber({ send: good.send });

    b.note({ symbol: "BTCUSDT", price: 60000, conf: 1 });
    expect(() => vi.advanceTimersByTime(FLUSH_MS)).not.toThrow();
    expect(good.frames).toHaveLength(1);
  });
});

describe("GET /prices/stream", () => {
  let server;
  let port;
  let broadcaster;

  beforeAll(async () => {
    broadcaster = new PriceBroadcaster();
    broadcaster.note({ symbol: "BTCUSDT", price: 60000, conf: 1, publishTimeMs: 1 });
    broadcaster.note({ symbol: "EUR/USD", price: 1.16, conf: 0.00001, publishTimeMs: 1 });

    process.env.WORKER_API_PORT = "0"; // ephemeral
    const { startServer } = require("../server");
    server = startServer({ supabase: null, base44: null, state: { prices: broadcaster } });
    await new Promise((r) => (server.listening ? r() : server.once("listening", r)));
    port = server.address().port;
  });

  afterAll(() => { server?.close(); broadcaster?.stop(); });

  /** Read SSE frames until `want` data frames have arrived (or timeout). */
  function readStream(path, want = 1, ms = 3000) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
        let buf = "";
        const frames = [];
        const done = () => { req.destroy(); resolve({ status: res.statusCode, headers: res.headers, frames }); };
        const timer = setTimeout(done, ms);
        res.on("data", (chunk) => {
          buf += chunk.toString();
          let i;
          while ((i = buf.indexOf("\n\n")) !== -1) {
            const raw = buf.slice(0, i).trim();
            buf = buf.slice(i + 2);
            if (raw.startsWith("data:")) frames.push(JSON.parse(raw.slice(5).trim()));
          }
          if (frames.length >= want) { clearTimeout(timer); done(); }
        });
        res.on("error", reject);
      });
      req.on("error", reject);
    });
  }

  it("opens an event-stream and leads with a snapshot", async () => {
    const { status, headers, frames } = await readStream("/prices/stream", 1);
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/event-stream");
    expect(frames[0].snapshot.BTCUSDT.price).toBe(60000);
    expect(frames[0].snapshot["EUR/USD"].price).toBe(1.16);
  });

  it("limits the snapshot to requested symbols", async () => {
    const { frames } = await readStream("/prices/stream?symbols=EUR/USD", 1);
    expect(Object.keys(frames[0].snapshot)).toEqual(["EUR/USD"]);
  });

  it("streams subsequent updates after the snapshot", async () => {
    const pending = readStream("/prices/stream?symbols=BTCUSDT", 2);
    setTimeout(() => broadcaster.note({ symbol: "BTCUSDT", price: 61000, conf: 1 }), 50);
    const { frames } = await pending;
    expect(frames[1].quotes.BTCUSDT.price).toBe(61000);
  });

  it("releases the subscriber slot when the client disconnects", async () => {
    await readStream("/prices/stream", 1);
    await new Promise((r) => setTimeout(r, 150));
    expect(broadcaster.subscriberCount).toBe(0);
  });

  it("404s an unknown GET path", async () => {
    const status = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/nope" }, (res) => { res.resume(); resolve(res.statusCode); })
        .on("error", reject);
    });
    expect(status).toBe(404);
  });
});
