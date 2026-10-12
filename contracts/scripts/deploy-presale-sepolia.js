/**
 * deploy-presale-sepolia.js
 *
 * Sepolia bootstrap to test the CFG presale end-to-end. Deploys:
 *   1. CFGToken (testnet) — mints the full 100M to the deployer
 *   2. CFGPresale         — treasury = owner = deployer (so you can pause/setTGE)
 * then funds the presale with 2,500,000 CFG. Reuses your EXISTING Sepolia mock
 * USDC (no new USDC is deployed).
 *
 * Required env (.env in contracts/):
 *   RPC_URL               – a Sepolia RPC endpoint
 *   DEPLOYER_PRIVATE_KEY  – test wallet with Sepolia ETH (use a faucet)
 * Optional:
 *   USDC_ADDRESS          – your Sepolia mock USDC (defaults to the one in .env.example)
 *   ETHERSCAN_API_KEY     – for verification
 *
 * Run:
 *   npx hardhat run scripts/deploy-presale-sepolia.js --network sepolia
 */

const { ethers } = require("hardhat");

// Sepolia mock USDC (from .env.example); override with USDC_ADDRESS env.
const SEPOLIA_USDC = "0x144836C46f9b5d9CDb67aC5b4c299DeFa713FFe6"; // ChainFunded Sepolia mock USDC

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddr = process.env.USDC_ADDRESS || SEPOLIA_USDC;

  console.log("Deployer:", deployer.address);
  console.log("ETH:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("USDC (existing mock):", usdcAddr);

  // 1. Testnet CFG token (real CFGToken contract) — full supply to deployer
  console.log("\nDeploying CFGToken (testnet)…");
  const CFGToken = await ethers.getContractFactory("CFGToken");
  const cfg = await CFGToken.deploy(deployer.address);
  await cfg.waitForDeployment();
  await (await cfg.initialMint([deployer.address], [ethers.parseEther("100000000")])).wait();
  const cfgAddr = await cfg.getAddress();
  console.log("  CFGToken:", cfgAddr);

  // 2. Presale — deployer is treasury + owner for testing
  console.log("Deploying CFGPresale…");
  const CFGPresale = await ethers.getContractFactory("CFGPresale");
  const presale = await CFGPresale.deploy(cfgAddr, usdcAddr, deployer.address, deployer.address);
  await presale.waitForDeployment();
  const presaleAddr = await presale.getAddress();
  const deployBlock =
    presale.deploymentTransaction()?.blockNumber ?? (await ethers.provider.getBlockNumber());
  console.log("  CFGPresale:", presaleAddr, "(block", deployBlock + ")");

  // 3. Fund presale with the 2.5M CFG that backs claims
  await (await cfg.transfer(presaleAddr, ethers.parseEther("2500000"))).wait();
  console.log("  Funded presale with 2,500,000 CFG");

  console.log("\n── FRONTEND ENV (Sepolia) ──────────────────────────────────");
  console.log("VITE_CHAIN_ID=11155111");
  console.log(`VITE_PRESALE_ADDRESS=${presaleAddr}`);
  console.log(`VITE_CFG_TOKEN_ADDRESS=${cfgAddr}`);
  console.log(`VITE_USDC_ADDRESS=${usdcAddr}`);
  console.log(`VITE_PRESALE_DEPLOY_BLOCK=${deployBlock}`);
  console.log("────────────────────────────────────────────────────────────");
  console.log("• Make sure your test wallet holds some of that mock USDC to try buys.");
  console.log("• Verify (optional):");
  console.log(`    npx hardhat verify --network sepolia ${presaleAddr} ${cfgAddr} ${usdcAddr} ${deployer.address} ${deployer.address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
