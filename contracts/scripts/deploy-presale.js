/**
 * deploy-presale.js
 *
 * Deploys CFGPresale (10-tier step-pricing $CFG presale, USDC settlement).
 * The 2,500,000 CFG that backs claims is transferred in SEPARATELY from your
 * Safe after deploy — the deployer wallet only needs ETH for gas.
 *
 * Required env vars:
 *   CFG_TOKEN_ADDRESS     – deployed CFGToken address
 *   TREASURY_ADDRESS      – Safe that receives net USDC proceeds
 *   DEPLOYER_PRIVATE_KEY  – key with ETH for gas (in hardhat.config network)
 *
 * Optional env vars:
 *   USDC_ADDRESS          – defaults to Ethereum-mainnet USDC
 *   OWNER_ADDRESS         – admin (pause/finalize/setTGE); defaults to TREASURY_ADDRESS
 *
 * Usage:
 *   npx hardhat run scripts/deploy-presale.js --network mainnet
 */

const { ethers } = require("hardhat");

const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const PRESALE_CFG = ethers.parseEther("2500000"); // 2.5M CFG to fund claims

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const CFG_TOKEN_ADDRESS = process.env.CFG_TOKEN_ADDRESS;
  const TREASURY_ADDRESS  = process.env.TREASURY_ADDRESS;
  const USDC_ADDRESS      = process.env.USDC_ADDRESS || MAINNET_USDC;
  const OWNER_ADDRESS     = process.env.OWNER_ADDRESS || TREASURY_ADDRESS;

  if (!CFG_TOKEN_ADDRESS) throw new Error("CFG_TOKEN_ADDRESS env var is required");
  if (!TREASURY_ADDRESS)  throw new Error("TREASURY_ADDRESS env var is required");

  console.log("\nConstructor args:");
  console.log("  CFG token :", CFG_TOKEN_ADDRESS);
  console.log("  USDC      :", USDC_ADDRESS);
  console.log("  treasury  :", TREASURY_ADDRESS);
  console.log("  owner     :", OWNER_ADDRESS);

  console.log("\nDeploying CFGPresale...");
  const CFGPresale = await ethers.getContractFactory("CFGPresale");
  const presale = await CFGPresale.deploy(
    CFG_TOKEN_ADDRESS,
    USDC_ADDRESS,
    TREASURY_ADDRESS,
    OWNER_ADDRESS
  );
  await presale.waitForDeployment();
  const addr = await presale.getAddress();
  console.log("✅ CFGPresale deployed at:", addr);

  // Sanity: confirm tier maths on-chain
  const t0 = await presale.tierPrice(0);
  const t9 = await presale.tierPrice(9);
  console.log(`   tier 1 price: ${t0} (6dp USDC, = $${Number(t0) / 1e6})`);
  console.log(`   tier 10 price: ${t9} (= $${Number(t9) / 1e6})`);

  console.log("\n── NEXT STEPS ──────────────────────────────────────────────");
  console.log("1) From your Safe, transfer 2,500,000 CFG to the presale:");
  console.log(`     token : ${CFG_TOKEN_ADDRESS}`);
  console.log(`     to    : ${addr}`);
  console.log(`     amount: ${PRESALE_CFG} (2,500,000 e18)`);
  console.log("2) Set frontend env:");
  console.log(`     VITE_PRESALE_ADDRESS=${addr}`);
  console.log(`     VITE_CFG_TOKEN_ADDRESS=${CFG_TOKEN_ADDRESS}`);
  console.log("3) (optional) pause() from the Safe until you're ready to open.");
  console.log("4) At listing: setTGE(<unix ts>) from the Safe to open claiming.");
  console.log("5) Verify:");
  console.log(`     npx hardhat verify --network mainnet ${addr} \\`);
  console.log(`       ${CFG_TOKEN_ADDRESS} ${USDC_ADDRESS} ${TREASURY_ADDRESS} ${OWNER_ADDRESS}`);
  console.log("────────────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
