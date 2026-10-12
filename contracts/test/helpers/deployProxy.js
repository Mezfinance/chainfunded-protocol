const { ethers } = require("hardhat");

/**
 * Deploy ChainFundedPool behind a UUPS proxy.
 *
 * 1. Deploys CFNDToken (owned by the proxy address — computed ahead of time via CREATE2 nonce)
 * 2. Deploys the implementation contract
 * 3. Deploys ERC1967Proxy pointing to the implementation with initialize() calldata
 * 4. Returns the pool contract instance attached to the proxy address
 */
async function deployPoolProxy(usdcAddress, signers, threshold, labsWallet, owner) {
  // 1. Deploy the implementation (no initializer call — the constructor disables it)
  const Impl = await ethers.getContractFactory("ChainFundedPool");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();

  // 2. Deploy CFNDToken — we need to know the proxy address first.
  //    Deploy with owner as a temp owner, then transfer to proxy after.
  const CFNDToken = await ethers.getContractFactory("CFNDToken");
  const cfnd = await CFNDToken.deploy(owner);
  await cfnd.waitForDeployment();

  // 3. Encode the initialize call
  const initData = Impl.interface.encodeFunctionData("initialize", [
    usdcAddress,
    await cfnd.getAddress(),
    signers,
    threshold,
    labsWallet,
    owner,
  ]);

  // 4. Deploy the ERC1967Proxy
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();

  // 5. Transfer CFNDToken ownership to the proxy (pool needs to mint/burn)
  await cfnd.transferOwnership(await proxy.getAddress());

  // 6. Return the pool interface attached to the proxy address
  const pool = Impl.attach(await proxy.getAddress());

  return { pool, cfnd, impl, proxy };
}

module.exports = { deployPoolProxy };
