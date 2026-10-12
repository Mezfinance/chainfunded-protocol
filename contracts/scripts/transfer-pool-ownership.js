/**
 * transfer-pool-ownership.js — Transfer ChainFundedPool ownership to Timelock
 *
 * ChainFundedPool uses Ownable2Step, so this is a TWO-STEP process:
 *
 *   Step 1 (this script):  Current owner calls transferOwnership(timelock)
 *                          → sets pendingOwner to the timelock address.
 *
 *   Step 2 (governance):   The timelock must call acceptOwnership() on ChainFundedPool.
 *                          This must be done via a governance proposal.
 *
 * Prefer using transfer-all-ownership.js to transfer all contracts at once.
 *
 * Required env vars (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY   — current Pool owner private key
 *   RPC_URL                — RPC endpoint
 *   REWARDS_POOL_ADDRESS   — ChainFundedPool contract address
 *   TIMELOCK_ADDRESS       — TimelockController contract address
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/transfer-pool-ownership.js --network sepolia
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const poolAddress = process.env.REWARDS_POOL_ADDRESS;
  const timelockAddress = process.env.TIMELOCK_ADDRESS;

  if (!poolAddress) throw new Error("REWARDS_POOL_ADDRESS not set in .env");
  if (!timelockAddress) throw new Error("TIMELOCK_ADDRESS not set in .env");

  console.log("Transferring ChainFundedPool ownership to Timelock (Ownable2Step)");
  console.log("  Pool:     ", poolAddress);
  console.log("  Timelock: ", timelockAddress);
  console.log("  From:     ", deployer.address);

  const pool = await ethers.getContractAt("ChainFundedPool", poolAddress);

  const currentOwner = await pool.owner();
  console.log("  Current owner:", currentOwner);

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Deployer ${deployer.address} is not the current owner ${currentOwner}`);
  }

  const pendingOwner = await pool.pendingOwner();
  if (pendingOwner.toLowerCase() === timelockAddress.toLowerCase()) {
    console.log("\n  Timelock is already the pending owner — skip to Step 2.");
    console.log("  Create a governance proposal to call acceptOwnership() on ChainFundedPool.");
    return;
  }

  const tx = await pool.transferOwnership(timelockAddress);
  console.log("  tx:", tx.hash);
  await tx.wait();

  console.log("\n  Step 1 complete — pendingOwner set to:", await pool.pendingOwner());
  console.log("  Current owner is still:", await pool.owner());
  console.log("\n  Create a governance proposal to call acceptOwnership() on ChainFundedPool.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
