/**
 * transfer-all-ownership.js — Transfer all contract ownership to Timelock
 *
 * All three contracts use Ownable2Step, so this is a TWO-STEP process:
 *
 *   Step 1 (this script):  Current owner calls transferOwnership(timelock)
 *                          on each contract → sets pendingOwner.
 *
 *   Step 2 (governance):   Create a governance proposal to call
 *                          acceptOwnership() on all three contracts.
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
 *   npx hardhat run scripts/transfer-all-ownership.js --network sepolia
 */

const { ethers } = require("hardhat");

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
  console.log("  Transfer All Contract Ownership to Timelock (Ownable2Step)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Timelock: ${timelockAddress}`);
  console.log(`  Deployer: ${deployer.address}`);

  const contracts = [
    { name: "ChainFundedPool", address: poolAddress,        envVar: "REWARDS_POOL_ADDRESS" },
    { name: "CFGDistributor",  address: distributorAddress, envVar: "CFG_DISTRIBUTOR_ADDRESS" },
    { name: "CFGLPRewards",    address: lpRewardsAddress,   envVar: "CFG_LP_REWARDS_ADDRESS" },
  ];

  const needsAccept = [];

  for (const { name, address, envVar } of contracts) {
    if (!address) {
      console.log(`\n── ${name} ──`);
      console.log(`   ${envVar} not set — skipping`);
      continue;
    }
    const result = await transferOwnable2Step(name, address, timelockAddress, deployer);
    if (result === "pending") {
      needsAccept.push({ name, address });
    }
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════");

  if (needsAccept.length === 0) {
    console.log("  All contracts are already owned by the Timelock.");
  } else {
    for (const { name } of needsAccept) {
      console.log(`  ${name}  → pendingOwner set to Timelock`);
    }
    console.log("");
    console.log("  ── Next step ────────────────────────────────────────────");
    console.log("  Create a governance proposal to call acceptOwnership()");
    console.log("  on each contract:");
    console.log("");
    for (const { name, address } of needsAccept) {
      console.log(`    target: ${address}  (${name})`);
    }
    console.log("    value:    0");
    console.log("    calldata: acceptOwnership()");
    console.log("");
    console.log("  This can be a single multi-target proposal.");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
