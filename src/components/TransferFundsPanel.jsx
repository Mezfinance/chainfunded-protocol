import { useState, useEffect } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { getContract, readContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { CheckCircle2, Copy, Check, AlertTriangle } from "lucide-react";

const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;

/**
 * TransferFundsPanel — "Add Funds → Transfer".
 *
 * Shows the connected wallet's address so the user can withdraw USDC to it from
 * an external exchange (Binance, Coinbase, …), then polls the wallet's USDC
 * balance until at least the challenge fee has arrived. Deliberately blunt about
 * network/token to protect non-technical (in-app wallet) users.
 *
 * Props:
 *   address  — string        — connected wallet address (the deposit target)
 *   tier     — { fee:number } — selected tier (used as the arrival threshold)
 *   onFunded — () => void     — called once the fee amount is detected
 */
export default function TransferFundsPanel({ address, tier, onFunded }) {
  const [copied, setCopied] = useState(false);
  const [received, setReceived] = useState(false);

  const feeUnits = BigInt(Math.round((tier?.fee ?? 0) * 1_000_000)); // USDC has 6 decimals
  const networkName = chain?.name || "the destination network";

  const copy = () => {
    navigator.clipboard?.writeText(address || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Poll the wallet's USDC balance until the fee amount lands.
  useEffect(() => {
    if (!address || !USDC_ADDRESS || feeUnits <= 0n || received) return;
    let cancelled = false;
    let timer = null;
    const usdc = getContract({ client: thirdwebClient, chain, address: USDC_ADDRESS });

    const poll = async () => {
      try {
        const bal = await readContract({
          contract: usdc,
          method: "function balanceOf(address) view returns (uint256)",
          params: [address] });
        if (!cancelled && bal >= feeUnits) {
          setReceived(true);
          onFunded?.();
          return; // stop polling
        }
      } catch { /* transient RPC error — retry next tick */ }
      if (!cancelled) timer = setTimeout(poll, 12_000);
    };
    poll();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, feeUnits.toString(), received]);

  if (received) {
    return (
      <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <p className="text-xs text-green-300 font-medium">
          USDC received — switch to the "Pay with USDC" tab to complete your registration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Withdraw <span className="text-foreground font-medium">USDC</span> from your exchange
        (Binance, Coinbase, etc.) to the wallet address below. We'll detect it automatically.
      </p>

      {/* Network/token safety callout — the make-or-break detail */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300/90">
          Send <span className="font-semibold">USDC on {networkName}</span> only. Sending a different
          token, or on a different network, may permanently lose your funds.
        </p>
      </div>

      {/* Deposit address */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Your wallet address</p>
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
          <code className="text-xs font-mono text-foreground break-all flex-1">{address}</code>
          <button
            onClick={copy}
            className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Copy address"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Live waiting indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BoltLoader className="w-3.5 h-3.5 shrink-0" />
        Waiting for at least {tier?.fee} USDC to arrive — exchange withdrawals usually take a few minutes.
      </div>
    </div>
  );
}
