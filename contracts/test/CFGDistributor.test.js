/**
 * CFGDistributor.test.js
 *
 * Comprehensive Hardhat test suite for the season-based CFG distribution model
 * with on-chain challenge verification against ChainFundedPool.
 */

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { time }        = require("@nomicfoundation/hardhat-network-helpers");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PREC = 10_000n;
const DAY  = 86_400n;
const SEASON_DURATION = 182n * DAY;

const SZ_1K   =   1_000n * 1_000_000n;
const SZ_10K  =  10_000n * 1_000_000n;
const SZ_25K  =  25_000n * 1_000_000n;
const SZ_50K  =  50_000n * 1_000_000n;
const SZ_100K = 100_000n * 1_000_000n;
const SZ_200K = 200_000n * 1_000_000n;

// Generate unique 24 hex char accountIds
function mkAccountId(seed) {
  return seed.toString(16).padStart(24, "0");
}

// Compute expected points
function expectedPoints(accountSizeUsdc, phase, isWhitelist) {
  const phaseMul = phase === 2 ? 15_000n : 10_000n;
  const srcMul   = isWhitelist ? 5_000n : 10_000n;
  return (BigInt(accountSizeUsdc) * phaseMul * srcMul) / (1_000_000n * PREC * PREC);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CFGDistributor", function () {
  let usdcToken, cfgToken, pool, distributor;
  let owner, reporter, signer1, trader1, trader2, trader3, labsWallet, treasury;
  let season1Start;

  const TOTAL_CFG  = ethers.parseEther("15000000");
  const BUDGET_S1  = ethers.parseEther("4500000");
  const BUDGET_S2  = ethers.parseEther("3000000");

  // Register a challenge on the pool (returns the accountId)
  async function registerChallenge(trader, accountId, accountSize, phase, affiliate = ethers.ZeroAddress) {
    const fee = 30n * 1_000_000n; // $30 fee (cheapest tier)
    // For larger accounts, use the correct fee
    const fees = {
      [SZ_1K.toString()]: 30n * 1_000_000n,
      [SZ_10K.toString()]: 155n * 1_000_000n,
      [SZ_25K.toString()]: 250n * 1_000_000n,
      [SZ_50K.toString()]: 345n * 1_000_000n,
      [SZ_100K.toString()]: 540n * 1_000_000n,
      [SZ_200K.toString()]: 1_080n * 1_000_000n,
    };
    const correctFee = fees[accountSize.toString()] || fee;

    await usdcToken.transfer(trader.address, correctFee);
    await usdcToken.connect(trader).approve(await pool.getAddress(), correctFee);
    await pool.connect(trader).registerChallenge(
      correctFee, accountId, accountSize, phase, affiliate, 0
    );
    return accountId;
  }

  // Admin-register a challenge (whitelist, no fee)
  async function adminRegisterChallenge(trader, accountId, accountSize, phase) {
    await pool.adminRegisterChallenge(trader.address, accountId, accountSize, phase);
    return accountId;
  }

  beforeEach(async function () {
    [owner, reporter, signer1, trader1, trader2, trader3, labsWallet, treasury] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdcToken = await MockUSDC.deploy(owner.address);

    // Deploy CFGToken
    const CFGToken = await ethers.getContractFactory("CFGToken");
    cfgToken = await CFGToken.deploy(owner.address);
    const fullSupply = ethers.parseEther("100000000");
    await cfgToken.initialMint([owner.address], [fullSupply]);

    // Deploy ChainFundedPool (UUPS proxy)
    const { deployPoolProxy } = require("./helpers/deployProxy");
    const proxyResult = await deployPoolProxy(
      await usdcToken.getAddress(), [signer1.address], 1, labsWallet.address, owner.address
    );
    pool = proxyResult.pool;

    // LP deposit so pool has TVL for challenge registration
    const depositAmt = 1_000_000n * 1_000_000n; // $1M
    await usdcToken.transfer(trader1.address, depositAmt);
    await usdcToken.connect(trader1).approve(await pool.getAddress(), depositAmt);
    await pool.connect(trader1).deposit(depositAmt, 0);

    // Deploy CFGDistributor with pool reference
    const CFGDistributor = await ethers.getContractFactory("CFGDistributor");
    distributor = await CFGDistributor.deploy(
      await cfgToken.getAddress(),
      await pool.getAddress(),
      owner.address
    );

    // Fund distributor
    await cfgToken.transfer(await distributor.getAddress(), TOTAL_CFG);
    await distributor.setReporter(reporter.address, true);

    // Season 1 starts in 1 hour
    const latest = await time.latest();
    season1Start = BigInt(latest) + 3600n;
  });

  // ── 1. Deployment ──────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets cfgToken, pool, and owner correctly", async function () {
      expect(await distributor.cfgToken()).to.equal(await cfgToken.getAddress());
      expect(await distributor.pool()).to.equal(await pool.getAddress());
      expect(await distributor.owner()).to.equal(owner.address);
    });

    it("holds exactly TOTAL_CFG", async function () {
      const bal = await cfgToken.balanceOf(await distributor.getAddress());
      expect(bal).to.equal(TOTAL_CFG);
    });

    it("TOTAL_CFG matches sum of canonical budgets", async function () {
      let sum = 0n;
      for (let i = 0; i < 10; i++) sum += await distributor.seasonBudget(i);
      expect(sum).to.equal(TOTAL_CFG);
    });
  });

  // ── 2. Season management ───────────────────────────────────────────────────

  describe("createSeason", function () {
    it("creates season with canonical budget", async function () {
      await distributor.createSeason(season1Start, 0);
      const s = await distributor.seasons(1);
      expect(s.cfgBudget).to.equal(BUDGET_S1);
    });

    it("reverts when MAX_SEASONS exceeded", async function () {
      let start = season1Start;
      for (let i = 0; i < 10; i++) {
        await distributor.createSeason(start, 0);
        start += SEASON_DURATION;
      }
      await expect(distributor.createSeason(start, 0))
        .to.be.revertedWithCustomError(distributor, "MaxSeasonsReached");
    });
  });

  describe("finalizeSeason", function () {
    it("finalizes after endTime", async function () {
      await distributor.createSeason(season1Start, 0);
      const s1 = await distributor.seasons(1);
      await time.increaseTo(s1.endTime);
      await distributor.finalizeSeason(1);
      expect((await distributor.seasons(1)).finalized).to.be.true;
    });

    it("reverts before season ends", async function () {
      await distributor.createSeason(season1Start, 0);
      await expect(distributor.finalizeSeason(1))
        .to.be.revertedWithCustomError(distributor, "SeasonNotEnded");
    });
  });

  // ── 3. On-chain verified registration ──────────────────────────────────────

  describe("recordRegistration (on-chain verified)", function () {
    beforeEach(async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);
    });

    it("records registration verified against pool", async function () {
      const accountId = mkAccountId(1);
      await registerChallenge(trader2, accountId, SZ_1K, 1);

      const tx = await distributor.connect(reporter).recordRegistration(accountId, false);
      expect(await distributor.registrationCount()).to.equal(1);

      // Verify stored data matches pool
      const reg = await distributor.registrations(1);
      expect(reg.trader).to.equal(trader2.address);
      expect(reg.accountSizeUsdc).to.equal(SZ_1K);
      expect(reg.phase).to.equal(1);
      expect(reg.isWhitelist).to.be.false;

      const pts = expectedPoints(SZ_1K, 1, false);
      expect(reg.points).to.equal(pts);
    });

    it("reverts for non-existent challenge", async function () {
      const fakeId = mkAccountId(999);
      await expect(
        distributor.connect(reporter).recordRegistration(fakeId, false)
      ).to.be.revertedWithCustomError(distributor, "ChallengeNotFound");
    });

    it("reverts for duplicate accountId", async function () {
      const accountId = mkAccountId(1);
      await registerChallenge(trader2, accountId, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(accountId, false);

      await expect(
        distributor.connect(reporter).recordRegistration(accountId, false)
      ).to.be.revertedWithCustomError(distributor, "AccountAlreadyRecorded");
    });

    it("records whitelist (admin-registered) challenge", async function () {
      const accountId = mkAccountId(2);
      await adminRegisterChallenge(trader2, accountId, SZ_1K, 1);

      await distributor.connect(reporter).recordRegistration(accountId, true);
      const reg = await distributor.registrations(1);
      expect(reg.isWhitelist).to.be.true;

      const ptsPaid = expectedPoints(SZ_1K, 1, false);
      const ptsWl   = expectedPoints(SZ_1K, 1, true);
      expect(reg.points).to.equal(ptsWl);
      expect(ptsWl).to.equal(ptsPaid / 2n); // 0.5× multiplier
    });

    it("accumulates points from multiple traders", async function () {
      const id1 = mkAccountId(1);
      const id2 = mkAccountId(2);
      await registerChallenge(trader2, id1, SZ_1K, 1);
      await registerChallenge(trader3, id2, SZ_1K, 1);

      await distributor.connect(reporter).recordRegistration(id1, false);
      await distributor.connect(reporter).recordRegistration(id2, false);

      const expected = expectedPoints(SZ_1K, 1, false) * 2n;
      expect((await distributor.seasons(1)).totalPoints).to.equal(expected);
    });

    it("anyone can call recordRegistration (permissionless)", async function () {
      const id2 = mkAccountId(5);
      await registerChallenge(trader2, id2, SZ_1K, 1);
      // trader1 (non-reporter) can register trader2's challenge
      await distributor.connect(trader1).recordRegistration(id2, false);
      expect(await distributor.registrationCount()).to.be.gt(0);
    });

    it("non-reporter cannot set isWhitelist=true", async function () {
      const id3 = mkAccountId(6);
      await adminRegisterChallenge(trader2, id3, SZ_1K, 1);
      // trader1 passes isWhitelist=true but it's forced to false
      await distributor.connect(trader1).recordRegistration(id3, true);
      const regCount = await distributor.registrationCount();
      const reg = await distributor.registrations(regCount);
      expect(reg.isWhitelist).to.be.false;
    });

    it("reverts: SeasonNotActive", async function () {
      const fresh = await (await ethers.getContractFactory("CFGDistributor")).deploy(
        await cfgToken.getAddress(), await pool.getAddress(), owner.address
      );
      await fresh.setReporter(reporter.address, true);
      const id = mkAccountId(1);
      await registerChallenge(trader2, id, SZ_1K, 1);
      await expect(
        fresh.connect(reporter).recordRegistration(id, false)
      ).to.be.revertedWithCustomError(fresh, "SeasonNotActive");
    });
  });

  // ── 4. Batch registration ──────────────────────────────────────────────────

  describe("recordRegistrationBatch", function () {
    beforeEach(async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);
    });

    it("records multiple verified entries", async function () {
      const id1 = mkAccountId(10);
      const id2 = mkAccountId(11);
      const id3 = mkAccountId(12);
      await registerChallenge(trader2, id1, SZ_1K, 1);
      await registerChallenge(trader3, id2, SZ_1K, 1);
      await adminRegisterChallenge(trader2, id3, SZ_1K, 1);

      await distributor.connect(reporter).recordRegistrationBatch(
        [id1, id2, id3],
        [false, false, true]
      );

      expect(await distributor.registrationCount()).to.equal(3);
    });

    it("silently skips non-existent challenges", async function () {
      const realId = mkAccountId(20);
      const fakeId = mkAccountId(21);
      await registerChallenge(trader2, realId, SZ_1K, 1);

      await distributor.connect(reporter).recordRegistrationBatch(
        [realId, fakeId],
        [false, false]
      );

      // Only 1 recorded — fake was skipped
      expect(await distributor.registrationCount()).to.equal(1);
    });

    it("silently skips duplicate accountIds", async function () {
      const id = mkAccountId(30);
      await registerChallenge(trader2, id, SZ_1K, 1);

      await distributor.connect(reporter).recordRegistrationBatch(
        [id, id],
        [false, false]
      );
      expect(await distributor.registrationCount()).to.equal(1);
    });

    it("reverts: BatchTooLarge", async function () {
      const ids = Array.from({ length: 101 }, (_, i) => mkAccountId(i + 1000));
      const wls = Array(101).fill(false);
      await expect(
        distributor.connect(reporter).recordRegistrationBatch(ids, wls)
      ).to.be.revertedWithCustomError(distributor, "BatchTooLarge");
    });

    it("reverts: LengthMismatch", async function () {
      await expect(
        distributor.connect(reporter).recordRegistrationBatch(
          [mkAccountId(1)],
          [false, false]
        )
      ).to.be.revertedWithCustomError(distributor, "LengthMismatch");
    });
  });

  // ── 5. Points formula ──────────────────────────────────────────────────────

  describe("Points formula", function () {
    beforeEach(async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);
    });

    it("$1K Phase1 paid = 1000 points", async function () {
      const id = mkAccountId(100);
      await registerChallenge(trader2, id, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(id, false);
      const reg = await distributor.registrations(1);
      expect(reg.points).to.equal(expectedPoints(SZ_1K, 1, false));
    });

    it("Phase 2 earns 1.5× Phase 1", async function () {
      const id1 = mkAccountId(101);
      const id2 = mkAccountId(102);
      await registerChallenge(trader2, id1, SZ_1K, 1);
      await adminRegisterChallenge(trader3, id2, SZ_1K, 2);
      await distributor.connect(reporter).recordRegistration(id1, false);
      await distributor.connect(reporter).recordRegistration(id2, false);

      const r1 = await distributor.registrations(1);
      const r2 = await distributor.registrations(2);
      expect(r2.points).to.equal((r1.points * 3n) / 2n);
    });

    it("whitelist earns 50% of paid", async function () {
      const id1 = mkAccountId(103);
      const id2 = mkAccountId(104);
      await registerChallenge(trader2, id1, SZ_1K, 1);
      await adminRegisterChallenge(trader3, id2, SZ_1K, 1);

      await distributor.connect(reporter).recordRegistration(id1, false);
      await distributor.connect(reporter).recordRegistration(id2, true);

      const r1 = await distributor.registrations(1);
      const r2 = await distributor.registrations(2);
      expect(r2.points).to.equal(r1.points / 2n);
    });
  });

  // ── 6. Claiming ────────────────────────────────────────────────────────────

  describe("claim", function () {
    let s1EndTime;

    beforeEach(async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);

      // Register challenges on pool, then record in distributor
      const id1 = mkAccountId(200);
      const id2 = mkAccountId(201);
      await registerChallenge(trader2, id1, SZ_1K, 1);
      await adminRegisterChallenge(trader3, id2, SZ_1K, 2);
      await distributor.connect(reporter).recordRegistration(id1, false);
      await distributor.connect(reporter).recordRegistration(id2, false);

      const s1 = await distributor.seasons(1);
      s1EndTime = s1.endTime;
      await time.increaseTo(s1EndTime);
      await distributor.finalizeSeason(1);
    });

    it("trader receives correct pro-rata share", async function () {
      const pts1 = expectedPoints(SZ_1K, 1, false);
      const pts2 = expectedPoints(SZ_1K, 2, false);
      const total = pts1 + pts2;
      const expected = (pts1 * BUDGET_S1) / total;

      const before = await cfgToken.balanceOf(trader2.address);
      await distributor.connect(trader2).claim(1);
      const after = await cfgToken.balanceOf(trader2.address);
      expect(after - before).to.equal(expected);
    });

    it("reverts on double claim", async function () {
      await distributor.connect(trader2).claim(1);
      await expect(distributor.connect(trader2).claim(1))
        .to.be.revertedWithCustomError(distributor, "NothingToClaim");
    });

    it("sole trader gets full budget", async function () {
      // New season with only one trader
      const latest = BigInt(await time.latest());
      const s2Start = latest + 3600n;
      await distributor.createSeason(s2Start, 0);
      await time.increaseTo(s2Start);

      const id = mkAccountId(210);
      await registerChallenge(trader2, id, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(id, false);

      const s2 = await distributor.seasons(2);
      await time.increaseTo(s2.endTime);
      await distributor.finalizeSeason(2);

      const before = await cfgToken.balanceOf(trader2.address);
      await distributor.connect(trader2).claim(2);
      const after = await cfgToken.balanceOf(trader2.address);
      expect(after - before).to.equal(BUDGET_S2);
    });
  });

  // ── 7. previewClaim ────────────────────────────────────────────────────────

  describe("previewClaim", function () {
    it("returns correct preview after finalization", async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);

      const id = mkAccountId(300);
      await registerChallenge(trader2, id, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(id, false);

      const s1 = await distributor.seasons(1);
      await time.increaseTo(s1.endTime);
      await distributor.finalizeSeason(1);

      const [cfg, pts] = await distributor.previewClaim(1, trader2.address);
      expect(pts).to.equal(expectedPoints(SZ_1K, 1, false));
      expect(cfg).to.equal(BUDGET_S1); // sole trader
    });

    it("returns (0, 0) for non-finalized season", async function () {
      await distributor.createSeason(season1Start, 0);
      const [cfg, pts] = await distributor.previewClaim(1, trader2.address);
      expect(cfg).to.equal(0);
      expect(pts).to.equal(0);
    });
  });

  // ── 8. Reporter access control ─────────────────────────────────────────────

  describe("Reporter access", function () {
    it("setReporter emits event", async function () {
      await expect(distributor.setReporter(trader1.address, true))
        .to.emit(distributor, "ReporterSet")
        .withArgs(trader1.address, true);
    });

    it("revoking reporter means isWhitelist=true is ignored", async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);
      await distributor.setReporter(reporter.address, false);

      const id = mkAccountId(400);
      await adminRegisterChallenge(trader2, id, SZ_1K, 1);
      // Revoked reporter can still call (permissionless) but isWhitelist forced to false
      await distributor.connect(reporter).recordRegistration(id, true);
      const regCount = await distributor.registrationCount();
      const reg = await distributor.registrations(regCount);
      expect(reg.isWhitelist).to.be.false;
    });
  });

  // ── 9. recoverUnclaimedCfg ─────────────────────────────────────────────────

  describe("recoverUnclaimedCfg", function () {
    it("recovers from zero-participant season", async function () {
      await distributor.createSeason(season1Start, 0);
      const s1 = await distributor.seasons(1);
      await time.increaseTo(s1.endTime);
      await distributor.finalizeSeason(1);

      const before = await cfgToken.balanceOf(treasury.address);
      await distributor.recoverUnclaimedCfg(1, treasury.address);
      const after = await cfgToken.balanceOf(treasury.address);
      expect(after - before).to.equal(BUDGET_S1);
    });

    it("reverts if season has participants", async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);

      const id = mkAccountId(500);
      await registerChallenge(trader2, id, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(id, false);

      const s1 = await distributor.seasons(1);
      await time.increaseTo(s1.endTime);
      await distributor.finalizeSeason(1);

      await expect(distributor.recoverUnclaimedCfg(1, treasury.address))
        .to.be.revertedWith("CFGDistributor: season has participants");
    });
  });

  // ── 10. Multi-season lifecycle ─────────────────────────────────────────────

  describe("Multi-season lifecycle", function () {
    it("partitions registrations across two seasons", async function () {
      await distributor.createSeason(season1Start, 0);
      await time.increaseTo(season1Start);

      const id1 = mkAccountId(600);
      await registerChallenge(trader2, id1, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(id1, false);

      const s1 = await distributor.seasons(1);
      await distributor.createSeason(s1.endTime, 0);
      await time.increaseTo(s1.endTime);
      await distributor.finalizeSeason(1);

      // Season 2
      const id2 = mkAccountId(601);
      await registerChallenge(trader3, id2, SZ_1K, 1);
      await distributor.connect(reporter).recordRegistration(id2, false);

      // Season 1 has 1 reg, Season 2 has 1 reg
      expect((await distributor.seasons(1)).totalPoints).to.equal(expectedPoints(SZ_1K, 1, false));
      expect((await distributor.seasons(2)).totalPoints).to.equal(expectedPoints(SZ_1K, 1, false));
    });
  });
});
