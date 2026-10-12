/**
 * transfer-distributor-ownership.js — Transfer CFGDistributor ownership to Timelock
 *
 * CFGDistributor uses Ownable2Step, so this is a TWO-STEP process:
 *
 *   Step 1 (this script):  Current owner calls transferOwnership(timelock)
 *                          → sets pendingOwner to the timelock address.
 *
 *   Step 2 (governance):   The timelock must call acceptOwnership() on CFGDistributor.
 *                          This must be done via a governance proposal — create a
 *                          proposal that targets CFGDistributor.acceptOwnership().
 *
 * After both steps complete, only the TimelockController (via governance proposals)
 * can call onlyOwner functions like createSeason(), setReporter(), etc.
 *
 * Required env vars (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY          — current owner private key
 *   RPC_URL                       — RPC endpoint
 *   CFG_DISTRIBUTOR_ADDRESS       — CFGDistributor contract address
 *   TIMELOCK_ADDRESS              — TimelockController contract address
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/transfer-distributor-ownership.js --network sepolia
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const distributorAddress = process.env.CFG_DISTRIBUTOR_ADDRESS;
  const timelockAddress = process.env.TIMELOCK_ADDRESS;

  if (!distributorAddress) throw new Error("CFG_DISTRIBUTOR_ADDRESS not set in .env");
  if (!timelockAddress) throw new Error("TIMELOCK_ADDRESS not set in .env");

  console.log("Transferring CFGDistributor ownership to Timelock (Ownable2Step)");
  console.log("  Distributor:", distributorAddress);
  console.log("  Timelock:   ", timelockAddress);
  console.log("  From:       ", deployer.address);

  const distributor = await ethers.getContractAt("CFGDistributor", distributorAddress);

  const currentOwner = await distributor.owner();
  console.log("  Current owner:", currentOwner);

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Deployer ${deployer.address} is not the current owner ${currentOwner}`);
  }

  // Check if there's already a pending owner
  const pendingOwner = await distributor.pendingOwner();
  if (pendingOwner !== ethers.ZeroAddress) {
    console.log(`\n  ⚠  Pending owner already set to: ${pendingOwner}`);
    if (pendingOwner.toLowerCase() === timelockAddress.toLowerCase()) {
      console.log("  Timelock is already the pending owner — skip to Step 2.");
      console.log("  Create a governance proposal to call acceptOwnership() on CFGDistributor.");
      return;
    }
    console.log("  Overwriting pending owner with new timelock address...");
  }

  // Step 1: transferOwnership → sets pendingOwner
  const tx = await distributor.transferOwnership(timelockAddress);
  console.log("  tx:", tx.hash);
  await tx.wait();

  const newPending = await distributor.pendingOwner();
  console.log("\n  ✓ Step 1 complete — pendingOwner set to:", newPending);
  console.log("  Current owner is still:", await distributor.owner());

  console.log("\n  ── Step 2 required ──────────────────────────────────────────");
  console.log("  The Timelock must call acceptOwnership() on CFGDistributor.");
  console.log("  Create a governance proposal with:");
  console.log(`    target:   ${distributorAddress}`);
  console.log("    value:    0");
  console.log("    calldata: acceptOwnership()");
  console.log("  Once the proposal passes and executes, ownership transfer is complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
