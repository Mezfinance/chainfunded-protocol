/**
 * deploy-mock-usdc.js — Deploy MockUSDC to Sepolia and fund test wallets.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-mock-usdc.js --network sepolia
 *
 * Optional env:
 *   TEST_WALLETS — comma-separated addresses to fund with $1M each
 */

const { ethers } = require("hardhat");

const FUND_AMOUNT = 1_000_000n * 1_000_000n; // $1M USDC (6 decimals)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy MockUSDC
  console.log("Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed:", usdcAddress);

  const deployerBal = await usdc.balanceOf(deployer.address);
  console.log("Deployer balance:", (Number(deployerBal) / 1e6).toLocaleString(), "USDC");

  // Fund test wallets
  const wallets = (process.env.TEST_WALLETS || "")
    .split(",")
    .map(a => a.trim())
    .filter(Boolean);

  // Always include deployer's own address
  const allWallets = [...new Set([deployer.address, ...wallets])];

  console.log(`\nFunding ${allWallets.length} wallets with $${(Number(FUND_AMOUNT) / 1e6).toLocaleString()} each...\n`);

  for (const addr of allWallets) {
    if (addr.toLowerCase() === deployer.address.toLowerCase()) {
      console.log(`  ${addr} — deployer (already has ${(Number(deployerBal) / 1e6).toLocaleString()} USDC)`);
      continue;
    }
    try {
      const tx = await usdc.transfer(addr, FUND_AMOUNT);
      await tx.wait();
      console.log(`  ${addr} — $${(Number(FUND_AMOUNT) / 1e6).toLocaleString()} USDC ✓`);
    } catch (err) {
      console.error(`  ${addr} — FAILED: ${err.message}`);
    }
  }

  const remaining = await usdc.balanceOf(deployer.address);
  console.log(`\nDeployer remaining: ${(Number(remaining) / 1e6).toLocaleString()} USDC`);

  console.log("\n" + "═".repeat(50));
  console.log("  MockUSDC:", usdcAddress);
  console.log("  Use this as USDC_ADDRESS in subsequent deploys");
  console.log("═".repeat(50));
  console.log(`\n  USDC_ADDRESS=${usdcAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
