/**
 * deploy-cfg-distributor.js
 *
 * Deploys CFGDistributor, funds it with 15 M CFG from the caller's wallet,
 * and initialises all 10 seasons back-to-back starting from SEASON1_START.
 *
 * Required env vars:
 *   CFG_TOKEN_ADDRESS          – deployed CFGToken address
 *   DEPLOYER_PRIVATE_KEY       – private key with CFG balance and ETH for gas
 *
 * Optional env vars:
 *   REPORTER_ADDRESS           – address authorised to call recordRegistration
 *                                (defaults to deployer if not set)
 *   SEASON1_START_TIMESTAMP    – unix timestamp for Season 1 open
 *                                (defaults to now + 1 day to allow setup time)
 *   OWNER_ADDRESS              – owner of the distributor after deployment
 *                                (defaults to deployer)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-cfg-distributor.js --network sepolia
 */

const { ethers } = require("hardhat");

// ─── Schedule ────────────────────────────────────────────────────────────────

const SEASON_DURATION_SECS = 182n * 24n * 60n * 60n; // 182 days ≈ 6 months

// Canonical season budgets (18 dec) — must match CFGDistributor.seasonBudget()
const SEASON_BUDGETS = [
    ethers.parseEther("4500000"),
    ethers.parseEther("3000000"),
    ethers.parseEther("2250000"),
    ethers.parseEther("1500000"),
    ethers.parseEther("1125000"),
    ethers.parseEther("750000"),
    ethers.parseEther("562500"),
    ethers.parseEther("562500"),
    ethers.parseEther("375000"),
    ethers.parseEther("375000"),
];

const TOTAL_CFG = SEASON_BUDGETS.reduce((a, b) => a + b, 0n);

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    // ── Validate env ────────────────────────────────────────────────────────
    const CFG_TOKEN_ADDRESS = process.env.CFG_TOKEN_ADDRESS;
    if (!CFG_TOKEN_ADDRESS) {
        throw new Error("CFG_TOKEN_ADDRESS env var is required");
    }

    const REPORTER_ADDRESS = process.env.REPORTER_ADDRESS || deployer.address;
    const OWNER_ADDRESS    = process.env.OWNER_ADDRESS    || deployer.address;
    const POOL_ADDRESS     = process.env.POOL_ADDRESS;

    const season1Start = process.env.SEASON1_START_TIMESTAMP
        ? BigInt(process.env.SEASON1_START_TIMESTAMP)
        : BigInt(Math.floor(Date.now() / 1000)) + 86400n; // now + 1 day

    // ── Sanity-check deployer CFG balance ───────────────────────────────────
    const cfgToken = await ethers.getContractAt("CFGToken", CFG_TOKEN_ADDRESS);
    const deployerCfgBalance = await cfgToken.balanceOf(deployer.address);
    console.log("Deployer CFG balance:", ethers.formatEther(deployerCfgBalance));
    if (deployerCfgBalance < TOTAL_CFG) {
        throw new Error(
            `Insufficient CFG: need ${ethers.formatEther(TOTAL_CFG)}, ` +
            `have ${ethers.formatEther(deployerCfgBalance)}`
        );
    }

    // ── Deploy CFGDistributor ───────────────────────────────────────────────
    console.log("\nDeploying CFGDistributor...");
    const CFGDistributor = await ethers.getContractFactory("CFGDistributor");
    if (!POOL_ADDRESS) throw new Error("POOL_ADDRESS env var is required");
    const distributor = await CFGDistributor.deploy(CFG_TOKEN_ADDRESS, POOL_ADDRESS, OWNER_ADDRESS);
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log("CFGDistributor deployed:", distributorAddress);

    // ── Transfer 15 M CFG into the distributor ──────────────────────────────
    console.log(`\nTransferring ${ethers.formatEther(TOTAL_CFG)} CFG to distributor...`);
    const transferTx = await cfgToken.transfer(distributorAddress, TOTAL_CFG);
    await transferTx.wait();
    const distributorBalance = await cfgToken.balanceOf(distributorAddress);
    console.log("Distributor CFG balance:", ethers.formatEther(distributorBalance));

    // ── Create all 10 seasons (sequential, no gaps) ─────────────────────────
    console.log("\nCreating seasons...");
    let seasonStart = season1Start;

    for (let i = 0; i < 10; i++) {
        const seasonEnd = seasonStart + SEASON_DURATION_SECS;

        // Pass cfgBudget = 0 so the contract uses its canonical schedule value
        const tx = await distributor.createSeason(seasonStart, 0n);
        await tx.wait();

        const startDate = new Date(Number(seasonStart) * 1000).toISOString().split("T")[0];
        const endDate   = new Date(Number(seasonEnd)   * 1000).toISOString().split("T")[0];
        console.log(
            `  Season ${String(i + 1).padStart(2, " ")} | ` +
            `${startDate} → ${endDate} | ` +
            `${ethers.formatEther(SEASON_BUDGETS[i]).padStart(12, " ")} CFG`
        );

        seasonStart = seasonEnd; // seasons are contiguous
    }

    // ── Grant reporter access ───────────────────────────────────────────────
    if (REPORTER_ADDRESS.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log("\nGranting reporter access to:", REPORTER_ADDRESS);
        const tx = await distributor.setReporter(REPORTER_ADDRESS, true);
        await tx.wait();
        console.log("Reporter set.");
    } else {
        console.log(
            "\nNote: deployer is acting as reporter. " +
            "Grant a dedicated reporter via setReporter() before going live."
        );
    }

    // ── Transfer ownership if different from deployer ───────────────────────
    if (OWNER_ADDRESS.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`\nOwnership transferred to ${OWNER_ADDRESS} at construction.`);
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(60));
    console.log("  CFG Distributor deployment complete");
    console.log("=".repeat(60));
    console.log("  CFGDistributor:", distributorAddress);
    console.log("  CFGToken:      ", CFG_TOKEN_ADDRESS);
    console.log("  Owner:         ", OWNER_ADDRESS);
    console.log("  Reporter:      ", REPORTER_ADDRESS);
    console.log("  Total CFG:     ", ethers.formatEther(TOTAL_CFG));
    console.log("  Seasons:        10 × 182 days");
    console.log("=".repeat(60));
    console.log("\nAdd to .env / Vercel:");
    console.log(`  VITE_CFG_DISTRIBUTOR_ADDRESS=${distributorAddress}`);
    console.log("\nVerify on Etherscan:");
    console.log(
        `  npx hardhat verify --network sepolia ${distributorAddress}` +
        ` ${CFG_TOKEN_ADDRESS} ${OWNER_ADDRESS}`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
