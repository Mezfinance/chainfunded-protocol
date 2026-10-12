/**
 * integration.test.js — Full lifecycle integration test
 *
 * Simulates the complete deployment + usage flow:
 *   1. Deploy all contracts (mirrors deploy-all-governance.js)
 *   2. Register challenges on the pool
 *   3. Record registrations on CFGDistributor (with on-chain verification)
 *   4. Finalize season, claim CFG
 *   5. Stake CFND, earn CFG + USDC, claim, unstake
 *   6. Vesting: cliff, release, delegation
 *   7. Governance: Timelock holds correct balance, admin revoked
 *   8. Edge cases + security checks
 *
 * Run:  npx hardhat test test/integration.test.js
 */

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { time }        = require("@nomicfoundation/hardhat-network-helpers");

const DAY  = 86_400;
const YEAR = 365 * DAY;
const SEASON_DURATION = 182 * DAY;

function usdc(n)  { return BigInt(n) * 1_000_000n; }
function cfg(n)   { return ethers.parseEther(String(n)); }
function mkId(seed) { return seed.toString(16).padStart(24, "0"); }

describe("Full Lifecycle Integration", function () {
  // Contracts
  let usdcToken, cfgToken, pool, timelock, governor;
  let distributor, lpRewards;
  let vestTeam, vestAdvisor, vestInvestor;

  // Signers
  let deployer, payoutSigner, labsWallet;
  let teamMember, advisor, investor;
  let trader1, trader2, trader3;
  let reporter;

  // Timing
  let season1Start;

  before(async function () {
    [deployer, payoutSigner, labsWallet, teamMember, advisor, investor,
     trader1, trader2, trader3, reporter] = await ethers.getSigners();

    // ═══════════════════════════════════════════════════════════════════════
    // DEPLOY EVERYTHING (mirrors deploy-all-governance.js)
    // ═══════════════════════════════════════════════════════════════════════

    // Mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdcToken = await MockUSDC.deploy(deployer.address);

    // ChainFundedPool (UUPS proxy)
    const { deployPoolProxy } = require("./helpers/deployProxy");
    const proxyResult = await deployPoolProxy(
      await usdcToken.getAddress(), [payoutSigner.address], 1, labsWallet.address, deployer.address
    );
    pool = proxyResult.pool;

    // TimelockController
    const Timelock = await ethers.getContractFactory("TimelockController");
    timelock = await Timelock.deploy(60, [], [], deployer.address);

    // CFGToken
    const CFGToken = await ethers.getContractFactory("CFGToken");
    cfgToken = await CFGToken.deploy(deployer.address);

    // CFGGovernor
    const Governor = await ethers.getContractFactory("CFGGovernor");
    governor = await Governor.deploy(
      await cfgToken.getAddress(),
      await timelock.getAddress(),
      10, 50, ethers.parseEther("1")
    );

    // Grant roles
    const PROPOSER_ROLE  = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE  = await timelock.EXECUTOR_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const ADMIN_ROLE     = await timelock.DEFAULT_ADMIN_ROLE();
    await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
    await (await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress())).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();
    await (await timelock.revokeRole(ADMIN_ROLE, deployer.address)).wait();

    // Vesting contracts
    const Vesting = await ethers.getContractFactory("CFGVesting");
    const now = BigInt(await time.latest());
    const vestStart = now + 10n;

    vestTeam = await Vesting.deploy(
      await cfgToken.getAddress(), teamMember.address, cfg("20000000"),
      vestStart, BigInt(182 * DAY), BigInt(4 * YEAR)
    );
    vestAdvisor = await Vesting.deploy(
      await cfgToken.getAddress(), advisor.address, cfg("1800000"),
      vestStart, 0n, BigInt(YEAR)
    );
    vestInvestor = await Vesting.deploy(
      await cfgToken.getAddress(), investor.address, cfg("1800000"),
      vestStart, 0n, BigInt(YEAR)
    );

    // CFGDistributor
    const Distributor = await ethers.getContractFactory("CFGDistributor");
    distributor = await Distributor.deploy(
      await cfgToken.getAddress(),
      await pool.getAddress(),
      deployer.address
    );

    // CFGLPRewards
    const LPRewards = await ethers.getContractFactory("CFGLPRewards");
    lpRewards = await LPRewards.deploy(
      await cfgToken.getAddress(),
      await pool.getAddress(),
      await usdcToken.getAddress(),
      deployer.address
    );

    // initialMint — distribute 100M CFG
    const timelockAddr = await timelock.getAddress();
    const recipients = [
      timelockAddr,                       // 51M (treasury + airdrop)
      deployer.address,                   // 25M (temp: 15M distributor + 10M LP)
      await vestTeam.getAddress(),        // 20M
      await vestAdvisor.getAddress(),     //  1.8M (90% advisor vesting)
      advisor.address,                    //  0.2M (10% advisor TGE)
      await vestInvestor.getAddress(),    //  1.8M (90% investor vesting)
      investor.address,                   //  0.2M (10% investor TGE)
    ];
    const amounts = [
      cfg("51000000"),
      cfg("25000000"),
      cfg("20000000"),
      cfg("1800000"),
      cfg("200000"),
      cfg("1800000"),
      cfg("200000"),
    ];
    await (await cfgToken.initialMint(recipients, amounts)).wait();

    // Fund distributor + LP rewards
    await (await cfgToken.transfer(await distributor.getAddress(), cfg("15000000"))).wait();
    await (await cfgToken.transfer(await lpRewards.getAddress(), cfg("10000000"))).wait();

    // Whitelist LP rewards on pool
    await (await pool.setCfndTransferWhitelist(await lpRewards.getAddress(), true)).wait();

    // Set reporter
    await (await distributor.setReporter(reporter.address, true)).wait();

    // Create season 1 for both contracts
    const latest = BigInt(await time.latest());
    season1Start = latest + 3600n;

    await distributor.createSeason(season1Start, 0);
    await lpRewards.startSeason(season1Start, 0);

    // Fund traders and LPs with USDC
    for (const t of [trader1, trader2, trader3]) {
      await usdcToken.transfer(t.address, usdc(1_000_000));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEPLOYMENT VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("1. Deployment verification", function () {
    it("deployer has 0 CFG remaining", async function () {
      expect(await cfgToken.balanceOf(deployer.address)).to.equal(0);
    });

    it("Timelock holds 51M CFG (treasury + airdrop reserve)", async function () {
      const bal = await cfgToken.balanceOf(await timelock.getAddress());
      expect(bal).to.equal(cfg("51000000"));
    });

    it("CFGDistributor holds 15M CFG", async function () {
      expect(await cfgToken.balanceOf(await distributor.getAddress())).to.equal(cfg("15000000"));
    });

    it("CFGLPRewards holds 10M CFG", async function () {
      expect(await cfgToken.balanceOf(await lpRewards.getAddress())).to.equal(cfg("10000000"));
    });

    it("vesting contracts hold correct amounts", async function () {
      expect(await cfgToken.balanceOf(await vestTeam.getAddress())).to.equal(cfg("20000000"));
      expect(await cfgToken.balanceOf(await vestAdvisor.getAddress())).to.equal(cfg("1800000"));
      expect(await cfgToken.balanceOf(await vestInvestor.getAddress())).to.equal(cfg("1800000"));
    });

    it("investor TGE wallet received 200K CFG", async function () {
      expect(await cfgToken.balanceOf(investor.address)).to.equal(cfg("200000"));
    });

    it("total supply is exactly 100M", async function () {
      expect(await cfgToken.totalSupply()).to.equal(cfg("100000000"));
    });

    it("initialMint cannot be called again", async function () {
      await expect(
        cfgToken.initialMint([deployer.address], [cfg("1")])
      ).to.be.revertedWith("Initial mint already completed");
    });

    it("deployer admin role revoked from Timelock", async function () {
      const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
      expect(await timelock.hasRole(ADMIN_ROLE, deployer.address)).to.be.false;
    });

    it("Governor has PROPOSER and CANCELLER roles", async function () {
      const govAddr = await governor.getAddress();
      expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), govAddr)).to.be.true;
      expect(await timelock.hasRole(await timelock.CANCELLER_ROLE(), govAddr)).to.be.true;
    });

    it("CFGLPRewards is whitelisted on pool", async function () {
      expect(await pool.cfndTransferWhitelist(await lpRewards.getAddress())).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TRADER REWARDS — FULL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("2. Trader rewards — full flow", function () {
    before(async function () {
      // LP deposits so pool has TVL for challenge registration
      await usdcToken.connect(trader3).approve(await pool.getAddress(), usdc(500_000));
      await pool.connect(trader3).deposit(usdc(500_000), 0);

      // Move to season 1
      await time.increaseTo(season1Start);
    });

    it("register paid challenge on pool", async function () {
      await usdcToken.connect(trader1).approve(await pool.getAddress(), usdc(30));
      await pool.connect(trader1).registerChallenge(
        usdc(30), mkId(1), usdc(1_000), 1, ethers.ZeroAddress, 0
      );
      const challenge = await pool.getChallenge(mkId(1));
      expect(challenge.trader).to.equal(trader1.address);
      expect(challenge.accountSizeUsdc).to.equal(usdc(1_000));
    });

    it("recordRegistration succeeds with on-chain verification", async function () {
      await distributor.connect(reporter).recordRegistration(mkId(1), false);
      const reg = await distributor.registrations(1);
      expect(reg.trader).to.equal(trader1.address);
      expect(reg.accountSizeUsdc).to.equal(usdc(1_000));
      expect(reg.phase).to.equal(1);
    });

    it("recordRegistration reverts for fake accountId", async function () {
      await expect(
        distributor.connect(reporter).recordRegistration(mkId(999), false)
      ).to.be.revertedWithCustomError(distributor, "ChallengeNotFound");
    });

    it("recordRegistration reverts for duplicate accountId", async function () {
      await expect(
        distributor.connect(reporter).recordRegistration(mkId(1), false)
      ).to.be.revertedWithCustomError(distributor, "AccountAlreadyRecorded");
    });

    it("recordRegistration is permissionless (anyone can call)", async function () {
      await usdcToken.connect(trader2).approve(await pool.getAddress(), usdc(30));
      await pool.connect(trader2).registerChallenge(
        usdc(30), mkId(2), usdc(1_000), 1, ethers.ZeroAddress, 0
      );
      // non-reporter can register
      await distributor.connect(trader1).recordRegistration(mkId(2), false);
      const regCount = await distributor.registrationCount();
      expect(regCount).to.be.gt(0);
    });

    it("whitelist account gets 50% points", async function () {
      // Admin register (whitelist)
      await pool.adminRegisterChallenge(trader2.address, mkId(3), usdc(1_000), 1);
      await distributor.connect(reporter).recordRegistration(mkId(3), true);

      // Paid account for comparison
      await usdcToken.connect(trader3).approve(await pool.getAddress(), usdc(30));
      await pool.connect(trader3).registerChallenge(usdc(30), mkId(4), usdc(1_000), 1, ethers.ZeroAddress, 0);
      await distributor.connect(reporter).recordRegistration(mkId(4), false);

      // Find the two registrations we just made
      const regCount = await distributor.registrationCount();
      const regWl   = await distributor.registrations(regCount - 1n);
      const regPaid = await distributor.registrations(regCount);
      expect(regWl.isWhitelist).to.be.true;
      expect(regPaid.isWhitelist).to.be.false;
      expect(regWl.points).to.equal(regPaid.points / 2n);
    });

    it("batch registration works with mix of real + fake", async function () {
      await usdcToken.connect(trader1).approve(await pool.getAddress(), usdc(30));
      await pool.connect(trader1).registerChallenge(
        usdc(30), mkId(5), usdc(1_000), 1, ethers.ZeroAddress, 0
      );

      const countBefore = await distributor.registrationCount();
      await distributor.connect(reporter).recordRegistrationBatch(
        [mkId(5), mkId(888)], // real + fake
        [false, false]
      );
      const countAfter = await distributor.registrationCount();
      expect(countAfter - countBefore).to.equal(1); // only real one recorded
    });

    it("activeSeason returns correct ID", async function () {
      expect(await distributor.activeSeason()).to.equal(1);
    });

    it("finalize season, preview, and claim CFG", async function () {
      const s1 = await distributor.seasons(1);
      await time.increaseTo(s1.endTime);
      await distributor.finalizeSeason(1);
      expect((await distributor.seasons(1)).finalized).to.be.true;

      // Preview
      const [cfgAmount, pts] = await distributor.previewClaim(1, trader1.address);
      expect(cfgAmount).to.be.gt(0);
      expect(pts).to.be.gt(0);

      // Claim
      const before = await cfgToken.balanceOf(trader1.address);
      await distributor.connect(trader1).claim(1);
      const after = await cfgToken.balanceOf(trader1.address);
      expect(after - before).to.equal(cfgAmount);
    });

    it("double claim reverts", async function () {
      await expect(
        distributor.connect(trader1).claim(1)
      ).to.be.revertedWithCustomError(distributor, "NothingToClaim");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. LP STAKING — FULL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("3. LP staking — full flow", function () {
    let cfndToken;

    before(async function () {
      const cfndAddr = await pool.cfndTokenAddress();
      cfndToken = await ethers.getContractAt("CFNDToken", cfndAddr);

      // Create season 2 for LP rewards (season 1 may have ended above)
      const latest = BigInt(await time.latest());
      const s2Start = latest + 3600n;
      await lpRewards.startSeason(s2Start, 0);
      await time.increaseTo(s2Start);
    });

    it("stake CFND — moves tokens to rewards contract", async function () {
      const stakeAmt = usdc(50_000);
      const cfndBefore = await cfndToken.balanceOf(trader3.address);

      await lpRewards.connect(trader3).stake(stakeAmt);

      expect(await cfndToken.balanceOf(trader3.address)).to.equal(cfndBefore - stakeAmt);
      expect(await lpRewards.stakedBalance(trader3.address)).to.equal(stakeAmt);
      expect(await lpRewards.totalStaked()).to.equal(stakeAmt);
    });

    it("CFG rewards accrue over time", async function () {
      await time.increase(DAY * 7);
      const earned = await lpRewards.earnedCfg(trader3.address);
      expect(earned).to.be.gt(0);
    });

    it("claimCfgReward transfers CFG", async function () {
      const before = await cfgToken.balanceOf(trader3.address);
      await lpRewards.connect(trader3).claimCfgReward();
      const after = await cfgToken.balanceOf(trader3.address);
      expect(after - before).to.be.gt(0);
    });

    it("harvestPoolProfit distributes USDC to stakers", async function () {
      // Generate pool profit via challenge fee
      await usdcToken.connect(trader1).approve(await pool.getAddress(), usdc(30));
      await pool.connect(trader1).registerChallenge(
        usdc(30), mkId(50), usdc(1_000), 1, ethers.ZeroAddress, 0
      );

      // Check if rewards contract has pending profit
      const pending = await pool.pendingProfit(await lpRewards.getAddress());
      if (pending > 0n) {
        await lpRewards.harvestPoolProfit();
        const earned = await lpRewards.earnedUsdc(trader3.address);
        expect(earned).to.be.gt(0);
      }
    });

    it("claimUsdcProfit transfers USDC", async function () {
      const earned = await lpRewards.earnedUsdc(trader3.address);
      if (earned > 0n) {
        const before = await usdcToken.balanceOf(trader3.address);
        await lpRewards.connect(trader3).claimUsdcProfit();
        const after = await usdcToken.balanceOf(trader3.address);
        expect(after - before).to.be.gt(0);
      }
    });

    it("unstake returns CFND", async function () {
      const staked = await lpRewards.stakedBalance(trader3.address);
      const cfndBefore = await cfndToken.balanceOf(trader3.address);

      await lpRewards.connect(trader3).unstake(staked);

      expect(await lpRewards.stakedBalance(trader3.address)).to.equal(0);
      expect(await lpRewards.totalStaked()).to.equal(0);
      expect(await cfndToken.balanceOf(trader3.address)).to.equal(cfndBefore + staked);
    });

    it("exit() unstakes all + claims both rewards", async function () {
      // Stake again
      await lpRewards.connect(trader3).stake(usdc(10_000));
      await time.increase(DAY * 3);

      const cfgBefore = await cfgToken.balanceOf(trader3.address);
      await lpRewards.connect(trader3).exit();
      const cfgAfter = await cfgToken.balanceOf(trader3.address);

      expect(await lpRewards.stakedBalance(trader3.address)).to.equal(0);
      expect(cfgAfter).to.be.gte(cfgBefore); // received CFG (or 0 if tiny)
    });

    it.skip("no NEW rewards accrue during gap between seasons (tested in CFGLPRewards.test.js)", async function () {
      // Create a far-future season
      const futureStart = BigInt(await time.latest()) + BigInt(365 * DAY);
      await lpRewards.startSeason(futureStart, 0);

      await lpRewards.connect(trader3).stake(usdc(10_000));

      // Trigger a checkpoint to flush any prior-season carryover
      await lpRewards.connect(trader3).claimCfgReward();

      // Now snapshot — should be 0 after claiming
      const earnedAtStake = await lpRewards.earnedCfg(trader3.address);

      // Advance 1 day in the gap
      await time.increase(DAY);

      const earnedAfterDay = await lpRewards.earnedCfg(trader3.address);
      expect(earnedAfterDay).to.equal(earnedAtStake); // unchanged — no active season

      // Clean up
      await lpRewards.connect(trader3).unstake(usdc(10_000));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. TRANSFER WHITELIST
  // ═══════════════════════════════════════════════════════════════════════════

  describe("4. Transfer whitelist", function () {
    it("non-whitelisted address cannot call transferCfnd", async function () {
      await expect(
        pool.connect(trader1).transferCfnd(trader1.address, trader2.address, usdc(100))
      ).to.be.revertedWithCustomError(pool, "CallerNotWhitelisted");
    });

    it("only owner can set whitelist", async function () {
      await expect(
        pool.connect(trader1).setCfndTransferWhitelist(trader1.address, true)
      ).to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. VESTING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("5. Vesting", function () {
    it("team vesting: has vested some tokens (cliff passed during earlier tests)", async function () {
      // Time has advanced past the cliff due to season finalization in earlier tests
      const vested = await vestTeam.vestedAmount();
      expect(vested).to.be.gt(0);
      // But not fully vested (4 years total)
      expect(vested).to.be.lt(cfg("20000000"));
    });

    it("team vesting: release transfers tokens to beneficiary", async function () {
      const releasable = await vestTeam.releasable();
      expect(releasable).to.be.gt(0);

      const before = await cfgToken.balanceOf(teamMember.address);
      await vestTeam.release();
      const after = await cfgToken.balanceOf(teamMember.address);
      expect(after - before).to.be.gt(0);
    });

    it("team vesting: second release only transfers newly vested", async function () {
      // Immediately after first release, releasable should be ~0
      const releasableNow = await vestTeam.releasable();

      // Advance time so more vests
      await time.increase(30 * DAY);
      const releasableLater = await vestTeam.releasable();
      expect(releasableLater).to.be.gt(releasableNow);

      const before = await cfgToken.balanceOf(teamMember.address);
      await vestTeam.release();
      const after = await cfgToken.balanceOf(teamMember.address);
      expect(after - before).to.be.gt(0);
    });

    it("investor vesting: vests immediately (0 cliff)", async function () {
      const vested = await vestInvestor.vestedAmount();
      expect(vested).to.be.gt(0);
    });

    it("delegateHeld: only beneficiary can call", async function () {
      await expect(
        vestTeam.connect(deployer).delegateHeld(deployer.address)
      ).to.be.revertedWith("Not beneficiary");
    });

    it("delegateHeld: delegates voting power", async function () {
      const powerBefore = await cfgToken.getVotes(teamMember.address);
      await vestTeam.connect(teamMember).delegateHeld(teamMember.address);
      const powerAfter = await cfgToken.getVotes(teamMember.address);
      expect(powerAfter).to.be.gt(powerBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. EDGE CASES + SECURITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("6. Edge cases + security", function () {
    it("recoverUnclaimedCfg works on empty season", async function () {
      // Create a new season in the distributor, finalize it with 0 registrations
      const latest = BigInt(await time.latest());
      const s2Start = latest + 3600n;
      await distributor.createSeason(s2Start, 0);
      const s2 = await distributor.seasons(2);
      await time.increaseTo(s2.endTime);
      await distributor.finalizeSeason(2);

      const budget = s2.cfgBudget;
      const before = await cfgToken.balanceOf(deployer.address);
      await distributor.recoverUnclaimedCfg(2, deployer.address);
      const after = await cfgToken.balanceOf(deployer.address);
      expect(after - before).to.equal(budget);
    });

    it("recoverUnclaimedCfg reverts on season with participants", async function () {
      await expect(
        distributor.recoverUnclaimedCfg(1, deployer.address)
      ).to.be.revertedWith("CFGDistributor: season has participants");
    });

    it("season cannot start in the past (distributor)", async function () {
      const past = BigInt(await time.latest()) - 100n;
      await expect(
        distributor.createSeason(past, 0)
      ).to.be.revertedWithCustomError(distributor, "InvalidStartTime");
    });

    it("season cannot start in the past (LP rewards)", async function () {
      const past = BigInt(await time.latest()) - 100n;
      await expect(
        lpRewards.startSeason(past, 0)
      ).to.be.revertedWithCustomError(lpRewards, "InvalidStartTime");
    });

    it("reporter role can be revoked", async function () {
      await distributor.setReporter(reporter.address, false);
      expect(await distributor.reporters(reporter.address)).to.be.false;
      // Restore for other tests
      await distributor.setReporter(reporter.address, true);
    });

    it("non-owner cannot set reporter", async function () {
      await expect(
        distributor.connect(trader1).setReporter(trader1.address, true)
      ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
    });

    it("non-owner cannot create seasons", async function () {
      const future = BigInt(await time.latest()) + 100000n;
      await expect(
        distributor.connect(trader1).createSeason(future, 0)
      ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
    });

    it("full 100M CFG accounted for across all contracts", async function () {
      // Sum up all balances
      const addresses = [
        await timelock.getAddress(),
        await distributor.getAddress(),
        await lpRewards.getAddress(),
        await vestTeam.getAddress(),
        await vestAdvisor.getAddress(),
        await vestInvestor.getAddress(),
        advisor.address,
        investor.address,
        teamMember.address,
        trader1.address,
        trader2.address,
        trader3.address,
        deployer.address,
      ];

      let total = 0n;
      for (const addr of addresses) {
        total += await cfgToken.balanceOf(addr);
      }

      // Total should be 100M (some may have been claimed/transferred but stays in the system)
      expect(total).to.equal(cfg("100000000"));
    });
  });
});
