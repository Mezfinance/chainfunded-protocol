/**
 * OnChainStatus — block-height heartbeat that replaces a generic "Live" dot.
 *
 * Reads "on-chain, blockchain-native" every second: a pulsing dot plus the
 * latest block number ticking up. Falls back to a connection state when the
 * price feed is offline.
 *
 * Props:
 *   connected — price-feed connection state (drives colour + fallback label)
 */
import { useBlockNumber } from "@/hooks/useBlockNumber";

export default function OnChainStatus({ connected }) {
  const block = useBlockNumber();
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
      <span className={`relative flex h-1.5 w-1.5`}>
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${connected ? "bg-primary" : "bg-red-400"}`} />
      </span>
      {connected ? (
        <span className="text-muted-foreground">
          On-chain{block != null && <span className="text-foreground/80"> · #{block.toLocaleString()}</span>}
        </span>
      ) : (
        <span className="text-red-400">Reconnecting…</span>
      )}
    </span>
  );
}
