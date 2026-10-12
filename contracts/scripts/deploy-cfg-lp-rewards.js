/**
 * deploy-cfg-lp-rewards.js
 *
 * Deploys CFGLPRewards, funds it with 10 M CFG, creates all 10 seasons,
 * and whitelists it on ChainFundedPool for CFND transfers.
 *
 * Required env vars:
 *   CFG_TOKEN_ADDRESS          – deployed CFGToken address
 *   POOL_ADDRESS               – deployed ChainFundedPool address
 *   USDC_ADDRESS               – USDC token address
 *   DEPLOYER_PRIVATE_KEY       – signer with CFG balance + pool ownership
 *
 * Optional env vars:
 *   SEASON1_START_TIMESTAMP    – unix timestamp (default: now + 1 day)
 *   OWNER_ADDRESS              – owner of CFGLPRewards (default: deployer)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-cfg-lp-rewards.js --network sepolia
 */

const { ethers } = require("hardhat");

const SEASON_DURATION_SECS = 182n * 24n * 60n * 60n;

const SEASON_BUDGETS = [
    ethers.parseEther("3000000"),
    ethers.parseEther("2000000"),
    ethers.parseEther("1500000"),
    ethers.parseEther("1000000"),
    ethers.parseEther("750000"),
    ethers.parseEther("500000"),
    ethers.parseEther("375000"),
    ethers.parseEther("375000"),
    ethers.parseEther("250000"),
    ethers.parseEther("250000"),
];

const TOTAL_CFG = SEASON_BUDGETS.reduce((a, b) => a + b, 0n);

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const CFG_TOKEN_ADDRESS = process.env.CFG_TOKEN_ADDRESS;
    const POOL_ADDRESS      = process.env.POOL_ADDRESS;
    const USDC_ADDRESS      = process.env.USDC_ADDRESS;
    const OWNER_ADDRESS     = process.env.OWNER_ADDRESS || deployer.address;

    if (!CFG_TOKEN_ADDRESS || !POOL_ADDRESS || !USDC_ADDRESS) {
        throw new Error("CFG_TOKEN_ADDRESS, POOL_ADDRESS, and USDC_ADDRESS are required");
    }

    const season1Start = process.env.SEASON1_START_TIMESTAMP
        ? BigInt(process.env.SEASON1_START_TIMESTAMP)
        : BigInt(Math.floor(Date.now() / 1000)) + 86400n;

    // ── Verify CFG balance ──────────────────────────────────────────────────
    const cfgToken = await ethers.getContractAt("CFGToken", CFG_TOKEN_ADDRESS);
    const bal = await cfgToken.balanceOf(deployer.address);
    console.log("Deployer CFG balance:", ethers.formatEther(bal));
    if (bal < TOTAL_CFG) {
        throw new Error(
            `Insufficient CFG: need ${ethers.formatEther(TOTAL_CFG)}, have ${ethers.formatEther(bal)}`
        );
    }

    // ── Deploy CFGLPRewards ─────────────────────────────────────────────────
    console.log("\nDeploying CFGLPRewards...");
    const CFGLPRewards = await ethers.getContractFactory("CFGLPRewards");
    const rewards = await CFGLPRewards.deploy(
        CFG_TOKEN_ADDRESS,
        POOL_ADDRESS,
        USDC_ADDRESS,
        OWNER_ADDRESS
    );
    await rewards.waitForDeployment();
    const rewardsAddress = await rewards.getAddress();
    console.log("CFGLPRewards deployed:", rewardsAddress);

    // ── Transfer 10 M CFG ───────────────────────────────────────────────────
    console.log(`\nTransferring ${ethers.formatEther(TOTAL_CFG)} CFG to CFGLPRewards...`);
    const transferTx = await cfgToken.transfer(rewardsAddress, TOTAL_CFG);
    await transferTx.wait();
    console.log("Transfer complete.");

    // ── Whitelist on ChainFundedPool ────────────────────────────────────────
    console.log("\nWhitelisting CFGLPRewards on ChainFundedPool for CFND transfers...");
    const pool = await ethers.getContractAt("ChainFundedPool", POOL_ADDRESS);
    const wlTx = await pool.setCfndTransferWhitelist(rewardsAddress, true);
    await wlTx.wait();
    console.log("Whitelist set.");

    // ── Create seasons ──────────────────────────────────────────────────────
    console.log("\nCreating seasons...");
    let seasonStart = season1Start;

    for (let i = 0; i < 10; i++) {
        const seasonEnd = seasonStart + SEASON_DURATION_SECS;
        const tx = await rewards.startSeason(seasonStart, 0n);
        await tx.wait();

        const startDate = new Date(Number(seasonStart) * 1000).toISOString().split("T")[0];
        const endDate   = new Date(Number(seasonEnd)   * 1000).toISOString().split("T")[0];
        console.log(
            `  Season ${String(i + 1).padStart(2, " ")} | ` +
            `${startDate} → ${endDate} | ` +
            `${ethers.formatEther(SEASON_BUDGETS[i]).padStart(12, " ")} CFG`
        );
        seasonStart = seasonEnd;
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(60));
    console.log("  CFG LP Rewards deployment complete");
    console.log("=".repeat(60));
    console.log("  CFGLPRewards: ", rewardsAddress);
    console.log("  CFGToken:     ", CFG_TOKEN_ADDRESS);
    console.log("  Pool:         ", POOL_ADDRESS);
    console.log("  USDC:         ", USDC_ADDRESS);
    console.log("  Owner:        ", OWNER_ADDRESS);
    console.log("  Total CFG:    ", ethers.formatEther(TOTAL_CFG));
    console.log("  Seasons:       10 × 182 days");
    console.log("=".repeat(60));
    console.log("\nAdd to .env / Vercel:");
    console.log(`  VITE_CFG_LP_REWARDS_ADDRESS=${rewardsAddress}`);
    console.log("\nVerify on Etherscan:");
    console.log(
        `  npx hardhat verify --network sepolia ${rewardsAddress}` +
        ` ${CFG_TOKEN_ADDRESS} ${POOL_ADDRESS} ${USDC_ADDRESS} ${OWNER_ADDRESS}`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
