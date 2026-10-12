#!/usr/bin/env node
"use strict";

/**
 * Check which addresses are authorized signers on the ChainFundedPool contract.
 *
 * Usage:
 *   npx hardhat run scripts/check-authorized-signers.js --network mainnet [--check 0x...]
 *   npx hardhat run scripts/check-authorized-signers.js --network sepolia --check 0xABC123...
 */

const { ethers } = require("hardhat");

async function main() {
  const poolAddress = process.env.POOL_ADDRESS || "0x"; // set in .env or pass via arg
  const checkAddresses = process.argv
    .slice(2)
    .filter(arg => arg.startsWith("0x"))
    .map(a => a.toLowerCase());

  if (!poolAddress || poolAddress === "0x") {
    console.error("POOL_ADDRESS not set. Set it in .env or pass via POOL_ADDRESS=0x... npx hardhat run ...");
    process.exit(1);
  }

  console.log(`\nQuerying ChainFundedPool at: ${poolAddress}\n`);

  // Load contract ABI from artifacts
  const poolArtifact = require("../artifacts/contracts/ChainFundedPool.sol/ChainFundedPool.json");
  const pool = new ethers.Contract(poolAddress, poolArtifact.abi, ethers.provider);

  // Get signer count and threshold
  const signerCount = await pool.signerCount();
  const threshold = await pool.signatureThreshold();

  console.log(`Signature configuration:`);
  console.log(`  Total signers: ${signerCount}`);
  console.log(`  Threshold: ${threshold} of ${signerCount}`);

  if (checkAddresses.length === 0) {
    console.log(`\nTo check specific addresses, pass them as arguments:`);
    console.log(`  npx hardhat run scripts/check-authorized-signers.js --network mainnet --check 0xABC 0xDEF`);
    console.log(`\nOr set them in an env var and parse here.\n`);
    return;
  }

  console.log(`\nChecking ${checkAddresses.length} address(es):\n`);

  for (const addr of checkAddresses) {
    const isAuthorized = await pool.authorizedSigners(addr);
    const status = isAuthorized ? "✓ AUTHORIZED" : "✗ NOT AUTHORIZED";
    console.log(`  ${addr}: ${status}`);
  }

  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
