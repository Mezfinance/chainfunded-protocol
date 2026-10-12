/**
 * check-staking.js — Debug LP staking state on Sepolia
 *
 * Usage: npx hardhat run scripts/check-staking.js --network sepolia
 */
const { ethers } = require("hardhat");

const LP_REWARDS = process.env.LP_REWARDS_ADDRESS || "0xEDaE67755B59A72655d5c44ED1380f55C7432a4b";
const USER = "0x3eE780e103d91291d48853b1819b971a28314497";

async function main() {
  const lp = await ethers.getContractAt("CFGLPRewards", LP_REWARDS);

  const [
    activeSeason, seasonCount, totalStaked, userStaked,
    rewardRate, periodStart, periodFinish,
    cfgLastUpdateTime, cfgRewardPerTokenStored,
    earnedCfg, earnedUsdc,
  ] = await Promise.all([
    lp.activeSeason(),
    lp.seasonCount(),
    lp.totalStaked(),
    lp.stakedBalance(USER),
    lp.rewardRate(),
    lp.periodStart(),
    lp.periodFinish(),
    lp.cfgLastUpdateTime(),
    lp.cfgRewardPerTokenStored(),
    lp.earnedCfg(USER),
    lp.earnedUsdc(USER),
  ]);

  const now = Math.floor(Date.now() / 1000);

  console.log("=== CFGLPRewards Debug ===");
  console.log("Active season:        ", Number(activeSeason));
  console.log("Season count:         ", Number(seasonCount));
  console.log("Total staked:         ", ethers.formatUnits(totalStaked, 6), "CFND");
  console.log("User staked:          ", ethers.formatUnits(userStaked, 6), "CFND");
  console.log("");
  console.log("Reward rate:          ", ethers.formatEther(rewardRate), "CFG/sec");
  console.log("Period start:         ", Number(periodStart), `(${new Date(Number(periodStart) * 1000).toISOString()})`);
  console.log("Period finish:        ", Number(periodFinish), `(${new Date(Number(periodFinish) * 1000).toISOString()})`);
  console.log("cfgLastUpdateTime:    ", Number(cfgLastUpdateTime), `(${new Date(Number(cfgLastUpdateTime) * 1000).toISOString()})`);
  console.log("Now:                  ", now, `(${new Date(now * 1000).toISOString()})`);
  console.log("");
  console.log("cfgRewardPerTokenStored:", cfgRewardPerTokenStored.toString());
  console.log("");
  console.log("earnedCfg:            ", ethers.formatEther(earnedCfg), "CFG");
  console.log("earnedUsdc:           ", ethers.formatUnits(earnedUsdc, 6), "USDC");

  // Check timing
  if (now < Number(periodStart)) {
    console.log("\n*** ISSUE: Current time is BEFORE periodStart — no emissions yet ***");
  }
  if (Number(cfgLastUpdateTime) > now) {
    console.log("\n*** ISSUE: cfgLastUpdateTime is in the FUTURE ***");
  }
  if (totalStaked === 0n) {
    console.log("\n*** ISSUE: No CFND staked ***");
  }
  if (rewardRate === 0n) {
    console.log("\n*** ISSUE: Reward rate is 0 ***");
  }
}

main().catch(console.error);
