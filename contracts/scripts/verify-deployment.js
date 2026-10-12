/**
 * verify-deployment.js — Check all CFG token balances on-chain match expected allocation.
 *
 * Reads live Sepolia state and prints PASS/FAIL for every address.
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/verify-deployment.js --network sepolia
 */

const { ethers } = require("hardhat");

// ─── Deployed addresses (Sepolia — April 2026) ──────────────────────────────

const CFG_TOKEN       = "0x07d69348ACA145fF93DF8C8BcF724Fa07436cB11";
const TIMELOCK        = "0x552103488D7eadf24fc947a86e8806C08174DAdb";
const GOVERNOR        = "0x40e989F2d52D0E6bBa2F16b3c2A344Fc3C806257";
const DISTRIBUTOR     = "0x2B5248F8a409B8220D1262aEAc5701aAB64B6893";
const LP_REWARDS      = "0x6b85Ed170F365754DC46d2FF52b9CecFEcdEca0B";
const POOL            = "0x53a34f79Ab90fA577775aEBC14dFc91948776b9c";
const DEPLOYER        = "0x3eE780e103d91291d48853b1819b971a28314497";

const cfg = (n) => ethers.parseEther(String(n));
const fmt = (wei) => Number(wei / 10n**14n) / 10000; // 4 decimal places

// Expected balances: [label, address, expectedCFG]
const EXPECTED = [
  // Core
  ["Timelock (treasury+airdrop)", TIMELOCK,    cfg("51000000")],
  ["CFGDistributor (15M)",        DISTRIBUTOR, cfg("15000000")],
  ["CFGLPRewards (10M)",          LP_REWARDS,  cfg("10000000")],
  ["Deployer (should be 0)",      DEPLOYER,    cfg("0")],

  // Team vesting
  ["Vesting: Jerome (team 50%)",  "0xB6E6FCb5A5d679e32191Cf3B1879FEa84c53769a", cfg("10000000")],
  ["Vesting: Jarrod (team 20%)",  "0xb6D5f919D5dB42f9023F1cCA5Ee842b6e72320eC", cfg("4000000")],
  ["Vesting: Lee (team 20%)",     "0xe4b0DdD067d5db3Bfa2c3409601189988a2aF269", cfg("4000000")],
  ["Vesting: Luqman (team 5%)",   "0xB2BF689E30849aFdFa9B748225E43f004c68908a", cfg("1000000")],
  ["Vesting: Miresi (team 5%)",   "0xdA1E4fb6eDAE9306a162Ce31AdE6BDe540b1C300", cfg("1000000")],

  // Advisor vesting (90% — 10% sent directly at TGE). Amounts approximate; update after redeployment
  ["Vesting: Lisa (advisor 16.67%)",  "0x70EaA2bc66Ec5426d5a226D79AaD97217b79a2AD", cfg("300270")],
  ["Vesting: Will (advisor 33.3%)",   "0xb587cE185cA926A39B3771674c7C6Ed5e722ff5a", cfg("599940")],
  ["Vesting: Ben (advisor 33.3%)",    "0xd02FeBE3b70f1eaC45094de6061c837B3982d4C4", cfg("599940")],
  ["Vesting: Misha (advisor 16.66%)", "0x0000000000000000000000000000000000000000", cfg("299850")],

  // Investor vesting
  ["Vesting: Ebony (investor 80%)",  "0xA1969D8F07abE4FB435f18Ad6139faDc7D569873", cfg("1440000")],
  ["Vesting: Misha (investor 10%)",  "0xF6591aa3aE17cF8E67E594686C3204515741FB79", cfg("180000")],
  ["Vesting: Lisa (investor 10%)",   "0xDc2B3A10e10BA376A9Bdf83AbF16A0a5e31E45D7", cfg("180000")],

  // Investor TGE (direct — these wallets may also hold CFG from other sources)
  ["TGE: Ebony (160K)",   "0x04c5383293AAF14bE72345AB5AFeFdDa05A5c325", cfg("160000")],
  ["TGE: Misha (20K)",    "0x9a15ff10109c9eadc6f7e80275b41864304c0247", cfg("20000")],

  // Labs wallet (advisor placeholder 2M)
  ["Labs wallet (2M advisor)",  "0x3eE780e103d91291d48853b1819b971a28314497", null], // deployer = labs in this deploy
];

// Lisa's wallet receives both TGE (20K) and possibly other allocations
// She has a vesting contract, so her wallet should have 20K TGE
const LISA_WALLET = "0x63a9dc4cf543a1b68b74b1fcc9f3ed35c1fd1daf";

async function main() {
  console.log("Verifying CFG token deployment on Sepolia...\n");

  const cfgToken = await ethers.getContractAt("CFGToken", CFG_TOKEN);

  // Check total supply
  const totalSupply = await cfgToken.totalSupply();
  const supplyPass = totalSupply === cfg("100000000");
  console.log(`${supplyPass ? "PASS" : "FAIL"}  Total supply: ${fmt(totalSupply)} CFG (expected 100,000,000)`);

  // Check each expected balance
  let allPass = supplyPass;
  let accountedTotal = 0n;

  for (const [label, addr, expected] of EXPECTED) {
    if (expected === null) continue; // skip labs wallet (overlaps with deployer)

    const balance = await cfgToken.balanceOf(addr);
    const pass = balance === expected;
    allPass = allPass && pass;
    accountedTotal += balance;

    const status = pass ? "PASS" : "FAIL";
    const actual = fmt(balance);
    const exp = fmt(expected);

    if (pass) {
      console.log(`${status}  ${label}: ${actual} CFG`);
    } else {
      console.log(`${status}  ${label}: ${actual} CFG (expected ${exp})`);
    }
  }

  // Lisa's wallet: TGE from investor (20K) — check separately since she also has a vesting contract
  const lisaBal = await cfgToken.balanceOf(LISA_WALLET);
  // Lisa receives 20K TGE. She's also an advisor but those tokens are in the vesting contract.
  const lisaPass = lisaBal >= cfg("20000");
  allPass = allPass && lisaPass;
  console.log(`${lisaPass ? "PASS" : "FAIL"}  TGE: Lisa (20K+): ${fmt(lisaBal)} CFG (expected >= 20,000)`);
  accountedTotal += lisaBal;

  // Labs wallet = deployer in this deploy, already counted as 0 above
  // But labs received 2M advisor placeholder in initialMint
  // Actually deployer = labs = 0x3eE780... — deployer balance already checked as 0
  // The 2M went to labs.address which IS the deployer, then deployer transferred 25M to distributor+LP
  // Let's check if labs is different from deployer
  console.log("");

  // Sum check: all known addresses should sum to 100M
  // Collect ALL unique addresses
  const allAddresses = new Set();
  for (const [, addr, expected] of EXPECTED) {
    if (expected !== null) allAddresses.add(addr.toLowerCase());
  }
  allAddresses.add(LISA_WALLET.toLowerCase());

  let grandTotal = 0n;
  for (const addr of allAddresses) {
    grandTotal += await cfgToken.balanceOf(addr);
  }

  const accountingPass = grandTotal === cfg("100000000");
  allPass = allPass && accountingPass;
  console.log(`${accountingPass ? "PASS" : "FAIL"}  Full 100M CFG accounting: ${fmt(grandTotal)} CFG across ${allAddresses.size} addresses`);

  // ── Governance checks ──────────────────────────────────────────────────
  console.log("\n── Governance ──────────────────────────────────────────────");

  const timelock = await ethers.getContractAt("TimelockController", TIMELOCK);
  const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

  const adminRevoked = !(await timelock.hasRole(ADMIN_ROLE, DEPLOYER));
  console.log(`${adminRevoked ? "PASS" : "FAIL"}  Deployer admin revoked from Timelock`);
  allPass = allPass && adminRevoked;

  const govHasProposer = await timelock.hasRole(PROPOSER_ROLE, GOVERNOR);
  console.log(`${govHasProposer ? "PASS" : "FAIL"}  Governor has PROPOSER role`);
  allPass = allPass && govHasProposer;

  // ── initialMint locked ─────────────────────────────────────────────────
  const mintDone = await cfgToken.initialMintCompleted();
  console.log(`${mintDone ? "PASS" : "FAIL"}  initialMint completed (locked)`);
  allPass = allPass && mintDone;

  // ── CFGDistributor seasons ─────────────────────────────────────────────
  console.log("\n── CFGDistributor ──────────────────────────────────────────");
  const distributor = await ethers.getContractAt("CFGDistributor", DISTRIBUTOR);
  const distSeasons = await distributor.seasonCount();
  const distSeasonsPass = Number(distSeasons) === 10;
  console.log(`${distSeasonsPass ? "PASS" : "FAIL"}  Season count: ${distSeasons} (expected 10)`);
  allPass = allPass && distSeasonsPass;

  // ── CFGLPRewards seasons ───────────────────────────────────────────────
  console.log("\n── CFGLPRewards ────────────────────────────────────────────");
  const lpRewards = await ethers.getContractAt("CFGLPRewards", LP_REWARDS);
  const lpSeasons = await lpRewards.seasonCount();
  const lpSeasonsPass = Number(lpSeasons) === 10;
  console.log(`${lpSeasonsPass ? "PASS" : "FAIL"}  Season count: ${lpSeasons} (expected 10)`);
  allPass = allPass && lpSeasonsPass;

  // ── Pool whitelist ─────────────────────────────────────────────────────
  console.log("\n── ChainFundedPool ─────────────────────────────────────────");
  const pool = await ethers.getContractAt("ChainFundedPool", POOL);
  const isWhitelisted = await pool.cfndTransferWhitelist(LP_REWARDS);
  console.log(`${isWhitelisted ? "PASS" : "FAIL"}  CFGLPRewards whitelisted for CFND transfers`);
  allPass = allPass && isWhitelisted;

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  if (allPass) {
    console.log("  ALL CHECKS PASSED");
  } else {
    console.log("  SOME CHECKS FAILED — review output above");
  }
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
