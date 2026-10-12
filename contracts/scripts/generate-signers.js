/**
 * generate-signers.js — Generate 5 fresh wallets for multi-sig payout signing.
 *
 * Outputs:
 *   - Each wallet's address and private key
 *   - Ready-to-use env vars for deploy and backend config
 *
 * Usage:
 *   node scripts/generate-signers.js
 *
 * IMPORTANT: Write down the private keys and store them securely.
 *            These are NOT saved to any file automatically.
 */

const { ethers } = require("ethers");

const SIGNER_COUNT = 5;
const THRESHOLD    = 3;

const wallets = [];
for (let i = 0; i < SIGNER_COUNT; i++) {
  const w = ethers.Wallet.createRandom();
  wallets.push({ address: w.address, privateKey: w.privateKey });
}

// Sort by address ascending (matches contract's signature ordering requirement)
wallets.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));

console.log(`Generated ${SIGNER_COUNT} signer wallets (sorted by address):\n`);
wallets.forEach((w, i) => {
  console.log(`  Signer ${i + 1}:`);
  console.log(`    Address:     ${w.address}`);
  console.log(`    Private Key: ${w.privateKey}\n`);
});

console.log("─── Environment Variables ──────────────────────────────────────────\n");

const addresses = wallets.map(w => w.address).join(",");
const keys      = wallets.map(w => w.privateKey).join(",");

console.log("# Deploy script (contracts/.env)");
console.log(`PAYOUT_SIGNER_ADDRESSES=${addresses}`);
console.log(`SIGNATURE_THRESHOLD=${THRESHOLD}\n`);

console.log("# Backend signing function (Base44 env)");
console.log(`PAYOUT_SIGNER_KEYS=${keys}\n`);

console.log("────────────────────────────────────────────────────────────────────");
console.log("IMPORTANT: Write down each private key and store in a safe.");
console.log("           Do NOT commit these values to version control.");
console.log("────────────────────────────────────────────────────────────────────");
