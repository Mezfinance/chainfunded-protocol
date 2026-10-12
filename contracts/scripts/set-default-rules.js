/**
 * set-default-rules.js — Update default challenge rules on a deployed ChainFundedPool.
 *
 * Calls setDefaultRules() with the correct BPS values:
 *   Phase 1 target:  1000 (10%)
 *   Phase 2 target:   500 (5%)
 *   Max daily loss:   500 (5%)
 *   Max total loss:  1000 (10%)
 *   Min trading days:   4
 *   Trader share:    8000 (80%)
 *   Max best day:    5000 (50%)
 *
 * Required env vars (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY  — contract owner private key
 *   RPC_URL               — RPC endpoint
 *   POOL_ADDRESS          — deployed ChainFundedPool address
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/set-default-rules.js --network sepolia
 */

const hre = require("hardhat");

async function main() {
  const POOL_ADDRESS = process.env.POOL_ADDRESS;
  if (!POOL_ADDRESS) {
    throw new Error("Set POOL_ADDRESS in contracts/.env");
  }

  console.log(`\nSetting default rules on ChainFundedPool at ${POOL_ADDRESS}\n`);

  const pool = await hre.ethers.getContractAt("ChainFundedPool", POOL_ADDRESS);

  const tx = await pool.setDefaultRules(
    1000,  // phase1ProfitTargetBps  = 10%
    500,   // phase2ProfitTargetBps  = 5%
    500,   // maxDailyLossBps        = 5%
    1000,  // maxTotalLossBps        = 10%
    4,     // minTradingDays
    8000,  // traderShareBps         = 80%
    5000   // maxBestDayBps          = 50%
  );

  console.log(`Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}\n`);

  // Verify
  const p1 = await pool.defaultPhase1ProfitTargetBps();
  const p2 = await pool.defaultPhase2ProfitTargetBps();
  const daily = await pool.defaultMaxDailyLossBps();
  const total = await pool.defaultMaxTotalLossBps();
  const days = await pool.defaultMinTradingDays();
  const share = await pool.defaultTraderShareBps();
  const bestDay = await pool.defaultMaxBestDayBps();

  console.log("Verified on-chain values:");
  console.log(`  Phase 1 target:  ${p1} BPS (${Number(p1) / 100}%)`);
  console.log(`  Phase 2 target:  ${p2} BPS (${Number(p2) / 100}%)`);
  console.log(`  Max daily loss:  ${daily} BPS (${Number(daily) / 100}%)`);
  console.log(`  Max total loss:  ${total} BPS (${Number(total) / 100}%)`);
  console.log(`  Min trading days: ${days}`);
  console.log(`  Trader share:    ${share} BPS (${Number(share) / 100}%)`);
  console.log(`  Max best day:    ${bestDay} BPS (${Number(bestDay) / 100}%)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
