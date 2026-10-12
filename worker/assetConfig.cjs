/**
 * worker/assetConfig.cjs
 *
 * CommonJS copy of the asset symbol/feed tables needed by the worker.
 * Kept in sync with src/lib/assetConfig.js — only includes the fields
 * the worker actually needs: symbol, and for non-crypto the eToro
 * instrument id its feed subscribes to.
 *
 * Crypto carries no id: Binance streams are keyed by the symbol itself.
 *
 * eToro ids were resolved by enumerating instruments per asset class
 * (internalAssetClassId 1 Forex, 2 Commodity, 5 Stocks). Do NOT resolve them
 * by symbol lookup — exact internalSymbolFull search returns nothing for GOLD,
 * SILVER, OIL and V even though all four exist and quote live.
 */

"use strict";

const CRYPTO_ASSETS = [
  { symbol: "BTCUSDT"  },
  { symbol: "ETHUSDT"  },
  { symbol: "SOLUSDT"  },
  { symbol: "BNBUSDT"  },
  { symbol: "XRPUSDT"  },
  { symbol: "DOGEUSDT" },
  { symbol: "ADAUSDT"  },
  { symbol: "AVAXUSDT" },
  { symbol: "DOTUSDT"  },
  { symbol: "LINKUSDT" },
  { symbol: "SHIBUSDT" },
  { symbol: "UNIUSDT"  },
  { symbol: "LTCUSDT"  },
  { symbol: "NEARUSDT" },
  { symbol: "APTUSDT"  },
  { symbol: "ARBUSDT"  },
  { symbol: "OPUSDT"   },
  { symbol: "ATOMUSDT" },
  { symbol: "FILUSDT"  },
  { symbol: "SUIUSDT"  },
];

const FX_ASSETS = [
  { symbol: "EUR/USD", etoroId: 1  },
  { symbol: "USD/JPY", etoroId: 5  },
  { symbol: "GBP/USD", etoroId: 2  },
  { symbol: "USD/CHF", etoroId: 6  },
  { symbol: "AUD/USD", etoroId: 7  },
  { symbol: "USD/CAD", etoroId: 4  },
  { symbol: "NZD/USD", etoroId: 3  },
  { symbol: "EUR/GBP", etoroId: 8  },
  { symbol: "EUR/JPY", etoroId: 10 },
  { symbol: "GBP/JPY", etoroId: 11 },
  { symbol: "EUR/CHF", etoroId: 9  },
  { symbol: "AUD/JPY", etoroId: 14 },
  { symbol: "EUR/AUD", etoroId: 12 },
  { symbol: "GBP/CHF", etoroId: 51 },
  { symbol: "USD/SGD", etoroId: 64 },
  { symbol: "EUR/CAD", etoroId: 13 },
  { symbol: "AUD/NZD", etoroId: 48 },
  { symbol: "GBP/AUD", etoroId: 50 },
  { symbol: "USD/HKD", etoroId: 39 },
  { symbol: "USD/MXN", etoroId: 63 },
];

const COMMODITY_ASSETS = [
  { symbol: "XAU/USD", etoroId: 18  }, // GOLD (Non Expiry)
  { symbol: "XAG/USD", etoroId: 19  }, // SILVER (Non Expiry)
  { symbol: "XPT/USD", etoroId: 40  }, // PLATINUM (Non Expiry)
  { symbol: "WTI/USD", etoroId: 17  }, // OIL (Non Expiry)
  { symbol: "BRN/USD", etoroId: 341 }, // EuroOIL — Brent (Non Expiry)

  // No palladium: eToro publishes 10 non-expiry spot commodities and XPD is
  // not among them, so XPD/USD was retired with the Pyth migration.
  // Also available if the book ever widens: NATGAS 22, Aluminum 344,
  // Nickel 343, Zinc 340, Lead 339.
];

const STOCK_ASSETS = [
  { symbol: "AAPL",  etoroId: 1001 },
  { symbol: "MSFT",  etoroId: 1004 },
  { symbol: "NVDA",  etoroId: 1137 },
  { symbol: "AMZN",  etoroId: 1005 },
  { symbol: "GOOGL", etoroId: 6434 },
  { symbol: "META",  etoroId: 1003 },
  { symbol: "TSLA",  etoroId: 1111 },
  { symbol: "AVGO",  etoroId: 4236 },
  { symbol: "JPM",   etoroId: 1023 },
  { symbol: "V",     etoroId: 1046 },
  { symbol: "MA",    etoroId: 1041 },
  { symbol: "BAC",   etoroId: 1011 },
  { symbol: "UNH",   etoroId: 1032 },
  { symbol: "JNJ",   etoroId: 1022 },
  { symbol: "WMT",   etoroId: 1035 },
  { symbol: "PG",    etoroId: 1029 },
  { symbol: "HD",    etoroId: 1018 },
  { symbol: "COST",  etoroId: 1461 },
  { symbol: "XOM",   etoroId: 1036 },
  { symbol: "MSTR",  etoroId: 6473 },
];

module.exports = { CRYPTO_ASSETS, FX_ASSETS, COMMODITY_ASSETS, STOCK_ASSETS };
