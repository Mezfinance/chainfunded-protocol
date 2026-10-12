const { ethers } = require("hardhat");
const path = require("path");

// Resolves to ChainFunded/.env.local regardless of where hardhat is invoked from
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

/**
 * Deploys MZFRevenueRouter and prints the next steps.
 *
 * Required env vars (in .env.local):
 *   VITE_USDC_ADDRESS      — USDC contract on the target chain
 *   MZF_TREASURY_ADDRESS   — MZF's treasury wallet (receives swept revenue)
 *   MZF_SAFE_ADDRESS       — MZF's Gnosis Safe (becomes router owner)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:       ", deployer.address);
  console.log("Network:        ", (await ethers.provider.getNetwork()).name);

  const usdc     = process.env.VITE_USDC_ADDRESS;
  const treasury = process.env.MZF_TREASURY_ADDRESS;
  const safe     = process.env.MZF_SAFE_ADDRESS;

  if (!usdc || !treasury || !safe) {
    throw new Error(
      "Set VITE_USDC_ADDRESS, MZF_TREASURY_ADDRESS, and MZF_SAFE_ADDRESS in ChainFunded/.env.local (project root)"
    );
  }

  console.log("USDC:           ", usdc);
  console.log("Treasury:       ", treasury);
  console.log("Owner (Safe):   ", safe);
  console.log("");

  const Router = await ethers.getContractFactory("MZFRevenueRouter");

  // Pre-compute the deployment address from deployer nonce so we don't rely
  // on waitForDeployment() which has a known hardhat-ethers parsing bug on
  // contract creation transactions (empty `to` field).
  const deployerNonce = await deployer.provider.getTransactionCount(deployer.address);
  const precomputedAddress = ethers.getCreateAddress({ from: deployer.address, nonce: deployerNonce });
  console.log("Expected address:", precomputedAddress);
  console.log("");

  const deployTx = await Router.deploy(usdc, treasury, safe);
  const receipt  = await deployTx.deploymentTransaction().wait();

  const address = receipt?.contractAddress ?? precomputedAddress;
  console.log("✓ MZFRevenueRouter deployed to:", address);
  console.log("  Tx hash:", deployTx.deploymentTransaction().hash);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Add to .env.local:  VITE_REVENUE_ROUTER_ADDRESS=" + address);
  console.log("  2. Call updateLabsWallet(" + address + ") on ChainFundedPool");
  console.log("     (you still own the pool — call directly, no DAO vote needed)");
  console.log("  3. When an agreement is signed, call via MZF Safe:");
  console.log("     setRevenueShare(<affiliateWallet>, <rateBps>, '<agreementRef>')");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
