import { useState } from "react";
import { PayEmbed } from "thirdweb/react";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { CheckCircle2 } from "lucide-react";

/**
 * ThirdwebPayButton — inline thirdweb Pay embed for funding the wallet with
 * USDC, rendered inside the "Add Funds" tab of the Onboarding payment step.
 *
 * Props:
 *   tier      — { fee: number }       — the selected challenge tier
 *   address   — string                — connected wallet address
 *   onSuccess — () => void            — called when the purchase completes
 *   method    — "card" | "crypto"     — fiat onramp, or cross-chain swap/bridge
 *
 * "card"   → fiat onramp (Transak), crypto path disabled.
 * "crypto" → buy with any token on any EVM chain (built-in bridge + swap),
 *            fiat path disabled.
 */
export default function ThirdwebPayButton({ tier, address, onSuccess, method = "card" }) {
  const [completed, setCompleted] = useState(false);

  if (completed) {
    return (
      <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <p className="text-xs text-green-300 font-medium">
          USDC added — switch to the "Pay with USDC" tab to complete your registration.
        </p>
      </div>
    );
  }

  const fee = String(tier?.fee ?? "");

  return (
    <PayEmbed
      client={thirdwebClient}
      theme="dark"
      payOptions={{
        mode: "fund_wallet",
        // Card = fiat onramp only; Crypto = cross-chain swap/bridge only.
        ...(method === "crypto"
          ? { buyWithCrypto: true, buyWithFiat: false }
          : { buyWithCrypto: false, buyWithFiat: { preferredProvider: "TRANSAK" } }),
        prefillBuy: {
          chain,
          token: {
            address: import.meta.env.VITE_USDC_ADDRESS,
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
          },
          amount: fee,
        },
        onPurchaseSuccess: (info) => {
          setCompleted(true);
          onSuccess?.(info);
        },
      }}
    />
  );
}
