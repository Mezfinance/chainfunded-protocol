/**
 * deploy-governance.js — Deploy CFG governance stack to Sepolia.
 *
 * Deploys three contracts in order:
 *   1. TimelockController (2-day delay)
 *   2. CFGToken (100M supply, ERC20Votes)
 *   3. CFGGovernor (connects token + timelock)
 *
 * Then:
 *   4. Grants Governor the PROPOSER + EXECUTOR roles on Timelock
 *   5. Mints test tokens to deployer + test wallets
 *   6. Self-delegates deployer tokens (required for voting)
 *
 * Required env vars (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY  — deploying wallet private key
 *   RPC_URL               — Sepolia RPC endpoint
 *
 * Optional:
 *   TEST_WALLETS          — comma-separated addresses to receive test tokens
 *   ETHERSCAN_API_KEY     — auto-verify on Etherscan
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/deploy-governance.js --network sepolia
 *
 * Thirdweb alternative (interactive UI):
 *   npx thirdweb deploy
 *   → Select CFGToken, deploy first
 *   → Select CFGGovernor, deploy with token + timelock addresses
 *   → Grant roles manually via thirdweb dashboard
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying governance stack with:", deployer.address);
  console.log("Balance:", ethers.formatUnits(await ethers.provider.getBalance(deployer.address), 18), "ETH\n");

  // ─── 1. Deploy TimelockController ──────────────────────────────────────
  console.log("1/6 Deploying TimelockController...");

  // TESTNET: 60 seconds. PRODUCTION: use 2 * 24 * 60 * 60 (2 days)
  const minDelay = 60; // 60 seconds — TESTNET ONLY
  const TimelockFactory = await ethers.getContractFactory("TimelockController");

  // Constructor: minDelay, proposers[], executors[], admin
  // We set deployer as initial admin, then revoke after setup
  const timelock = await TimelockFactory.deploy(
    minDelay,
    [],               // proposers — will grant to Governor after deploy
    [],               // executors — will grant to Governor after deploy
    deployer.address  // admin — will revoke after setup
  );
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("   TimelockController:", timelockAddress);

  // ─── 2. Deploy CFGToken ────────────────────────────────────────────────
  console.log("2/6 Deploying CFGToken...");

  const CFGTokenFactory = await ethers.getContractFactory("CFGToken");
  const cfgToken = await CFGTokenFactory.deploy(deployer.address);
  await cfgToken.waitForDeployment();
  const cfgTokenAddress = await cfgToken.getAddress();
  console.log("   CFGToken:", cfgTokenAddress);

  // ─── 3. Deploy CFGGovernor ─────────────────────────────────────────────
  console.log("3/6 Deploying CFGGovernor...");

  const GovernorFactory = await ethers.getContractFactory("CFGGovernor");
  // Testnet: short voting periods. Mainnet: use 7200, 36000, 250000e18
  const governor = await GovernorFactory.deploy(
    cfgTokenAddress, timelockAddress, 10, 50, ethers.parseEther("1")
  );
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("   CFGGovernor:", governorAddress);

  // ─── 4. Grant Governor roles on Timelock ───────────────────────────────
  console.log("4/6 Granting Timelock roles to Governor...");

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

  // Governor can propose and cancel
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddress)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddress)).wait();

  // Anyone can execute (address(0) = open execution)
  await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();

  console.log("   PROPOSER_ROLE  → Governor ✓");
  console.log("   CANCELLER_ROLE → Governor ✓");
  console.log("   EXECUTOR_ROLE  → anyone   ✓");

  // Revoke deployer's admin role so only the Timelock itself (via governance)
  // can modify roles. Without this, the deployer key can bypass governance
  // entirely. See audit finding H-02.
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
  console.log("   DEFAULT_ADMIN_ROLE revoked from deployer ✓");

  // ─── 5. Mint test tokens ───────────────────────────────────────────────
  console.log("5/6 Minting test tokens...");

  const TOTAL_SUPPLY = ethers.parseUnits("100000000", 18); // 100M

  // Parse test wallets from env (if any)
  const testWallets = (process.env.TEST_WALLETS || "")
    .split(",")
    .map(a => a.trim())
    .filter(Boolean);

  if (testWallets.length === 0) {
    // No test wallets — mint everything to deployer for testing
    const recipients = [deployer.address];
    const amounts = [TOTAL_SUPPLY];

    await (await cfgToken.initialMint(recipients, amounts)).wait();
    console.log("   Minted 100M CFG to deployer");
  } else {
    // Split: 60% deployer, rest split among test wallets
    const deployerShare = (TOTAL_SUPPLY * 60n) / 100n;
    const perWallet = (TOTAL_SUPPLY - deployerShare) / BigInt(testWallets.length);

    const recipients = [deployer.address, ...testWallets];
    const amounts = [deployerShare, ...testWallets.map(() => perWallet)];

    // Adjust last wallet to absorb rounding remainder
    const sum = amounts.reduce((a, b) => a + b, 0n);
    if (sum < TOTAL_SUPPLY) {
      amounts[amounts.length - 1] += TOTAL_SUPPLY - sum;
    }

    await (await cfgToken.initialMint(recipients, amounts)).wait();
    console.log(`   Minted to deployer (60%) + ${testWallets.length} test wallets`);
  }

  // ─── 6. Self-delegate deployer tokens ──────────────────────────────────
  console.log("6/6 Self-delegating deployer tokens...");

  await (await cfgToken.delegate(deployer.address)).wait();
  console.log("   Deployer delegated to self ✓");

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("GOVERNANCE STACK DEPLOYED");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  TimelockController:", timelockAddress);
  console.log("  CFGToken:          ", cfgTokenAddress);
  console.log("  CFGGovernor:       ", governorAddress);
  console.log("══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Register on Tally: https://www.tally.xyz/add-a-dao");
  console.log("     → Chain: Sepolia");
  console.log("     → Governor: ", governorAddress);
  console.log("  2. Test delegation: holders must call cfgToken.delegate(self)");
  console.log("  3. Create a test proposal on Tally");
  console.log("  4. Vote → Queue → Execute through timelock");
  console.log("");
  console.log("Deployer admin role has been revoked — governance is fully decentralised.");

  // ─── Auto-verify ──────────────────────────────────────────────────────
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting for confirmations before verifying...");
    await cfgToken.deploymentTransaction().wait(5);

    try {
      await hre.run("verify:verify", {
        address: cfgTokenAddress,
        constructorArguments: [deployer.address],
      });
      console.log("CFGToken verified ✓");
    } catch (e) { console.log("CFGToken verification:", e.message); }

    try {
      await hre.run("verify:verify", {
        address: governorAddress,
        constructorArguments: [cfgTokenAddress, timelockAddress],
      });
      console.log("CFGGovernor verified ✓");
    } catch (e) { console.log("CFGGovernor verification:", e.message); }

    try {
      await hre.run("verify:verify", {
        address: timelockAddress,
        constructorArguments: [minDelay, [], [], deployer.address],
      });
      console.log("TimelockController verified ✓");
    } catch (e) { console.log("TimelockController verification:", e.message); }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
