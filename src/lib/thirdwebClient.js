import { createThirdwebClient } from "thirdweb";
import { sepolia, baseSepolia, base, ethereum } from "thirdweb/chains";
import { createWallet, inAppWallet } from "thirdweb/wallets";

// In VITE_SCREENSHOTS=true mode VITE_THIRDWEB_CLIENT_ID is not set.
// createThirdwebClient throws without a clientId, so we fall back to a placeholder.
// The client is never actually used in mock mode (all on-chain hooks return fixtures).
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "screenshots-placeholder",
});

// App metadata passed to every connect() call so that MetaMask mobile (and
// other wallets) can redirect back to the dApp after the user signs a tx.
export const appMetadata = {
  name:    "ChainFunded",
  url:     typeof window !== "undefined" ? window.location.origin : "",
  logoUrl: typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "",
};

// Set VITE_CHAIN_ID to select deployment target:
//   1       → Ethereum Mainnet
//   8453    → Base Mainnet
//   84532   → Base Sepolia
//   11155111 → Sepolia
const chainId = parseInt(import.meta.env.VITE_CHAIN_ID || "11155111");

const CHAIN_MAP = {
  1:        { chain: ethereum,   explorer: "https://etherscan.io" },
  8453:     { chain: base,       explorer: "https://basescan.org" },
  84532:    { chain: baseSepolia, explorer: "https://sepolia.basescan.org" },
  11155111: { chain: sepolia,    explorer: "https://sepolia.etherscan.io" },
};

const resolved = CHAIN_MAP[chainId] ?? CHAIN_MAP[11155111];

export const chain = resolved.chain;

// Wallet list used by every connect() call.
// Crypto wallets are listed first so the modal's primary UI is the familiar
// wallet picker — MetaMask, Coinbase, WalletConnect. inAppWallet (social /
// email login) is appended last so it appears as an alternative option rather
// than taking over the first screen, which on mobile Safari causes the
// in-app-wallet iframe to block or crash the entire connect modal.
//
// In-app wallets use EIP-7702 execution mode with sponsored gas so users
// can transact without ETH. External wallets are unaffected.
export const wallets = [
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("walletConnect"),
  inAppWallet({
    auth: {
      options: ["google", "apple", "email", "phone", "passkey"],
    },
    executionMode: {
      mode: "EIP7702",
      chain: resolved.chain,
      sponsorGas: true,
    },
  }),
];

/** Returns a block-explorer URL for a transaction hash on the active chain. */
export function explorerTxUrl(hash) {
  return `${resolved.explorer}/tx/${hash}`;
}

/** Returns a block-explorer URL for an address on the active chain. */
export function explorerAddressUrl(address) {
  return `${resolved.explorer}/address/${address}`;
}
