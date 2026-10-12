import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { ASSET_CLASS, ASSET_CLASS_LABELS, getAssetConfig } from "@/lib/assetConfig";
import { getMarketStatus, formatTimeUntil } from "@/lib/marketHours";

/**
 * Compact bar showing market open/close status for the currently selected asset.
 * Displays a warning when the market is closed or about to close.
 *
 * Props:
 *   symbol — current trading symbol
 */
export default function MarketStatusBar({ symbol }) {
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(new Date());

  const config = getAssetConfig(symbol);
  const assetClass = config.assetClass;

  useEffect(() => {
    function tick() {
      const n = new Date();
      setNow(n);
      setStatus(getMarketStatus(assetClass, n));
    }
    tick();
    const interval = setInterval(tick, 10000); // update every 10s
    return () => clearInterval(interval);
  }, [assetClass]);

  if (!status || assetClass === ASSET_CLASS.CRYPTO) return null;

  const isClosingSoon = status.isOpen && status.nextChange &&
    (status.nextChange.getTime() - now.getTime()) < 30 * 60 * 1000; // < 30 min

  if (status.isOpen && !isClosingSoon) return null; // Don't show bar when market is open and not closing soon

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
      !status.isOpen
        ? "bg-red-500/10 border border-red-500/20 text-red-400"
        : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
    }`}>
      {!status.isOpen ? (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Clock className="w-3.5 h-3.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {!status.isOpen ? (
          <span>
            {ASSET_CLASS_LABELS[assetClass]} market is <strong>{status.label}</strong>
            {status.nextChange && (
              <> · {status.nextChangeLabel} in {formatTimeUntil(status.nextChange, now)}</>
            )}
            <span className="text-red-300/80"> · Trading disabled. All positions were closed at market close.</span>
          </span>
        ) : (
          <span>
            Market closing soon · {status.nextChangeLabel} in <strong>{formatTimeUntil(status.nextChange, now)}</strong>
            <span className="text-yellow-300/80"> · Open positions will be closed at market price when the market closes.</span>
          </span>
        )}
      </div>
    </div>
  );
}
