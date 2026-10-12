/**
 * Whitelister.test.js — the timelock-bypass whitelister role + open-tier guard
 * added to ChainFundedPool.adminRegisterChallenge.
 *
 * Run:  npx hardhat test test/Whitelister.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployPoolProxy } = require("./helpers/deployProxy");

function usdc(n) { return BigInt(n) * 1_000_000n; }

describe("Whitelister role + open-tier guard", function () {
  let pool, usdcToken;
  let owner, whitelister, stranger, trader;
  let id = 0;
  const nextId = () => `wl-${++id}`;

  beforeEach(async function () {
    [owner, whitelister, stranger, trader, signer, labs] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdcToken = await MockUSDC.deploy(owner.address);
    ({ pool } = await deployPoolProxy(
      await usdcToken.getAddress(), [signer.address], 1, labs.address, owner.address
    ));
  });

  it("defaults the whitelister to the owner on init", async function () {
    expect(await pool.whitelister()).to.equal(owner.address);
  });

  it("owner can whitelist an open tier ($1,000, no TVL gate)", async function () {
    await expect(pool.connect(owner).adminRegisterChallenge(trader.address, nextId(), usdc(1000), 1))
      .to.emit(pool, "ChallengeRegistered");
  });

  it("a stranger cannot whitelist", async function () {
    await expect(
      pool.connect(stranger).adminRegisterChallenge(trader.address, nextId(), usdc(1000), 1)
    ).to.be.revertedWithCustomError(pool, "NotWhitelisterOrOwner");
  });

  it("only the owner can set the whitelister", async function () {
    await expect(pool.connect(stranger).updateWhitelister(whitelister.address))
      .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
    await expect(pool.connect(owner).updateWhitelister(whitelister.address))
      .to.emit(pool, "WhitelisterUpdated").withArgs(owner.address, whitelister.address);
    expect(await pool.whitelister()).to.equal(whitelister.address);
  });

  it("the whitelister can whitelist directly (bypassing owner/timelock), a stranger still can't", async function () {
    await pool.connect(owner).updateWhitelister(whitelister.address);
    await expect(pool.connect(whitelister).adminRegisterChallenge(trader.address, nextId(), usdc(1000), 1))
      .to.emit(pool, "ChallengeRegistered");
    await expect(
      pool.connect(stranger).adminRegisterChallenge(trader.address, nextId(), usdc(1000), 1)
    ).to.be.revertedWithCustomError(pool, "NotWhitelisterOrOwner");
  });

  it("revoking the whitelister (address 0) removes its access", async function () {
    await pool.connect(owner).updateWhitelister(whitelister.address);
    await pool.connect(owner).updateWhitelister(ethers.ZeroAddress);
    expect(await pool.whitelister()).to.equal(ethers.ZeroAddress);
    await expect(
      pool.connect(whitelister).adminRegisterChallenge(trader.address, nextId(), usdc(1000), 1)
    ).to.be.revertedWithCustomError(pool, "NotWhitelisterOrOwner");
  });

  it("rejects a size that isn't an enabled tier", async function () {
    await expect(
      pool.connect(owner).adminRegisterChallenge(trader.address, nextId(), usdc(7000), 1)
    ).to.be.revertedWithCustomError(pool, "TierNotEnabled");
  });

  it("rejects an enabled tier that is still TVL-locked ($10k needs $100k TVL)", async function () {
    await expect(
      pool.connect(owner).adminRegisterChallenge(trader.address, nextId(), usdc(10000), 1)
    ).to.be.revertedWithCustomError(pool, "TvlTooLow");
  });

  it("still honours the permanent adminRegisterDisabled kill-switch", async function () {
    await pool.connect(owner).updateWhitelister(whitelister.address);
    await pool.connect(owner).disableAdminRegister();
    await expect(
      pool.connect(whitelister).adminRegisterChallenge(trader.address, nextId(), usdc(1000), 1)
    ).to.be.revertedWithCustomError(pool, "AdminRegisterPermanentlyDisabled");
  });
});
