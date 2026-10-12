/**
 * deploy.js — Deploy ChainFundedPool (UUPS proxy) to Sepolia (or any configured network).
 *
 * Deploys three contracts:
 *   1. CFNDToken          — LP token (owned by the proxy)
 *   2. ChainFundedPool    — implementation contract (logic only)
 *   3. ERC1967Proxy       — UUPS proxy pointing to the implementation
 *
 * The proxy address is the canonical "pool address" used everywhere.
 *
 * Required env vars (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY     — private key of the deploying wallet
 *   PAYOUT_SIGNER_ADDRESSES  — comma-separated list of payout signer wallet addresses
 *   SIGNATURE_THRESHOLD      — number of signatures required (e.g. 3 for 3-of-5)
 *   LABS_WALLET              — wallet that receives protocol revenue
 *   RPC_URL                  — RPC endpoint
 *
 * Optional:
 *   USDC_ADDRESS           — override USDC (default: official Sepolia USDC)
 *   ETHERSCAN_API_KEY      — auto-verify on Etherscan after deploy
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/deploy.js --network sepolia
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatUnits(await ethers.provider.getBalance(deployer.address), 18), "ETH");

  const usdcAddress     = process.env.USDC_ADDRESS;
  const signerAddresses = process.env.PAYOUT_SIGNER_ADDRESSES;
  const threshold       = parseInt(process.env.SIGNATURE_THRESHOLD || "0");
  const labsWallet      = process.env.LABS_WALLET;

  if (!usdcAddress)     throw new Error("USDC_ADDRESS not set");
  if (!signerAddresses) throw new Error("PAYOUT_SIGNER_ADDRESSES not set (comma-separated)");
  if (!labsWallet)      throw new Error("LABS_WALLET not set");

  const signers = signerAddresses.split(",").map(s => s.trim()).filter(Boolean);
  if (signers.length === 0) throw new Error("No signers provided");
  if (threshold <= 0 || threshold > signers.length) {
    throw new Error(`SIGNATURE_THRESHOLD (${threshold}) must be between 1 and ${signers.length}`);
  }

  console.log("\nDeploy parameters:");
  console.log("  USDC:            ", usdcAddress);
  console.log("  Payout signers:  ", signers);
  console.log("  Threshold:       ", `${threshold} of ${signers.length}`);
  console.log("  Protocol wallet: ", labsWallet);
  console.log("  Owner (deployer):", deployer.address);

  // ── Step 1: Deploy CFNDToken ──────────────────────────────────────────────
  console.log("\nStep 1/3 — Deploying CFNDToken...");
  const CFNDToken = await ethers.getContractFactory("CFNDToken");
  const cfnd = await CFNDToken.deploy(deployer.address); // temp owner — transferred to proxy
  await cfnd.waitForDeployment();
  const cfndAddress = await cfnd.getAddress();
  console.log("  CFNDToken:", cfndAddress);

  // ── Step 2: Deploy implementation ─────────────────────────────────────────
  console.log("Step 2/3 — Deploying ChainFundedPool implementation...");
  const Impl = await ethers.getContractFactory("ChainFundedPool");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const implAddress = await impl.getAddress();
  console.log("  Implementation:", implAddress);

  // ── Step 3: Deploy ERC1967Proxy with initialize() calldata ────────────────
  console.log("Step 3/3 — Deploying ERC1967Proxy...");
  const initData = Impl.interface.encodeFunctionData("initialize", [
    usdcAddress,
    cfndAddress,
    signers,
    threshold,
    labsWallet,
    deployer.address,
  ]);

  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(implAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("  Proxy (pool address):", proxyAddress);

  // ── Transfer CFNDToken ownership to the proxy ─────────────────────────────
  console.log("\nTransferring CFNDToken ownership to proxy...");
  await (await cfnd.transferOwnership(proxyAddress)).wait();
  console.log("  CFNDToken owner:", await cfnd.owner());

  // ── Verify deployment ─────────────────────────────────────────────────────
  const pool = Impl.attach(proxyAddress);
  const onChainCfnd = await pool.cfndToken();
  const onChainOwner = await pool.owner();
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ChainFundedPool (UUPS Proxy) deployed successfully");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Proxy (use this):  ", proxyAddress);
  console.log("  Implementation:    ", implAddress);
  console.log("  CFNDToken:         ", cfndAddress);
  console.log("  CFND via pool:     ", onChainCfnd);
  console.log("  Owner:             ", onChainOwner);
  console.log("═══════════════════════════════════════════════════════════");

  console.log("\n─── Update your .env ───────────────────────────────────────────────");
  console.log(`VITE_REWARDS_POOL_ADDRESS=${proxyAddress}`);
  console.log(`REWARDS_POOL_ADDRESS=${proxyAddress}`);
  console.log(`CHAINFUNDED_POOL_ADDRESS=${proxyAddress}`);
  console.log(`POOL_ADDRESS=${proxyAddress}`);
  console.log("────────────────────────────────────────────────────────────────────");

  // Auto-verify if ETHERSCAN_API_KEY is set.
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting for 5 confirmations before verifying…");
    await proxy.deploymentTransaction().wait(5);

    // Verify implementation (the actual logic contract)
    try {
      await hre.run("verify:verify", {
        address: implAddress,
        constructorArguments: [],
      });
      console.log("Implementation verified on Etherscan.");
    } catch (e) {
      console.log("Implementation verification:", e.message);
    }

    // Verify CFNDToken
    try {
      await hre.run("verify:verify", {
        address: cfndAddress,
        constructorArguments: [deployer.address],
      });
      console.log("CFNDToken verified on Etherscan.");
    } catch (e) {
      console.log("CFNDToken verification:", e.message);
    }

    // Verify proxy
    try {
      await hre.run("verify:verify", {
        address: proxyAddress,
        constructorArguments: [implAddress, initData],
      });
      console.log("Proxy verified on Etherscan.");
    } catch (e) {
      console.log("Proxy verification:", e.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
