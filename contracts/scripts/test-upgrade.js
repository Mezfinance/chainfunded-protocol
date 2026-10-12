/**
 * test-upgrade.js — UUPS upgrade for ChainFundedPool.
 *
 * Works in two modes:
 *
 *   Fork mode  (--network hardhat, MAINNET_RPC_URL set in hardhat.config.js)
 *     Impersonates the real proxy owner — no private key needed, no gas spent.
 *     Use this to verify the upgrade is safe before touching mainnet.
 *
 *   Live mode  (--network mainnet / sepolia)
 *     Signs and broadcasts via raw JSON-RPC to bypass the hardhat-ethers
 *     checkTx() bug that rejects contract-creation txs (to="").
 *     Requires DEPLOYER_PRIVATE_KEY and REWARDS_POOL_ADDRESS in .env.
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/test-upgrade.js --network hardhat    # fork test
 *   npx hardhat run scripts/test-upgrade.js --network mainnet    # live upgrade
 */

const { ethers } = require("hardhat");

async function main() {
  const proxyAddress = process.env.REWARDS_POOL_ADDRESS;
  if (!proxyAddress) throw new Error("REWARDS_POOL_ADDRESS not set");

  const network = await ethers.provider.getNetwork();
  const isLocalFork = network.chainId === 31337n;

  // Attach to proxy (read-only for now, used to get owner)
  const pool = await ethers.getContractAt("ChainFundedPool", proxyAddress);
  const ownerBefore = await pool.owner();

  // ── Resolve signer ──────────────────────────────────────────────────────────
  let deployer;
  if (isLocalFork) {
    // Impersonate the real proxy owner and give them fake ETH for gas
    await ethers.provider.send("hardhat_impersonateAccount", [ownerBefore]);
    await ethers.provider.send("hardhat_setBalance", [
      ownerBefore,
      "0x" + (100n * 10n ** 18n).toString(16),
    ]);
    deployer = await ethers.getSigner(ownerBefore);
  } else {
    // Raw ethers.Wallet (not a HardhatEthersSigner) — supports signTransaction()
    if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");
    deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, ethers.provider);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  UUPS Upgrade Test", isLocalFork ? "(mainnet fork)" : "(live)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Proxy:   ", proxyAddress);
  console.log("  Deployer:", deployer.address);

  // Read state before upgrade
  const labsBefore      = await pool.labsWallet();
  const thresholdBefore = await pool.signatureThreshold();
  const rulesBefore     = await pool.defaultMaxDailyLossBps();
  const cfndBefore      = await pool.cfndToken();

  console.log("\n── State before upgrade ──");
  console.log("  Owner:            ", ownerBefore);
  console.log("  Labs wallet:      ", labsBefore);
  console.log("  Sig threshold:    ", thresholdBefore.toString());
  console.log("  Max daily loss:   ", rulesBefore.toString(), "BPS");
  console.log("  CFND token:       ", cfndBefore);

  // ── Deploy new implementation ───────────────────────────────────────────────
  console.log("\n── Deploying new implementation ──");
  const Impl = await ethers.getContractFactory("ChainFundedPool", deployer);
  const nonce = await deployer.getNonce();
  const newImplAddress = ethers.getCreateAddress({ from: deployer.address, nonce });
  const deployTxData = await Impl.getDeployTransaction();

  let deployHash;
  if (isLocalFork) {
    // Local fork: regular sendTransaction works fine
    const tx = await deployer.sendTransaction(deployTxData);
    deployHash = tx.hash;
    await tx.wait();
  } else {
    // Live network: sign raw tx and broadcast, bypassing hardhat-ethers checkTx bug
    const populated = await deployer.populateTransaction(deployTxData);
    const signed    = await deployer.signTransaction(populated);
    deployHash = await ethers.provider.send("eth_sendRawTransaction", [signed]);
    // waitForTransaction is not implemented on HardhatEthersProvider for live networks;
    // poll eth_getTransactionReceipt directly until mined.
    process.stdout.write("  Waiting for deploy tx to mine");
    let receipt = null;
    while (!receipt) {
      await new Promise((r) => setTimeout(r, 3000));
      receipt = await ethers.provider.send("eth_getTransactionReceipt", [deployHash]);
      process.stdout.write(".");
    }
    console.log(" confirmed (block", parseInt(receipt.blockNumber, 16), ")");
  }

  console.log("  Deploy tx:", deployHash);
  console.log("  New implementation:", newImplAddress);

  // ── Upgrade proxy ───────────────────────────────────────────────────────────
  console.log("\n── Upgrading proxy ──");
  const poolOwned = pool.connect(deployer);
  const upgradeTx = await poolOwned.upgradeToAndCall(newImplAddress, "0x");
  console.log("  tx:", upgradeTx.hash);
  await upgradeTx.wait();
  console.log("  Upgrade successful!");

  // ── Verify state preserved ──────────────────────────────────────────────────
  const ownerAfter     = await pool.owner();
  const labsAfter      = await pool.labsWallet();
  const thresholdAfter = await pool.signatureThreshold();
  const rulesAfter     = await pool.defaultMaxDailyLossBps();
  const cfndAfter      = await pool.cfndToken();

  console.log("\n── State after upgrade ──");
  console.log("  Owner:            ", ownerAfter);
  console.log("  Labs wallet:      ", labsAfter);
  console.log("  Sig threshold:    ", thresholdAfter.toString());
  console.log("  Max daily loss:   ", rulesAfter.toString(), "BPS");
  console.log("  CFND token:       ", cfndAfter);

  const allMatch =
    ownerBefore    === ownerAfter    &&
    labsBefore     === labsAfter     &&
    thresholdBefore === thresholdAfter &&
    rulesBefore    === rulesAfter    &&
    cfndBefore     === cfndAfter;

  console.log("\n═══════════════════════════════════════════════════════════");
  if (allMatch) {
    console.log("  ✓ UPGRADE TEST PASSED — all state preserved");
  } else {
    console.log("  ✗ UPGRADE TEST FAILED — state mismatch!");
    process.exitCode = 1;
  }
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
