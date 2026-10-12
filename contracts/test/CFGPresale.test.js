/**
 * CFGPresale.test.js
 *
 * Test suite for the self-hosted $CFG presale.
 *
 * Groups:
 *   1. Deployment & tier config
 *   2. Buying & cross-tier fill
 *   3. Min/max limits
 *   4. Fund routing (treasury / zero custody)
 *   5. Vesting & claim (10% TGE, 0 cliff, 12mo linear)
 *   6. Admin (setTGE, finalize/sweep, pause, rescue, access control)
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const USDC_DECIMALS = 6;
const CFG_DECIMALS = 18;
const YEAR = 365 * 86_400;

function usdc(n) { return ethers.parseUnits(String(n), USDC_DECIMALS); }
function cfg(n)  { return ethers.parseUnits(String(n), CFG_DECIMALS); }
const ZERO = ethers.ZeroAddress;

async function deployFixture() {
  const [owner, treasury, buyer1, buyer2] = await ethers.getSigners();

  // CFG token (real) — mint full supply to owner
  const CFGToken = await ethers.getContractFactory("CFGToken");
  const cfgToken = await CFGToken.deploy(owner.address);
  await cfgToken.initialMint([owner.address], [cfg(100_000_000)]);

  // Mock USDC — owner gets 1B
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy(owner.address);

  // Presale
  const CFGPresale = await ethers.getContractFactory("CFGPresale");
  const presale = await CFGPresale.deploy(
    await cfgToken.getAddress(),
    await mockUsdc.getAddress(),
    treasury.address,
    owner.address
  );

  // Fund presale with the 2.5M CFG that backs claims
  await cfgToken.transfer(await presale.getAddress(), cfg(2_500_000));

  // Give buyers USDC + approve presale
  for (const b of [buyer1, buyer2]) {
    await mockUsdc.transfer(b.address, usdc(100_000));
    await mockUsdc.connect(b).approve(await presale.getAddress(), usdc(1_000_000));
  }

  return { owner, treasury, buyer1, buyer2, cfgToken, mockUsdc, presale };
}

describe("CFGPresale", () => {
  // ── 1. Deployment & tier config ──────────────────────────────────────────
  describe("Deployment & tiers", () => {
    it("prices tier 1 at $0.04 and tier 10 at $0.76", async () => {
      const { presale } = await loadFixture(deployFixture);
      expect(await presale.tierPrice(0)).to.equal(40_000n);   // $0.04 in 6dp
      expect(await presale.tierPrice(9)).to.equal(760_000n);  // $0.76
    });
    it("starts at tier 0 with the full 2.5M allocation", async () => {
      const { presale } = await loadFixture(deployFixture);
      expect(await presale.currentTier()).to.equal(0);
      expect(await presale.remainingTotal()).to.equal(cfg(2_500_000));
      expect(await presale.currentPrice()).to.equal(40_000n);
    });
  });

  // ── 2. Buying & cross-tier fill ──────────────────────────────────────────
  describe("Buying", () => {
    it("$10 buys 250 CFG in tier 1", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(10), 0);
      expect(await presale.purchased(buyer1.address)).to.equal(cfg(250));
      expect(await presale.totalSold()).to.equal(cfg(250));
      expect(await presale.totalRaised()).to.equal(usdc(10));
      expect(await presale.buyerCount()).to.equal(1);
    });

    it("$10,000 fills tier 1 exactly (250k CFG) and advances the tier", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(10_000), 0);
      expect(await presale.totalSold()).to.equal(cfg(250_000));
      expect(await presale.currentTier()).to.equal(1);
      expect(await presale.currentPrice()).to.equal(120_000n); // $0.12
    });

    it("fills across a tier boundary at each tier's price", async () => {
      const { presale, buyer1, buyer2 } = await loadFixture(deployFixture);
      // buyer1 fills half of tier 0 (125k CFG for $5,000)
      await presale.connect(buyer1).buy(usdc(5_000), 0);
      expect(await presale.totalSold()).to.equal(cfg(125_000));
      // buyer2 spends $10,000: 125k left in tier0 ($5,000) + $5,000 in tier1 @ $0.12
      const [cfgOut, usdSpent] = await presale.quote(usdc(10_000));
      // 125,000 + 5000/0.12 = 166,666.67 CFG (1 unit of USDC dust left unspent by integer math)
      expect(usdSpent).to.be.closeTo(usdc(10_000), 10n);
      expect(cfgOut).to.be.closeTo(cfg("166666.666666666666"), cfg("0.001"));
      await presale.connect(buyer2).buy(usdc(10_000), 0);
      expect(await presale.currentTier()).to.equal(1);
    });
  });

  // ── 3. Limits ────────────────────────────────────────────────────────────
  describe("Limits", () => {
    it("rejects buys below the $10 minimum", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      await expect(presale.connect(buyer1).buy(usdc(5), 0)).to.be.revertedWith("below min");
    });
    it("rejects a single buy above the $10,000 max", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      await expect(presale.connect(buyer1).buy(usdc(10_001), 0)).to.be.revertedWith("exceeds max");
    });
    it("enforces the cumulative max across buys", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(6_000), 0);
      await expect(presale.connect(buyer1).buy(usdc(5_000), 0)).to.be.revertedWith("exceeds max");
    });
  });

  // ── 4. Fund routing ──────────────────────────────────────────────────────
  describe("Fund routing", () => {
    it("forwards the full USDC to treasury and holds zero stable", async () => {
      const { presale, buyer1, treasury, mockUsdc } = await loadFixture(deployFixture);
      const tBefore = await mockUsdc.balanceOf(treasury.address);
      await presale.connect(buyer1).buy(usdc(500), 0);
      expect(await mockUsdc.balanceOf(treasury.address) - tBefore).to.equal(usdc(500));
      expect(await mockUsdc.balanceOf(await presale.getAddress())).to.equal(0n);
    });
  });

  // ── 6. Vesting & claim ───────────────────────────────────────────────────
  describe("Vesting", () => {
    it("nothing claimable before TGE", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(1_000), 0);
      expect(await presale.releasable(buyer1.address)).to.equal(0n);
      await expect(presale.connect(buyer1).claim()).to.be.revertedWith("nothing to claim");
    });

    it("releases 10% at TGE, ~55% at 6 months, 100% after 12 months", async () => {
      const { presale, buyer1, owner } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(10), 0); // 250 CFG
      const total = await presale.purchased(buyer1.address);
      const now = await time.latest();
      await presale.connect(owner).setTGE(now + 10);
      await time.increaseTo(now + 11);
      expect(await presale.releasable(buyer1.address)).to.be.closeTo(total / 10n, cfg("0.01")); // 10%
      await time.increase(YEAR / 2);
      expect(await presale.releasable(buyer1.address)).to.be.closeTo((total * 55n) / 100n, cfg("0.5"));
      await time.increase(YEAR / 2);
      expect(await presale.releasable(buyer1.address)).to.equal(total); // fully vested
    });

    it("claim() transfers vested CFG and updates accounting", async () => {
      const { presale, buyer1, owner, cfgToken } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(10), 0);
      const total = await presale.purchased(buyer1.address);
      const now = await time.latest();
      await presale.connect(owner).setTGE(now + 5);
      await time.increase(YEAR * 2); // fully vested
      await presale.connect(buyer1).claim();
      expect(await cfgToken.balanceOf(buyer1.address)).to.equal(total);
      expect(await presale.claimed(buyer1.address)).to.equal(total);
    });
  });

  // ── 7. Admin ─────────────────────────────────────────────────────────────
  describe("Admin", () => {
    it("setTGE is owner-only, not past, not too far, re-settable until reached (L-3)", async () => {
      const { presale, owner, buyer1 } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(presale.connect(buyer1).setTGE(now + 100)).to.be.reverted;             // not owner
      await expect(presale.connect(owner).setTGE(now - 10)).to.be.revertedWith("past");
      await expect(presale.connect(owner).setTGE(now + 400 * 86_400)).to.be.revertedWith("too far");
      await presale.connect(owner).setTGE(now + 1000);
      await presale.connect(owner).setTGE(now + 2000); // re-set allowed before it's reached
      expect(await presale.tgeTime()).to.equal(now + 2000);
      await time.increaseTo(now + 2001);
      await expect(presale.connect(owner).setTGE(now + 5000)).to.be.revertedWith("TGE reached");
    });

    it("buy reverts if the contract is underfunded with CFG (H-1)", async () => {
      const { owner, treasury, buyer1, cfgToken, mockUsdc } = await loadFixture(deployFixture);
      // fresh presale, NOT funded with CFG
      const CFGPresale = await ethers.getContractFactory("CFGPresale");
      const bare = await CFGPresale.deploy(await cfgToken.getAddress(), await mockUsdc.getAddress(), treasury.address, owner.address);
      await mockUsdc.connect(buyer1).approve(await bare.getAddress(), usdc(1_000_000));
      await expect(bare.connect(buyer1).buy(usdc(10), 0)).to.be.revertedWith("underfunded");
    });

    it("buy reverts when minCfgOut isn't met (L-4 slippage)", async () => {
      const { presale, buyer1 } = await loadFixture(deployFixture);
      // $10 yields 250 CFG at tier 0; demand 300 → slippage revert
      await expect(presale.connect(buyer1).buy(usdc(10), cfg(300))).to.be.revertedWith("slippage");
      await presale.connect(buyer1).buy(usdc(10), cfg(250)); // exact floor passes
    });

    it("finalize sweeps unsold CFG to treasury and stops sales", async () => {
      const { presale, owner, buyer1, treasury, cfgToken } = await loadFixture(deployFixture);
      await presale.connect(buyer1).buy(usdc(10_000), 0); // sells 250k CFG
      await presale.connect(owner).finalize();
      // unsold = 2.5M - 250k = 2.25M swept to treasury
      expect(await cfgToken.balanceOf(treasury.address)).to.equal(cfg(2_250_000));
      // contract retains the 250k owed for claims
      expect(await cfgToken.balanceOf(await presale.getAddress())).to.equal(cfg(250_000));
      await expect(presale.connect(buyer1).buy(usdc(10), 0)).to.be.revertedWith("sale closed");
    });

    it("pause blocks buys; unpause restores them", async () => {
      const { presale, owner, buyer1 } = await loadFixture(deployFixture);
      await presale.connect(owner).pause();
      await expect(presale.connect(buyer1).buy(usdc(10), 0)).to.be.reverted;
      await presale.connect(owner).unpause();
      await presale.connect(buyer1).buy(usdc(10), 0);
      expect(await presale.totalSold()).to.equal(cfg(250));
    });

    it("rescueToken cannot touch CFG or USDC (M-3)", async () => {
      const { presale, owner, cfgToken, mockUsdc } = await loadFixture(deployFixture);
      await expect(
        presale.connect(owner).rescueToken(await cfgToken.getAddress(), owner.address, cfg(1))
      ).to.be.revertedWith("CFG locked");
      await expect(
        presale.connect(owner).rescueToken(await mockUsdc.getAddress(), owner.address, usdc(1))
      ).to.be.revertedWith("USDC locked");
    });
  });

  // ── 8. Raise ceiling (M-1): ≤ $1M by construction ────────────────────────
  describe("Raise ceiling (M-1)", () => {
    it("tier prices × 250k sum to exactly $1,000,000", async () => {
      const { presale } = await loadFixture(deployFixture);
      let total = 0n;
      for (let i = 0; i < 10; i++) {
        total += (await presale.tierPrice(i)) * 250_000n; // USD6 per tier (250k CFG)
      }
      expect(total).to.equal(usdc(1_000_000));
    });

    it("a full-allocation quote is 2.5M CFG for exactly $1,000,000", async () => {
      const { presale } = await loadFixture(deployFixture);
      const [cfgOut, usdSpent] = await presale.quote(usdc(1_000_000));
      expect(cfgOut).to.equal(cfg(2_500_000));
      expect(usdSpent).to.equal(usdc(1_000_000));
    });

    it("cannot pull more than $1,000,000 no matter how large the amount", async () => {
      const { presale } = await loadFixture(deployFixture);
      const [cfgOut, usdSpent] = await presale.quote(usdc(5_000_000));
      expect(cfgOut).to.equal(cfg(2_500_000));    // capped at total allocation
      expect(usdSpent).to.equal(usdc(1_000_000)); // ≤ $1M, never over
      expect(usdSpent).to.be.lte(usdc(1_000_000));
    });
  });
});
