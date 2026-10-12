import { usePrices, useRegisterSymbols } from "@/lib/PriceContext";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FEATURED = [
  { symbol: "BTCUSDT",  label: "BTC/USD",  category: "Crypto"     },
  { symbol: "ETHUSDT",  label: "ETH/USD",  category: "Crypto"     },
  { symbol: "SOLUSDT",  label: "SOL/USD",  category: "Crypto"     },
  { symbol: "XRPUSDT",  label: "XRP/USD",  category: "Crypto"     },
  { symbol: "BNBUSDT",  label: "BNB/USD",  category: "Crypto"     },
  { symbol: "EUR/USD",  label: "EUR/USD",  category: "Forex"      },
  { symbol: "GBP/USD",  label: "GBP/USD",  category: "Forex"      },
  { symbol: "USD/JPY",  label: "USD/JPY",  category: "Forex"      },
  { symbol: "AUD/USD",  label: "AUD/USD",  category: "Forex"      },
  { symbol: "XAU/USD",  label: "GOLD",     category: "Commodity"  },
  { symbol: "DOGEUSDT", label: "DOGE/USD", category: "Crypto"     },
  { symbol: "ADAUSDT",  label: "ADA/USD",  category: "Crypto"     },
];

const SYMBOLS = FEATURED.map((a) => a.symbol);

function fmtPrice(price, symbol) {
  if (price == null) return "—";
  // FX pairs — 4–5 decimal places
  if (symbol.includes("/") && !symbol.includes("XAU") && !symbol.includes("USD/JPY")) {
    return price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 5 });
  }
  // USD/JPY — 2–3 decimal places, no $ prefix
  if (symbol === "USD/JPY") {
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }
  // Sub-cent crypto (DOGE, XRP, ADA, SHIB)
  if (price < 1) {
    return "$" + price.toFixed(4);
  }
  // Everything else — 2 decimal places
  return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcChange(price, open24h) {
  if (!price || !open24h || open24h === 0) return null;
  return ((price - open24h) / open24h) * 100;
}

function AssetCard({ asset, ticker }) {
  const price   = ticker?.price ?? null;
  const change  = calcChange(ticker?.price, ticker?.open24h);
  const loading = price == null;

  const isPos = change != null && change > 0;
  const isNeg = change != null && change < 0;

  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-lg border border-border bg-card/50 hover:border-primary/30 hover:bg-card transition-colors flex-shrink-0 whitespace-nowrap">
      <span className="font-grotesk font-semibold text-sm text-foreground">{asset.label}</span>

      <span className="font-mono text-sm tabular-nums text-foreground">
        {loading ? (
          <span className="inline-block w-16 h-4 bg-muted animate-pulse rounded align-middle" />
        ) : fmtPrice(price, asset.symbol)}
      </span>

      <span className={`flex items-center gap-0.5 text-xs font-mono tabular-nums ${
        isPos ? "text-green-400" : isNeg ? "text-red-400" : "text-muted-foreground/40"
      }`}>
        {change == null ? (
          <Minus className="w-3 h-3" />
        ) : isPos ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {change == null ? "—" : `${isPos ? "+" : ""}${change.toFixed(2)}%`}
      </span>
    </div>
  );
}

export default function AssetTicker({ borderClass = "border-t" }) {
  useRegisterSymbols(SYMBOLS);
  const { tickers } = usePrices();

  return (
    <section className={`${borderClass} border-border py-4 overflow-hidden`}>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker-scroll 60s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      <div className="flex items-center gap-4 mb-3 px-6 sm:px-10 lg:px-16">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase flex-shrink-0">
          Live markets
        </p>
        <div className="h-px flex-1 bg-border" />
        <Link
          to={createPageUrl("TradingTerminal")}
          className="font-mono text-xs text-muted-foreground/50 hover:text-primary transition-colors flex-shrink-0"
        >
          Open terminal →
        </Link>
      </div>

      {/* Marquee */}
      <div className="relative">
        <div
          className="ticker-track flex gap-3 w-max"
          style={{ willChange: "transform" }}
        >
          {/* duplicate list for seamless loop */}
          {[...FEATURED, ...FEATURED].map((asset, i) => (
            <AssetCard
              key={`${asset.symbol}-${i}`}
              asset={asset}
              ticker={tickers[asset.symbol]}
            />
          ))}
        </div>

        {/* fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
      </div>
    </section>
  );
}
