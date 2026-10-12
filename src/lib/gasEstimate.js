/**
 * Gas reimbursement estimation for in-app wallet transactions.
 *
 * Fetches live gas price from the chain and uses the live ETH/USD price
 * from the app's price feed to calculate the USDC equivalent.
 */

import { getRpcClient, eth_gasPrice } from "thirdweb/rpc";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";

// Conservative gas limits per transaction type
const GAS_LIMITS = {
  registerChallenge: 250_000n,
  deposit: 200_000n,
  claimPayout: 200_000n,
  claimProfit: 120_000n,
  withdraw: 180_000n,
};

// Fallbacks only used if live data is unavailable
const FALLBACK_GAS_PRICE_GWEI = 3n;
const FALLBACK_ETH_PRICE_USD = 2000;

/**
 * Fetch current gas price from the chain.
 * @returns {Promise<bigint>} gas price in wei
 */
async function getLiveGasPrice() {
  try {
    const rpc = getRpcClient({ client: thirdwebClient, chain });
    const gasPrice = await eth_gasPrice(rpc);
    return gasPrice;
  } catch {
    return FALLBACK_GAS_PRICE_GWEI * 1_000_000_000n;
  }
}

/**
 * Estimate gas reimbursement in USDC using live chain data.
 *
 * @param {"registerChallenge"|"deposit"|"claimPayout"|"claimProfit"|"withdraw"} txType
 * @param {number|null} ethPriceUsd - live ETH/USD price from price feed
 * @returns {Promise<number>} gas reimbursement in USDC (human-readable, e.g. 0.45)
 */
export async function estimateGasReimbursementUsdc(txType, ethPriceUsd) {
  const gasLimit = GAS_LIMITS[txType] || 200_000n;
  const gasPriceWei = await getLiveGasPrice();
  const ethPrice = ethPriceUsd || FALLBACK_ETH_PRICE_USD;

  // Gas cost in ETH
  const gasCostEth = Number(gasLimit * gasPriceWei) / 1e18;

  // Convert to USD with 10% buffer
  const gasCostUsd = gasCostEth * ethPrice * 1.1;

  // Round up to nearest cent, minimum $0.01
  return Math.max(0.01, Math.ceil(gasCostUsd * 100) / 100);
}

/**
 * Convert human-readable USDC to 6-decimal on-chain units.
 * @param {number} usdc - e.g. 1.50
 * @returns {bigint} - e.g. 1_500_000n
 */
export function toUsdcUnits(usdc) {
  return BigInt(Math.round(usdc * 1_000_000));
}

/**
 * Check if the active wallet is an in-app (smart) wallet that needs
 * gas sponsoring. External wallets (MetaMask, Coinbase, WalletConnect)
 * have their own ETH and should not be charged a USDC gas reimbursement.
 *
 * @param {object|null} wallet - thirdweb wallet object from useActiveWallet()
 * @returns {boolean}
 */
export function isInAppWallet(wallet) {
  if (!wallet) return false;
  const id = wallet.id || "";
  return id === "inApp" || id === "smart" || id === "embedded";
}

/**
 * Returns the gas reimbursement in on-chain USDC units (6 decimals),
 * or 0n if the wallet is an external wallet that pays its own gas.
 *
 * @param {"registerChallenge"|"deposit"|"claimPayout"|"claimProfit"|"withdraw"} txType
 * @param {object|null} wallet - from useActiveWallet()
 * @param {number|null} ethPriceUsd - live ETH/USD price (from usePrices().getPrice("ETHUSDT"))
 * @returns {Promise<bigint>}
 */
export async function getGasReimbursement(txType, wallet, ethPriceUsd) {
  if (!isInAppWallet(wallet)) return 0n;
  const estimate = await estimateGasReimbursementUsdc(txType, ethPriceUsd);
  return toUsdcUnits(estimate);
}
