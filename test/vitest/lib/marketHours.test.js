/**
 * Market hours — src/lib/marketHours.js.
 *
 * This module gates the order panel, so an hour of drift here means traders
 * are offered a market that is shut (or refused one that is open). The
 * boundaries used to be fixed UTC hours carrying comments like "openHour: 22,
 * // = 5:00 PM ET", which only holds while the US is on standard time; through
 * the summer every session ran an hour late. Each boundary is therefore
 * asserted twice, once in EDT and once in EST.
 *
 * It must also agree with worker/marketHours.cjs — the browser decides what to
 * offer, the worker decides what to fill, and the two disagreeing is a way to
 * show a trader a market we will then refuse.
 *
 * 2026-09-08 and 2026-12-08 are both Tuesdays; US DST ended 2026-11-01.
 */
import { describe, it, expect } from "vitest";
import { getMarketStatus, isMarketOpen, etNow } from "@/lib/marketHours";
import { ASSET_CLASS } from "@/lib/assetConfig";
import { isMarketOpen as workerIsMarketOpen } from "../../../worker/marketHours.cjs";

const summer = (hhmm) => new Date(`2026-09-08T${hhmm}:00Z`); // EDT, UTC-4
const winter = (hhmm) => new Date(`2026-12-08T${hhmm}:00Z`); // EST, UTC-5

describe("etNow", () => {
  it("reports New York wall clock, not UTC", () => {
    expect(etNow(summer("21:00"))).toEqual({ day: 2, minutes: 17 * 60 });
    expect(etNow(winter("21:00"))).toEqual({ day: 2, minutes: 16 * 60 });
  });
});

describe("isMarketOpen", () => {
  it("opens US stocks at 09:30 ET in both seasons", () => {
    expect(isMarketOpen(ASSET_CLASS.STOCKS, summer("13:29"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.STOCKS, summer("13:30"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.STOCKS, winter("14:29"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.STOCKS, winter("14:30"))).toBe(true);
  });

  it("closes US stocks at 16:00 ET in both seasons", () => {
    expect(isMarketOpen(ASSET_CLASS.STOCKS, summer("19:59"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.STOCKS, summer("20:00"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.STOCKS, winter("20:59"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.STOCKS, winter("21:00"))).toBe(false);
  });

  it("halts commodities 17:00–18:00 ET in both seasons", () => {
    expect(isMarketOpen(ASSET_CLASS.COMMODITIES, summer("20:59"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.COMMODITIES, summer("21:00"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.COMMODITIES, summer("22:00"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.COMMODITIES, winter("21:59"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.COMMODITIES, winter("22:00"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.COMMODITIES, winter("23:00"))).toBe(true);
  });

  it("runs forex Sunday 17:00 ET to Friday 17:00 ET", () => {
    expect(isMarketOpen(ASSET_CLASS.FX, new Date("2026-09-11T20:59:00Z"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.FX, new Date("2026-09-11T21:00:00Z"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.FX, new Date("2026-09-12T12:00:00Z"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.FX, new Date("2026-09-13T20:59:00Z"))).toBe(false);
    expect(isMarketOpen(ASSET_CLASS.FX, new Date("2026-09-13T21:00:00Z"))).toBe(true);
  });

  it("keeps forex open through the daily rollover", () => {
    // The broker stops quoting at 17:00 ET but the market has not closed, so
    // the order panel must not lock. Feed silence there is handled separately
    // by the worker's isQuoteExpected().
    expect(isMarketOpen(ASSET_CLASS.FX, summer("21:01"))).toBe(true);
    expect(isMarketOpen(ASSET_CLASS.FX, winter("22:01"))).toBe(true);
  });

  it("keeps crypto open always", () => {
    expect(isMarketOpen(ASSET_CLASS.CRYPTO, new Date("2026-09-12T12:00:00Z"))).toBe(true);
  });
});

describe("getMarketStatus", () => {
  it("reports crypto as 24/7 with no pending change", () => {
    expect(getMarketStatus(ASSET_CLASS.CRYPTO, summer("21:00"))).toEqual({
      isOpen: true, label: "24/7", nextChange: null, nextChangeLabel: "",
    });
  });

  it("counts down to the 16:00 ET bell", () => {
    const s = getMarketStatus(ASSET_CLASS.STOCKS, summer("19:30")); // 15:30 EDT
    expect(s.isOpen).toBe(true);
    expect(s.nextChangeLabel).toBe("Closes");
    expect(s.nextChange.toISOString()).toBe("2026-09-08T20:00:00.000Z");
  });

  it("counts forward to the 09:30 ET open from pre-market", () => {
    const s = getMarketStatus(ASSET_CLASS.STOCKS, summer("12:00")); // 08:00 EDT
    expect(s.isOpen).toBe(false);
    expect(s.label).toBe("Pre-Market");
    expect(s.nextChange.toISOString()).toBe("2026-09-08T13:30:00.000Z");
  });

  it("labels the hours after the bell as after hours, not weekend", () => {
    const s = getMarketStatus(ASSET_CLASS.STOCKS, summer("20:30")); // 16:30 EDT
    expect(s.isOpen).toBe(false);
    expect(s.label).toBe("After Hours");
    // Next open is the following morning's bell.
    expect(s.nextChange.toISOString()).toBe("2026-09-09T13:30:00.000Z");
  });

  it("labels the commodities maintenance window as a daily break", () => {
    const s = getMarketStatus(ASSET_CLASS.COMMODITIES, summer("21:30")); // 17:30 EDT
    expect(s.isOpen).toBe(false);
    expect(s.label).toBe("Daily Break");
    expect(s.nextChange.toISOString()).toBe("2026-09-08T22:00:00.000Z");
  });

  it("labels the weekend and points at the Sunday reopen", () => {
    const s = getMarketStatus(ASSET_CLASS.FX, new Date("2026-09-12T12:00:00Z"));
    expect(s.isOpen).toBe(false);
    expect(s.label).toBe("Closed (Weekend)");
    expect(s.nextChange.toISOString()).toBe("2026-09-13T21:00:00.000Z");
  });

  it("finds a next change across the DST boundary", () => {
    // Fri 2026-10-30 17:00 EDT close → Sun 2026-11-01 17:00 EST reopen, with
    // the clocks going back in between. Scanning forward rather than doing
    // arithmetic on a UTC constant is what makes this come out right.
    const s = getMarketStatus(ASSET_CLASS.FX, new Date("2026-10-31T12:00:00Z"));
    expect(s.isOpen).toBe(false);
    expect(s.nextChange.toISOString()).toBe("2026-11-01T22:00:00.000Z");
  });
});

describe("browser and worker agreement", () => {
  const classes = [ASSET_CLASS.FX, ASSET_CLASS.COMMODITIES, ASSET_CLASS.STOCKS];

  it("agree on every quarter hour of a full week in both seasons", () => {
    for (const start of ["2026-09-06T00:00:00Z", "2026-12-06T00:00:00Z"]) {
      const base = new Date(start).getTime();
      for (let m = 0; m < 7 * 24 * 60; m += 15) {
        const at = new Date(base + m * 60000);
        for (const klass of classes) {
          expect(
            isMarketOpen(klass, at),
            `${klass} disagrees at ${at.toISOString()}`,
          ).toBe(workerIsMarketOpen(klass, at));
        }
      }
    }
  });
});
