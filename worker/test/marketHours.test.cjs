/**
 * Market hours tests — worker/marketHours.cjs.
 *
 * These boundaries used to be hardcoded UTC hours carrying comments like
 * "openHour: 22, // = 5:00 PM ET", which holds only while the US is on
 * standard time. Through the summer every session boundary sat an hour late.
 * The cases below therefore assert the same Eastern wall-clock boundary twice,
 * once in EDT and once in EST, so a reintroduced UTC constant fails loudly.
 *
 * 2026-09-08 and 2026-12-08 are both Tuesdays; US DST ended 2026-11-01.
 */
const {
  ASSET_CLASS,
  isMarketOpen,
  isQuoteExpected,
  etNow,
} = require("../marketHours.cjs");

const summer = (hhmm) => new Date(`2026-09-08T${hhmm}:00Z`); // EDT, UTC-4
const winter = (hhmm) => new Date(`2026-12-08T${hhmm}:00Z`); // EST, UTC-5

describe("etNow", () => {
  it("reports New York wall clock, not UTC", () => {
    expect(etNow(summer("21:00"))).toEqual({ day: 2, minutes: 17 * 60 });
    expect(etNow(winter("21:00"))).toEqual({ day: 2, minutes: 16 * 60 });
  });

  it("handles midnight without rolling the hour to 24", () => {
    expect(etNow(new Date("2026-09-08T04:00:00Z")).minutes).toBe(0);
  });
});

describe("US stock session", () => {
  const open = (d) => isMarketOpen(ASSET_CLASS.STOCKS, d);

  it("opens at 09:30 ET in both seasons", () => {
    expect(open(summer("13:29"))).toBe(false);
    expect(open(summer("13:30"))).toBe(true);  // 09:30 EDT
    expect(open(winter("14:29"))).toBe(false);
    expect(open(winter("14:30"))).toBe(true);  // 09:30 EST
  });

  it("closes at 16:00 ET in both seasons", () => {
    expect(open(summer("19:59"))).toBe(true);
    expect(open(summer("20:00"))).toBe(false); // 16:00 EDT
    expect(open(winter("20:59"))).toBe(true);
    expect(open(winter("21:00"))).toBe(false); // 16:00 EST
  });

  it("stays shut at the weekend", () => {
    expect(open(new Date("2026-09-12T15:00:00Z"))).toBe(false); // Saturday
    expect(open(new Date("2026-09-13T15:00:00Z"))).toBe(false); // Sunday
  });
});

describe("commodities session", () => {
  const open = (d) => isMarketOpen(ASSET_CLASS.COMMODITIES, d);

  it("halts 17:00–18:00 ET in both seasons", () => {
    expect(open(summer("20:59"))).toBe(true);
    expect(open(summer("21:00"))).toBe(false); // 17:00 EDT
    expect(open(summer("21:59"))).toBe(false);
    expect(open(summer("22:00"))).toBe(true);  // 18:00 EDT

    expect(open(winter("21:59"))).toBe(true);
    expect(open(winter("22:00"))).toBe(false); // 17:00 EST
    expect(open(winter("23:00"))).toBe(true);  // 18:00 EST
  });

  it("closes for the week at Friday 17:00 ET and reopens Sunday 18:00 ET", () => {
    expect(open(new Date("2026-09-11T20:59:00Z"))).toBe(true);  // Fri 16:59 EDT
    expect(open(new Date("2026-09-11T21:00:00Z"))).toBe(false); // Fri 17:00 EDT
    expect(open(new Date("2026-09-12T12:00:00Z"))).toBe(false); // Saturday
    expect(open(new Date("2026-09-13T21:59:00Z"))).toBe(false); // Sun 17:59 EDT
    expect(open(new Date("2026-09-13T22:00:00Z"))).toBe(true);  // Sun 18:00 EDT
  });
});

describe("forex session", () => {
  const open = (d) => isMarketOpen(ASSET_CLASS.FX, d);

  it("runs Sunday 17:00 ET to Friday 17:00 ET", () => {
    expect(open(new Date("2026-09-11T20:59:00Z"))).toBe(true);  // Fri 16:59 EDT
    expect(open(new Date("2026-09-11T21:00:00Z"))).toBe(false); // Fri 17:00 EDT
    expect(open(new Date("2026-09-12T12:00:00Z"))).toBe(false); // Saturday
    expect(open(new Date("2026-09-13T20:59:00Z"))).toBe(false); // Sun 16:59 EDT
    expect(open(new Date("2026-09-13T21:00:00Z"))).toBe(true);  // Sun 17:00 EDT
  });

  it("stays open through the daily rollover — positions are not closed", () => {
    // The distinction this whole split exists for: at 17:00 ET the broker
    // stops quoting for a few minutes, but the market has not closed. If
    // isMarketOpen() went false here, enforceMarketClose() would flatten every
    // open FX position once a day.
    expect(open(summer("21:01"))).toBe(true);
    expect(open(winter("22:01"))).toBe(true);
  });
});

describe("isQuoteExpected", () => {
  const expected = (klass, d) => isQuoteExpected(klass, d);

  it("suppresses the 17:00 ET forex rollover Mon–Thu", () => {
    expect(expected(ASSET_CLASS.FX, summer("20:59"))).toBe(true);  // 16:59 EDT
    expect(expected(ASSET_CLASS.FX, summer("21:00"))).toBe(false); // 17:00 EDT
    expect(expected(ASSET_CLASS.FX, summer("21:14"))).toBe(false);
    expect(expected(ASSET_CLASS.FX, summer("21:15"))).toBe(true);  // gap over
  });

  it("tracks the rollover across the DST boundary", () => {
    expect(expected(ASSET_CLASS.FX, winter("21:01"))).toBe(true);  // 16:01 EST
    expect(expected(ASSET_CLASS.FX, winter("22:01"))).toBe(false); // 17:01 EST
  });

  it("does not apply the rollover gap at the Sunday weekly open", () => {
    // Sunday 17:00 ET is the start of the week, not a rollover. A feed that
    // fails to come alive there is a real outage worth paging for.
    expect(expected(ASSET_CLASS.FX, new Date("2026-09-13T21:01:00Z"))).toBe(true);
  });

  it("never reports a quote expected on a closed market", () => {
    expect(expected(ASSET_CLASS.FX, new Date("2026-09-12T12:00:00Z"))).toBe(false);
    expect(expected(ASSET_CLASS.STOCKS, summer("21:01"))).toBe(false);
    expect(expected(ASSET_CLASS.COMMODITIES, summer("21:01"))).toBe(false);
  });

  it("always expects crypto quotes", () => {
    expect(expected(ASSET_CLASS.CRYPTO, new Date("2026-09-12T12:00:00Z"))).toBe(true);
    expect(expected(ASSET_CLASS.CRYPTO, summer("21:01"))).toBe(true);
  });

  /**
   * Regression for the production false alarm: every weekday at 21:01 UTC
   * through September the eToro source paged as "down". Stocks had just closed
   * at 16:00 EDT, commodities were in the 17:00 EDT halt, and FX was in its
   * rollover — so the source carried no quote-expecting symbol at all, and the
   * monitor was reading an empty set as a dead feed.
   */
  it("expects nothing from any eToro class during the 17:00 ET crossover", () => {
    for (const hhmm of ["21:01", "21:02", "21:03", "21:04", "21:10"]) {
      const at = summer(hhmm);
      const any = [ASSET_CLASS.FX, ASSET_CLASS.COMMODITIES, ASSET_CLASS.STOCKS]
        .some((k) => isQuoteExpected(k, at));
      expect(any, `expected silence at ${hhmm} UTC`).toBe(false);
    }
  });

  it("still pages when forex stays silent well past the rollover", () => {
    // 2026-09-28 21:26 UTC = Mon 17:26 EDT — 26 minutes of no FX quotes is a
    // genuine fault, and was present in the production logs.
    expect(expected(ASSET_CLASS.FX, new Date("2026-09-28T21:26:00Z"))).toBe(true);
  });
});
