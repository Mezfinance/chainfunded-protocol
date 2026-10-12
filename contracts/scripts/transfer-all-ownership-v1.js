/**
 * transfer-all-ownership-v1.js — Transfer all contract ownership to Timelock
 *
 * For deployments where ChainFundedPool uses Ownable (single-step):
 *
 *   ChainFundedPool  (Ownable)      → immediate transfer
 *   CFGDistributor   (Ownable2Step) → sets pendingOwner (step 1 of 2)
 *   CFGLPRewards     (Ownable2Step) → sets pendingOwner (step 1 of 2)
 *
 * After this script completes:
 *   - ChainFundedPool is fully owned by the Timelock.
 *   - CFGDistributor and CFGLPRewards have the Timelock as pendingOwner.
 *     A governance proposal must call acceptOwnership() on each to finish.
 *
 * NOTE: If ChainFundedPool has been redeployed with Ownable2Step, use
 *       transfer-all-ownership.js instead.
 *
 * Required env vars (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY       — current owner private key
 *   RPC_URL                    — RPC endpoint
 *   REWARDS_POOL_ADDRESS       — ChainFundedPool contract address
 *   CFG_DISTRIBUTOR_ADDRESS    — CFGDistributor contract address
 *   CFG_LP_REWARDS_ADDRESS     — CFGLPRewards contract address
 *   TIMELOCK_ADDRESS           — TimelockController contract address
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/transfer-all-ownership-v1.js --network sepolia
 */

const { ethers } = require("hardhat");

async function transferOwnable(name, address, timelockAddress, deployer) {
  console.log(`\n── ${name} (Ownable — single-step) ──`);
  console.log(`   Address: ${address}`);

  const contract = await ethers.getContractAt(name, address);
  const currentOwner = await contract.owner();
  console.log(`   Current owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() === timelockAddress.toLowerCase()) {
    console.log("   Already owned by Timelock — skipping");
    return "done";
  }

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`   Deployer is not the owner — skipping (owner: ${currentOwner})`);
    return "skipped";
  }

  const tx = await contract.transferOwnership(timelockAddress);
  console.log(`   tx: ${tx.hash}`);
  await tx.wait();

  const newOwner = await contract.owner();
  console.log(`   Ownership transferred — new owner: ${newOwner}`);
  return "done";
}

async function transferOwnable2Step(name, address, timelockAddress, deployer) {
  console.log(`\n── ${name} (Ownable2Step) ──`);
  console.log(`   Address: ${address}`);

  const contract = await ethers.getContractAt(name, address);
  const currentOwner = await contract.owner();
  console.log(`   Current owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() === timelockAddress.toLowerCase()) {
    console.log("   Already owned by Timelock — skipping");
    return "done";
  }

  const pendingOwner = await contract.pendingOwner();
  if (pendingOwner.toLowerCase() === timelockAddress.toLowerCase()) {
    console.log("   Timelock is already pendingOwner — awaiting acceptOwnership()");
    return "pending";
  }

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`   Deployer is not the owner — skipping (owner: ${currentOwner})`);
    return "skipped";
  }

  const tx = await contract.transferOwnership(timelockAddress);
  console.log(`   tx: ${tx.hash}`);
  await tx.wait();

  console.log(`   Step 1 complete — pendingOwner set to: ${await contract.pendingOwner()}`);
  return "pending";
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const poolAddress        = process.env.REWARDS_POOL_ADDRESS;
  const distributorAddress = process.env.CFG_DISTRIBUTOR_ADDRESS;
  const lpRewardsAddress   = process.env.CFG_LP_REWARDS_ADDRESS;
  const timelockAddress    = process.env.TIMELOCK_ADDRESS;

  if (!timelockAddress) throw new Error("TIMELOCK_ADDRESS not set in .env");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Transfer All Ownership to Timelock (Pool v1 — Ownable)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Timelock: ${timelockAddress}`);
  console.log(`  Deployer: ${deployer.address}`);

  const needsAccept = [];

  // 1. ChainFundedPool (Ownable — immediate)
  if (poolAddress) {
    await transferOwnable("ChainFundedPool", poolAddress, timelockAddress, deployer);
  } else {
    console.log("\n── ChainFundedPool ──");
    console.log("   REWARDS_POOL_ADDRESS not set — skipping");
  }

  // 2. CFGDistributor (Ownable2Step)
  if (distributorAddress) {
    const result = await transferOwnable2Step("CFGDistributor", distributorAddress, timelockAddress, deployer);
    if (result === "pending") needsAccept.push({ name: "CFGDistributor", address: distributorAddress });
  } else {
    console.log("\n── CFGDistributor ──");
    console.log("   CFG_DISTRIBUTOR_ADDRESS not set — skipping");
  }

  // 3. CFGLPRewards (Ownable2Step)
  if (lpRewardsAddress) {
    const result = await transferOwnable2Step("CFGLPRewards", lpRewardsAddress, timelockAddress, deployer);
    if (result === "pending") needsAccept.push({ name: "CFGLPRewards", address: lpRewardsAddress });
  } else {
    console.log("\n── CFGLPRewards ──");
    console.log("   CFG_LP_REWARDS_ADDRESS not set — skipping");
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════");
  if (poolAddress) {
    console.log("  ChainFundedPool  → Transferred (immediate)");
  }
  if (needsAccept.length > 0) {
    for (const { name } of needsAccept) {
      console.log(`  ${name}  → pendingOwner set to Timelock`);
    }
    console.log("");
    console.log("  ── Next step ────────────────────────────────────────────");
    console.log("  Create a governance proposal to call acceptOwnership()");
    console.log("  on each Ownable2Step contract:");
    console.log("");
    for (const { name, address } of needsAccept) {
      console.log(`    target: ${address}  (${name})`);
    }
    console.log("    value:    0");
    console.log("    calldata: acceptOwnership()");
  } else if (!poolAddress && needsAccept.length === 0) {
    console.log("  No contracts transferred.");
  } else {
    console.log("  All contracts are now owned by the Timelock.");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
