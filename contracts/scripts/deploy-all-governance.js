/**
 * deploy-all-governance.js — One-shot deployment of the full CFG governance
 * and reward distribution stack.
 *
 * Deploys everything EXCEPT ChainFundedPool (already deployed separately).
 *
 * Deployment order:
 *   1.  TimelockController
 *   2.  CFGToken
 *   3.  CFGGovernor
 *   4.  Grant Governor roles on Timelock, revoke deployer admin
 *   5.  CFGVesting for each beneficiary (team, advisors, investors)
 *   6.  initialMint — distribute 100M CFG to all recipients
 *   7.  CFGDistributor — fund 15M, create 10 seasons
 *   8.  CFGLPRewards — fund 10M, whitelist on pool, create 10 seasons
 *   9.  Self-delegate deployer tokens
 *
 * CFG Allocation (100,000,000 total):
 *   51,000,000  → Timelock (46M treasury + 5M airdrop reserve)
 *   15,000,000  → CFGDistributor (trader rewards — 10 seasons)
 *   10,000,000  → CFGLPRewards (LP staking — 10 seasons)
 *   20,000,000  → CFGVesting — team members (6mo cliff, 4yr linear)
 *    2,000,000  → CFGVesting — advisors (6mo cliff, 4yr linear)
 *    1,800,000  → CFGVesting — investors (0 cliff, 12mo linear)
 *      200,000  → Investor wallets direct (10% TGE unlock)
 *  ────────────
 *  100,000,000
 *
 * Beneficiary lists are hardcoded below (update wallet addresses before
 * mainnet launch). Override via env vars if needed — set TEAM_BENEFICIARIES,
 * ADVISOR_BENEFICIARIES, or INVESTOR_BENEFICIARIES as JSON arrays to
 * override the defaults.
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY         — private key with ETH for gas
 *   RPC_URL                      — RPC endpoint
 *   POOL_ADDRESS                 — deployed ChainFundedPool address
 *   USDC_ADDRESS                 — USDC token address
 *
 * Optional:
 *   TEAM_BENEFICIARIES           — JSON override for team beneficiaries
 *   ADVISOR_BENEFICIARIES        — JSON override for advisor beneficiaries
 *   INVESTOR_BENEFICIARIES       — JSON override for investor beneficiaries
 *   SEASON1_START_TIMESTAMP      — unix timestamp for season 1 (default: now + 1 day)
 *   TIMELOCK_DELAY               — seconds (default: 172800 = 2 days; use 60 for testnet)
 *   ETHERSCAN_API_KEY            — auto-verify deployed contracts
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/deploy-all-governance.js --network sepolia
 */

const { ethers } = require("hardhat");

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY  = 24n * 60n * 60n;
const YEAR = 365n * DAY;

const SEASON_DURATION = 182n * DAY;

const CFG = (n) => ethers.parseEther(String(n));

// Allocation
const TOTAL_SUPPLY         = CFG("100000000");
const TREASURY_AND_AIRDROP = CFG("51000000"); // 46M treasury + 5M airdrop reserve
const TRADING_REWARDS      = CFG("15000000");
const LP_REWARDS           = CFG("10000000");
const TEAM_ALLOCATION      = CFG("20000000");
const ADVISOR_ALLOCATION   = CFG("2000000");
const INVESTOR_TOTAL       = CFG("2000000");
const ADVISOR_TGE_PCT      = 10n; // 10% TGE unlock
const INVESTOR_TGE_PCT     = 10n; // 10% TGE unlock

// Sanity check
const ALLOC_SUM = TREASURY_AND_AIRDROP + TRADING_REWARDS + LP_REWARDS
  + TEAM_ALLOCATION + ADVISOR_ALLOCATION + INVESTOR_TOTAL;
if (ALLOC_SUM !== TOTAL_SUPPLY) {
  throw new Error(`Allocation mismatch: ${ALLOC_SUM} !== ${TOTAL_SUPPLY}`);
}

// ─── Beneficiary defaults ────────────────────────────────────────────────────
// Update wallet addresses before mainnet launch.
// Override at runtime via env vars (JSON arrays) if needed.

const DEFAULT_TEAM_BENEFICIARIES = [
  { name: "Jerome",  address: "0x3eE780e103d91291d48853b1819b971a28314497", share: 50 },
  { name: "Jarrod",  address: "0x493695271AeB01a88b35807CEE381886833f1538", share: 20 },
  { name: "Lee",     address: "0xa142f4E1B9d56da990E1De3BE4210Ce51EF9d6fb", share: 20 },
  { name: "Luqman",  address: "0xd610873101650c35a87762600829237b5926be5d", share: 5  },
  { name: "Miresi",  address: "0x6716adf2f9612648061ea2dbaed38a5e6a7797ea", share: 5  },
];

const DEFAULT_ADVISOR_BENEFICIARIES = [
  { name: "Lisa",    address: "0xBc0188a2d91cF315316fDABe134E306e1aE3A442", share: 16.67 },
  { name: "Will",    address: "0x71b7FAa67f8853363EA7B0804a4635C96DeedF25", share: 16.70 },
  { name: "Ben",     address: "0x405338F496D665C821518107895F0b9639Fde789", share: 16.70 },
  { name: "Amir",    address: "0xe3B10A6F985280F6d69F00B3075762999d5b31b1", share: 16.60 },
  { name: "Jeromy",  address: "0x8380331580ed73ebe2bFD0cBCc615758c58cfB33", share: 16.60 },
  { name: "Misha",   address: "0x3D837E41fda4165f9B53303aedeedA2438586Eb1", share: 16.73 },
];

const DEFAULT_INVESTOR_BENEFICIARIES = [
  { name: "Ebony",   address: "0x04c5383293AAF14bE72345AB5AFeFdDa05A5c325", share: 80 },
  { name: "Misha",   address: "0x3D837E41fda4165f9B53303aedeedA2438586Eb1", share: 10 },
  { name: "Lisa",    address: "0x63a9dc4cf543a1b68b74b1fcc9f3ed35c1fd1daf", share: 10 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load a beneficiary list from env var (JSON) or fall back to hardcoded default.
 * Validates shares sum to 100 (with 0.1 tolerance for decimal rounding).
 */
function loadBeneficiaries(envVar, defaults, label) {
  let list;

  const raw = process.env[envVar];
  if (raw) {
    try { list = JSON.parse(raw); } catch {
      throw new Error(`${envVar} must be valid JSON. Got: ${raw}`);
    }
    console.log(`  ${label}: loaded from ${envVar} (${list.length} entries)`);
  } else {
    list = defaults;
    console.log(`  ${label}: using hardcoded defaults (${list.length} entries)`);
  }

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${label}: beneficiary list must be a non-empty array`);
  }

  let totalShare = 0;
  for (const entry of list) {
    if (!entry.address || typeof entry.share !== "number") {
      throw new Error(`${label}: each entry must have { address, share }. Got: ${JSON.stringify(entry)}`);
    }
    if (entry.share <= 0 || entry.share > 100) {
      throw new Error(`${label}: share must be 1–100. Got: ${entry.share} for ${entry.address}`);
    }
    totalShare += entry.share;
  }
  // Allow 0.1 tolerance for decimal shares (e.g. 33.3 + 33.3 + 33.4 = 100.0)
  if (Math.abs(totalShare - 100) > 0.1) {
    throw new Error(`${label}: shares must sum to 100. Got: ${totalShare}`);
  }

  for (const b of list) {
    console.log(`    ${(b.name || "").padEnd(10)} ${b.address} → ${b.share}%`);
  }

  return list;
}

/**
 * Split a total allocation among beneficiaries by share percentage.
 * Supports decimal shares (e.g. 33.3%). Uses basis-point math to avoid
 * floating-point precision issues. Absorbs rounding dust into the last entry.
 * Returns [{ name, address, amount }].
 */
function splitAllocation(totalAmount, beneficiaries) {
  // Convert shares to basis points (33.3% → 3330 BPS) for integer math
  const totalBps = beneficiaries.reduce((a, b) => a + Math.round(b.share * 100), 0);
  const splits = beneficiaries.map((b) => ({
    name: b.name || "",
    address: b.address,
    amount: (totalAmount * BigInt(Math.round(b.share * 100))) / BigInt(totalBps),
  }));
  // Absorb rounding dust into the last entry
  const sum = splits.reduce((a, s) => a + s.amount, 0n);
  if (sum < totalAmount) {
    splits[splits.length - 1].amount += totalAmount - sum;
  }
  return splits;
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Robust contract deployment that handles the ethers v6 mainnet bug where
 * contract creation txs (to="") cause BAD_DATA parsing errors despite the
 * tx being submitted successfully. Falls back to polling the tx receipt.
 */
async function robustDeploy(factory, args, label) {
  try {
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`  ${label}: ${addr}`);
    return { contract, address: addr };
  } catch (err) {
    // Check if this is the known ethers BAD_DATA bug (tx was actually submitted)
    if (err.code === "BAD_DATA" && err.value?.hash) {
      const txHash = err.value.hash;
      console.log(`  ${label}: tx submitted (${txHash}), waiting for confirmation...`);
      const receipt = await ethers.provider.waitForTransaction(txHash, 1, 120000);
      if (!receipt || receipt.status !== 1) throw new Error(`${label}: tx failed or timed out`);
      const addr = receipt.contractAddress;
      console.log(`  ${label}: ${addr}`);
      const contract = factory.attach(addr);
      return { contract, address: addr };
    }
    throw err;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ── Validate env ──────────────────────────────────────────────────────────
  const POOL_ADDRESS = process.env.POOL_ADDRESS;
  const USDC_ADDRESS = process.env.USDC_ADDRESS;

  if (!POOL_ADDRESS) throw new Error("POOL_ADDRESS is required");
  if (!USDC_ADDRESS) throw new Error("USDC_ADDRESS is required");

  console.log("Loading beneficiary lists...");
  const teamBenefs     = loadBeneficiaries("TEAM_BENEFICIARIES", DEFAULT_TEAM_BENEFICIARIES, "Team");
  const advisorBenefs  = loadBeneficiaries("ADVISOR_BENEFICIARIES", DEFAULT_ADVISOR_BENEFICIARIES, "Advisors");
  const investorBenefs = loadBeneficiaries("INVESTOR_BENEFICIARIES", DEFAULT_INVESTOR_BENEFICIARIES, "Investors");

  const timelockDelay = parseInt(process.env.TIMELOCK_DELAY || "172800");

  // Governor parameters — short for testnet, production values for mainnet
  // Override via env: VOTING_DELAY_BLOCKS, VOTING_PERIOD_BLOCKS, PROPOSAL_THRESHOLD
  const isTestnet = timelockDelay < 3600;
  const votingDelayBlocks   = parseInt(process.env.VOTING_DELAY_BLOCKS   || (isTestnet ? "10"          : "7200"));      // testnet: ~2 min, mainnet: ~1 day
  const votingPeriodBlocks  = parseInt(process.env.VOTING_PERIOD_BLOCKS  || (isTestnet ? "50"          : "36000"));     // testnet: ~10 min, mainnet: ~5 days
  const proposalThreshold   = process.env.PROPOSAL_THRESHOLD             ? ethers.parseEther(process.env.PROPOSAL_THRESHOLD)
                                                                         : ethers.parseEther(isTestnet ? "1"          : "250000"); // testnet: 1 CFG, mainnet: 250K

  console.log(`  Governor settings (${isTestnet ? "TESTNET" : "MAINNET"}):`);
  console.log(`    Voting delay:       ${votingDelayBlocks} blocks`);
  console.log(`    Voting period:      ${votingPeriodBlocks} blocks`);
  console.log(`    Proposal threshold: ${ethers.formatEther(proposalThreshold)} CFG\n`);

  const season1Start = process.env.SEASON1_START_TIMESTAMP
    ? BigInt(process.env.SEASON1_START_TIMESTAMP)
    : BigInt(Math.floor(Date.now() / 1000)) + BigInt(DAY);

  // Pre-compute splits
  const teamSplits    = splitAllocation(TEAM_ALLOCATION, teamBenefs);

  // Advisors: split into TGE (10%) and vesting (90%) per beneficiary
  const advisorVestingTotal  = (ADVISOR_ALLOCATION * (100n - ADVISOR_TGE_PCT)) / 100n;
  const advisorTgeTotal      = ADVISOR_ALLOCATION - advisorVestingTotal;
  const advisorVestingSplits = splitAllocation(advisorVestingTotal, advisorBenefs);
  const advisorTgeSplits     = splitAllocation(advisorTgeTotal, advisorBenefs);

  // Investors: split into TGE (10%) and vesting (90%) per beneficiary
  const investorVestingTotal = (INVESTOR_TOTAL * (100n - INVESTOR_TGE_PCT)) / 100n;
  const investorTgeTotal     = INVESTOR_TOTAL - investorVestingTotal;
  const investorVestingSplits = splitAllocation(investorVestingTotal, investorBenefs);
  const investorTgeSplits     = splitAllocation(investorTgeTotal, investorBenefs);

  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: TimelockController
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 1/9 — Deploying TimelockController...");
  const Timelock = await ethers.getContractFactory("TimelockController");
  const { contract: timelock, address: timelockAddr } = await robustDeploy(Timelock, [timelockDelay, [], [], deployer.address], "TimelockController");

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: CFGToken
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 2/9 — Deploying CFGToken...");
  const CFGTokenFactory = await ethers.getContractFactory("CFGToken");
  const { contract: cfgToken, address: cfgTokenAddr } = await robustDeploy(CFGTokenFactory, [deployer.address], "CFGToken");

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: CFGGovernor
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 3/9 — Deploying CFGGovernor...");
  const CFGGovernor = await ethers.getContractFactory("CFGGovernor");
  const { contract: governor, address: governorAddr } = await robustDeploy(CFGGovernor, [cfgTokenAddr, timelockAddr, votingDelayBlocks, votingPeriodBlocks, proposalThreshold], "CFGGovernor");
  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Grant roles, revoke deployer admin
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 4/9 — Configuring Timelock roles...");
  const PROPOSER_ROLE  = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE  = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const ADMIN_ROLE     = await timelock.DEFAULT_ADMIN_ROLE();

  await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();
  await (await timelock.revokeRole(ADMIN_ROLE, deployer.address)).wait();
  console.log("  PROPOSER → Governor, EXECUTOR → anyone, admin revoked ✓");

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 5: CFGVesting for each beneficiary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 5/9 — Deploying vesting contracts...");
  const CFGVesting = await ethers.getContractFactory("CFGVesting");

  // Helper: get a startTime guaranteed to be in the future on-chain
  async function freshStartTime() {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp) + 300n; // 5 min ahead of latest block
  }

  const allVestingContracts = []; // { label, name, address, beneficiary, amount }

  // Team: 6-month cliff, 4-year vesting
  console.log("  Team vesting:");
  for (const split of teamSplits) {
    const { address: vcAddr, contract: vc } = await robustDeploy(CFGVesting, [
      cfgTokenAddr, split.address, split.amount,
      await freshStartTime(), 182n * DAY, 4n * YEAR
    ], `${split.name}`);
    allVestingContracts.push({ label: "team", name: split.name, address: vcAddr, beneficiary: split.address, amount: split.amount });
    console.log(`    → ${split.name} ${split.address} (${ethers.formatEther(split.amount)} CFG)`);
  }

  // Advisors: 10% TGE (sent directly), 90% vesting with 0 cliff, 12-month linear
  console.log("  Advisor vesting (90% in contract, 10% TGE direct):");
  for (const split of advisorVestingSplits) {
    const { address: vcAddr } = await robustDeploy(CFGVesting, [
      cfgTokenAddr, split.address, split.amount,
      await freshStartTime(), 0, 365n * DAY
    ], `${split.name}`);
    allVestingContracts.push({ label: "advisor", name: split.name, address: vcAddr, beneficiary: split.address, amount: split.amount });
    console.log(`    → ${split.name} ${split.address} (${ethers.formatEther(split.amount)} CFG vest)`);
  }

  // Investors: 0 cliff, 12-month vesting
  console.log("  Investor vesting:");
  for (const split of investorVestingSplits) {
    const { address: vcAddr } = await robustDeploy(CFGVesting, [
      cfgTokenAddr, split.address, split.amount,
      await freshStartTime(), 0, 365n * DAY
    ], `${split.name}`);
    allVestingContracts.push({ label: "investor", name: split.name, address: vcAddr, beneficiary: split.address, amount: split.amount });
    console.log(`    → ${split.name} ${split.address} (${ethers.formatEther(split.amount)} CFG vest)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 6: initialMint — distribute 100M CFG
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 6/9 — Minting 100M CFG...");

  // Deployer receives trading + LP allocations temporarily (transferred in steps 7–8)
  const deployerReceives = TRADING_REWARDS + LP_REWARDS;

  const recipients = [timelockAddr, deployer.address];
  const amounts    = [TREASURY_AND_AIRDROP, deployerReceives];

  // Add each vesting contract
  for (const vc of allVestingContracts) {
    recipients.push(vc.address);
    amounts.push(vc.amount);
  }

  // Add advisor TGE direct payments (10%)
  for (const split of advisorTgeSplits) {
    recipients.push(split.address);
    amounts.push(split.amount);
  }

  // Add investor TGE direct payments (10%)
  for (const split of investorTgeSplits) {
    recipients.push(split.address);
    amounts.push(split.amount);
  }

  // Verify sum
  const mintSum = amounts.reduce((a, b) => a + b, 0n);
  if (mintSum !== TOTAL_SUPPLY) {
    throw new Error(`Mint sum mismatch: ${ethers.formatEther(mintSum)} !== ${ethers.formatEther(TOTAL_SUPPLY)}`);
  }

  await (await cfgToken.initialMint(recipients, amounts)).wait();
  console.log("  100M CFG minted ✓");
  console.log(`    Timelock (treasury+airdrop):  ${ethers.formatEther(TREASURY_AND_AIRDROP)}`);
  console.log(`    Deployer (temp):              ${ethers.formatEther(deployerReceives)}`);
  console.log(`    Vesting contracts × ${allVestingContracts.length}: ${ethers.formatEther(TEAM_ALLOCATION + advisorVestingTotal + investorVestingTotal)}`);
  console.log(`    Advisor TGE direct:           ${ethers.formatEther(advisorTgeTotal)}`);
  console.log(`    Investor TGE direct:          ${ethers.formatEther(investorTgeTotal)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 7: CFGDistributor — fund 15M, create 10 seasons
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 7/9 — Deploying CFGDistributor...");
  const CFGDistributor = await ethers.getContractFactory("CFGDistributor");
  const { contract: distributor, address: distributorAddr } = await robustDeploy(CFGDistributor, [cfgTokenAddr, POOL_ADDRESS, deployer.address], "CFGDistributor");

  await (await cfgToken.transfer(distributorAddr, TRADING_REWARDS)).wait();
  console.log("  Transferred 15M CFG ✓");

  // Compute season1Start fresh from latest block (avoids InvalidStartTime)
  let seasonStart = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 60n;
  for (let i = 0; i < 10; i++) {
    await (await distributor.createSeason(seasonStart, 0n)).wait();
    seasonStart += SEASON_DURATION;
  }
  console.log("  10 seasons created ✓");

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 8: CFGLPRewards — fund 10M, whitelist on pool, create 10 seasons
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 8/9 — Deploying CFGLPRewards...");
  const CFGLPRewards = await ethers.getContractFactory("CFGLPRewards");
  const { contract: lpRewards, address: lpRewardsAddr } = await robustDeploy(CFGLPRewards, [cfgTokenAddr, POOL_ADDRESS, USDC_ADDRESS, deployer.address], "CFGLPRewards");

  await (await cfgToken.transfer(lpRewardsAddr, LP_REWARDS)).wait();
  console.log("  Transferred 10M CFG ✓");

  const pool = await ethers.getContractAt("ChainFundedPool", POOL_ADDRESS);
  await (await pool.setCfndTransferWhitelist(lpRewardsAddr, true)).wait();
  console.log("  Whitelisted on ChainFundedPool ✓");

  // Compute fresh start from latest block — all 10 seasons created upfront.
  // CFGLPRewards now derives rewardRate/periodStart from the seasons mapping
  // dynamically, so creating all 10 at once is safe.
  seasonStart = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 60n;
  for (let i = 0; i < 10; i++) {
    await (await lpRewards.startSeason(seasonStart, 0n)).wait();
    seasonStart += SEASON_DURATION;
  }
  console.log("  10 seasons created ✓");

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 9: Self-delegate deployer
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Step 9/9 — Self-delegating deployer tokens...");
  await (await cfgToken.delegate(deployer.address)).wait();
  console.log("  Deployer self-delegated ✓");

  const deployerBal = await cfgToken.balanceOf(deployer.address);
  console.log(`  Deployer CFG balance: ${ethers.formatEther(deployerBal)} (should be 0)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const vestingAddresses = allVestingContracts.map(v => v.address).join(",");

  console.log("\n" + "═".repeat(64));
  console.log("  FULL GOVERNANCE + REWARDS STACK DEPLOYED");
  console.log("═".repeat(64));
  console.log("");
  console.log("  Governance:");
  console.log("    TimelockController:", timelockAddr);
  console.log("    CFGToken:          ", cfgTokenAddr);
  console.log("    CFGGovernor:       ", governorAddr);
  console.log("");
  console.log(`  Vesting (${allVestingContracts.length} contracts):`);
  for (const vc of allVestingContracts) {
    const nameTag = vc.name ? ` (${vc.name})` : "";
    console.log(`    [${vc.label}] ${vc.address} → ${vc.beneficiary}${nameTag} — ${ethers.formatEther(vc.amount)} CFG`);
  }
  console.log("");
  console.log("  Investor TGE (direct):");
  for (const split of investorTgeSplits) {
    const nameTag = split.name ? ` (${split.name})` : "";
    console.log(`    ${split.address}${nameTag} → ${ethers.formatEther(split.amount)} CFG`);
  }
  console.log("");
  console.log("  Rewards:");
  console.log("    CFGDistributor (15M):", distributorAddr);
  console.log("    CFGLPRewards (10M):  ", lpRewardsAddr);
  console.log("");
  console.log("  Existing:");
  console.log("    ChainFundedPool:     ", POOL_ADDRESS);
  console.log("    USDC:                ", USDC_ADDRESS);
  console.log("");
  console.log("  Timelock holds 51M CFG (46M treasury + 5M airdrop reserve)");
  console.log("  Deployer admin revoked — governance is fully decentralised.");
  console.log("");
  console.log("═".repeat(64));
  console.log("");
  console.log("Add to .env / Vercel:");
  console.log(`  VITE_CFG_TOKEN_ADDRESS=${cfgTokenAddr}`);
  console.log(`  VITE_CFG_GOVERNOR_ADDRESS=${governorAddr}`);
  console.log(`  VITE_TIMELOCK_ADDRESS=${timelockAddr}`);
  console.log(`  VITE_CFG_DISTRIBUTOR_ADDRESS=${distributorAddr}`);
  console.log(`  VITE_CFG_LP_REWARDS_ADDRESS=${lpRewardsAddr}`);
  console.log(`  VITE_CFG_VESTING_ADDRESSES=${vestingAddresses}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
