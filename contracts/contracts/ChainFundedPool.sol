// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title CFNDToken
 * @dev LP token representing a proportional share of ChainFunded LP capital.
 *      Minted on deposit, burned on withdrawal. NAV reflects capital only.
 *
 *      Non-transferable (soulbound): transfers between users are disabled to
 *      prevent rewardDebt desync in the ChainFundedPool profit accumulator.
 *      Only mint (from == address(0)) and burn (to == address(0)) are allowed.
 *      LPs interact exclusively through Pool.deposit() and Pool.withdraw().
 */
contract CFNDToken is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("ChainFunded LP Token", "CFND")
        Ownable(initialOwner)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /**
     * @dev Override to make CFND non-transferable. Only mint (from == 0)
     *      and burn (to == 0) are permitted. Direct transfers between
     *      addresses revert to prevent rewardDebt accounting desync.
     */
    function _update(address from, address to, uint256 value) internal override {
        require(
            from == address(0) || to == address(0),
            "CFND: non-transferable"
        );
        super._update(from, to, value);
    }
}

/**
 * @title ChainFundedPool
 * @dev LP capital pool that backs simulated prop-firm trader payouts.
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 *
 *  LP Capital Pool (fixed 1:1 CFND peg)
 *    LPs deposit USDC and receive CFND tokens at a fixed 1:1 rate. Their
 *    capital is at risk: trader payouts reduce the pool balance. On withdrawal
 *    each CFND redeems for exactly 1 USDC (capped at available capital if the
 *    pool has been partially depleted by payouts).
 *
 *    CFND price = 1 USDC (fixed — does not fluctuate with pool balance)
 *
 *  LP Profit Pool  (reward-per-token accumulator, no lockup)
 *    All LP revenue from evaluation fees and payout firm cuts flows into a
 *    separate profit pool. Profits are distributed proportionally to CFND
 *    holders via the standard reward-per-token pattern (Synthetix/MasterChef).
 *    LPs may claim accrued profits at any time — no lockup period.
 *    Deposits and withdrawals auto-harvest pending profits before adjusting
 *    the CFND balance so accounting always stays clean.
 *    Unclaimed profits are NOT included in capital — they are tracked
 *    independently via `profitPoolBalance` and `accProfitPerToken`.
 *
 * ── Revenue model ─────────────────────────────────────────────────────────
 *
 *  Evaluation fee (trader pays to enter challenge):
 *    24% → labsWallet      (ChainFunded Labs / MZF Protocol Inc.)
 *     6% → LP profit pool      (reward-per-token yield accrual)
 *    70% → LP capital pool     (reserves, funds trader payouts)
 *
 *  Payout firm cut  (grossProfit − traderShare):
 *    80% of firmCut → labsWallet   (ChainFunded Labs)
 *    20% of firmCut → LP profit pool   (reward-per-token accrual)
 *
 * ── Payout mechanics ──────────────────────────────────────────────────────
 *
 *  Trader payouts are funded from LP capital (the full contract balance less
 *  the separate profit pool).  On a compliant payout (grossProfitUsdc = G):
 *    traderShare   = G × 80%   → transferred to trader
 *    protocolShare = G × 16%   → transferred to labsWallet
 *    lpProfitShare = G × 4%    → credited to LP profit pool
 *
 *  LP capital decreases by (traderShare + protocolShare = 96% of G).
 *  The 4% firm-cut LP share accrues to the profit pool and can be claimed.
 *
 * ── Profit claim mechanics ────────────────────────────────────────────────
 *
 *  Uses the reward-per-token accumulator pattern (industry standard):
 *
 *    accProfitPerToken  — accumulated profit per raw CFND unit (scaled ×1e12)
 *    rewardDebt[lp]     — amount already accounted for per LP
 *
 *    pending(lp) = cfndBalance(lp) × accProfitPerToken / 1e12 − rewardDebt[lp]
 *
 *  Deposits set rewardDebt to the current accumulator value so new LPs only
 *  earn from the point of their deposit. No lockup — profits are claimable
 *  at any time and accrue continuously on every fee/payout transaction.
 *
 * ── Rule enforcement ──────────────────────────────────────────────────────
 *
 *  Rules are snapshotted per challenge at purchase time. Payout compliance is
 *  enforced by a backend-signed proof (ECDSA). No admin approval is possible.
 *  Rules enforced: max daily loss, max total loss, min trading days, profit target,
 *  and best day ≤ 50% of total gross profit.
 *
 * ── Replay protection ─────────────────────────────────────────────────────
 *
 *  Payout IDs (Base44 record IDs) are stored on-chain to prevent double-spend.
 */
// ── UPGRADE CONSTRAINT — READ BEFORE MODIFYING INHERITANCE ───────────────────
//
// ReentrancyGuard (non-upgradeable) is intentionally used here instead of
// ReentrancyGuardUpgradeable.  Because the three other base contracts
// (Ownable2StepUpgradeable, PausableUpgradeable, UUPSUpgradeable) all use
// ERC-7201 namespaced storage, they consume zero sequential storage slots.
// This means ReentrancyGuard._status lands at sequential slot 0, and this
// contract's own state variables begin at slot 1.
//
// NEVER do any of the following in a future upgrade:
//   • Replace ReentrancyGuard with ReentrancyGuardUpgradeable
//     (namespaced storage would free slot 0 → every state variable shifts down)
//   • Insert a new sequential-storage base contract before ReentrancyGuard
//     (same slot-shift result)
//   • Change the order of base contracts in the `is` list
//
// Run `npx hardhat run scripts/checkUpgrade.js` before deploying any upgrade.
// It calls validateUpgrade() from @openzeppelin/hardhat-upgrades and will
// reject any layout-incompatible change.
// ─────────────────────────────────────────────────────────────────────────────
contract ChainFundedPool is Ownable2StepUpgradeable, ReentrancyGuard, PausableUpgradeable, UUPSUpgradeable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // ── Custom errors (saves ~3-4KB vs require strings) ─────────────────────
    // General
    error InvalidAddress();
    error InvalidAmount();
    error LengthMismatch();

    // Initialization
    error InvalidThreshold();
    error DuplicateSigner();

    // LP operations
    error SameBlockDeposit();
    error InsufficientCFND();
    error NoCapitalAvailable();
    error GasExceedsAmount();
    error NoProfitToClaim();
    error InsufficientProfitPool();
    error PoolMustHaveDeposits();

    // Challenge registration
    error InvalidPhase();
    error InvalidAccountId();
    error ChallengeAlreadyRegistered();
    error SelfReferral();
    error TierNotEnabled();
    error TvlTooLow();
    error AdminRegisterPermanentlyDisabled();

    // Payout
    error InvalidPayoutId();
    error PayoutAlreadySettled();
    error NoProfitForPayout();
    error SignatureExpired();
    error ChallengeNotRegistered();
    error ChallengeAlreadySettled();
    error NotChallengeOwner();
    error InsufficientSignatures();
    error UnauthorizedSigner();
    error DuplicateOrUnsortedSignature();
    error RuleBreachedDailyLoss();
    error RuleBreachedTotalLoss();
    error RuleBreachedMinDays();
    error RuleBreachedProfitTarget();
    error RuleBreachedBestDay();
    error InsufficientLPCapital();
    error GasExceedsTraderShare();

    // Post-payout registration
    error ChallengeNotSettled();
    error FreshAccountAlreadyRegistered();

    // Admin
    error InvalidRuleValue();
    error TooManyTiers();
    error FeeTooLow();
    error FeeTooHigh();
    error ThresholdsNotAscending();
    error RatesNotNonDecreasing();
    error RateExceedsCap();
    error NotASigner();
    error WouldBreachThreshold();
    error NotGuardianOrOwner();
    error NotWhitelisterOrOwner();
    error InvalidEmergencyRequest();
    error DelayNotMet();
    error ExceedsLPCapital();
    error ExceedsProfitPool();
    error CallerNotWhitelisted();

    // ── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BPS = 10_000;

    // Evaluation fee splits (fixed)
    uint256 public constant FEE_PROTOCOL_BPS    = 2_400; //  24% → labsWallet (ChainFunded Labs)
    uint256 public constant FEE_PROFIT_POOL_BPS =   600; //   6% → LP profit pool (yield)
    // Affiliate commission is tiered (8–20%) based on monthly volume — see affiliate tier state below.
    // Remaining (after protocol + LP profit + affiliate) stays as LP capital reserves.

    // Payout firm cut splits
    uint256 public constant FIRM_CUT_PROTOCOL_BPS = 8_000; // 80% → labsWallet (ChainFunded Labs)
    // remaining 20% → LP profit pool

    /// Precision multiplier for the reward-per-token accumulator.
    uint256 private constant ACC_PRECISION = 1e12;

    // ── Default challenge rules (owner-adjustable; snapshotted per challenge) ─

    // Default challenge rules — set in initialize(), NOT via declaration
    // (declaration initializers don't run behind a proxy).
    uint256 public defaultPhase1ProfitTargetBps; // 10% = 1000
    uint256 public defaultPhase2ProfitTargetBps; //  5% =  500
    uint256 public defaultMaxDailyLossBps;       //  5% =  500
    uint256 public defaultMaxTotalLossBps;       // 10% = 1000
    uint256 public defaultMinTradingDays;        //        4
    uint256 public defaultTraderShareBps;        // 80% = 8000
    uint256 public defaultMaxBestDayBps;         // 50% = 5000

    // ── Challenge tiers (owner-adjustable; validated on each challenge purchase) ─
    //
    //    Each tier maps an account size (USDC, 6 decimals) to a required
    //    evaluation fee (USDC, 6 decimals). registerChallenge() reverts if
    //    the (accountSize, feeAmount) pair does not match a registered tier.
    //
    //    Default tiers (matching business plan):
    //      $1,000   → $30      (unlocked at $0 TVL — launch tier)
    //      $10,000  → $155     (unlocked at $100K TVL)
    //      $25,000  → $250     (unlocked at $250K TVL)
    //      $50,000  → $345     (unlocked at $500K TVL)
    //      $100,000 → $540     (unlocked at $1M TVL)
    //      $200,000 → $1,080   (unlocked at $2M TVL)
    //
    //    Adjustable by owner (Timelock governance on mainnet).

    /// accountSize (USDC 6 decimals) → required fee (USDC 6 decimals). 0 = tier not enabled.
    mapping(uint256 => uint256) public challengeTierFee;

    /// accountSize → minimum LP capital (TVL) required to unlock this tier. 0 = always available.
    mapping(uint256 => uint256) public challengeTierTvlThreshold;

    /// List of enabled account sizes for enumeration / frontend display.
    uint256[] public challengeTierSizes;

    event ChallengeTiersUpdated();

    // ── Affiliate tiers (owner-adjustable; read on each challenge purchase) ──
    //
    //    Affiliates earn a tiered commission on the first evaluation fee per
    //    referred trader. The rate depends on the affiliate's monthly volume
    //    (total fees referred in the current calendar month UTC).
    //
    //    Tiers are stored as parallel arrays: thresholds[i] is the minimum
    //    monthly volume (USDC, 6 decimals) to qualify for rates[i] (BPS).
    //    Arrays are sorted ascending. An affiliate's rate is the highest tier
    //    whose threshold they meet or exceed.
    //
    //    Default tiers (matching business plan):
    //      $0+      →  800 BPS (8%)
    //      $1,000+  → 1000 BPS (10%)
    //      $2,500+  → 1200 BPS (12%)
    //      $5,000+  → 1500 BPS (15%)
    //      $10,000+ → 2000 BPS (20%)
    //
    //    Adjustable by owner (Timelock governance on mainnet).

    uint256 public constant MAX_AFFILIATE_BPS = 2_000; // 20% hard cap — protects LP capital

    /// Tier thresholds: minimum monthly volume in USDC (6 decimals). Sorted ascending.
    uint256[] public affiliateTierThresholds;

    /// Tier rates: commission in BPS corresponding to each threshold. Same length as thresholds.
    uint256[] public affiliateTierRates;

    // ── Affiliate monthly volume tracking ────────────────────────────────────
    //
    //    Volume is tracked per affiliate per month. The "month epoch" is
    //    year * 12 + month (UTC), derived from block.timestamp. When the
    //    epoch changes, the affiliate's volume effectively resets because
    //    we read from a mapping keyed by (affiliate, epoch).

    /// affiliate → month epoch → cumulative referred fee volume (USDC, 6 decimals)
    mapping(address => mapping(uint256 => uint256)) public affiliateMonthlyVolume;

    /// affiliate → trader → true if this trader has already been referred by this affiliate.
    /// Commission and volume only count on the FIRST challenge per trader per affiliate.
    mapping(address => mapping(address => bool)) public affiliateHasReferred;

    // ── Per-challenge record ─────────────────────────────────────────────────

    struct Challenge {
        address trader;
        uint256 accountSizeUsdc;
        uint8   phase;
        bool    settled;
        uint256 createdAt;
        uint256 profitTargetBps;
        uint256 maxDailyLossBps;
        uint256 maxTotalLossBps;
        uint256 minTradingDays;
        uint256 traderShareBps;
        uint256 maxBestDayBps;  // best single-day profit cap as BPS of total gross profit
    }

    /// accountId (Base44 ChallengeAccount ID) → Challenge
    mapping(string => Challenge) public challenges;

    // ── LP profit pool (reward-per-token) ────────────────────────────────────

    /// Total USDC accumulated in the profit pool (unclaimed LP profits).
    uint256 public profitPoolBalance;

    /// Accumulated profit per raw CFND unit, scaled by ACC_PRECISION.
    uint256 public accProfitPerToken;

    /// Per-LP reward debt (raw USDC equivalent, based on ACC_PRECISION accumulator).
    mapping(address => uint256) public rewardDebt;

    /// Block number of each LP's last deposit (anti-sandwich: no withdraw in same block).
    mapping(address => uint256) public lastDepositBlock;

    // ── Other state ──────────────────────────────────────────────────────────

    IERC20    public usdc;
    CFNDToken public cfndToken;
    mapping(address => bool) public authorizedSigners;
    uint256   public signerCount;
    uint256   public signatureThreshold;
    address   public labsWallet;

    /// Replay protection for payout IDs.
    mapping(string => bool) public settledPayouts;

    // ── CFND transfer whitelist (for staking integration) ───────────────────
    /// @notice Addresses authorised to call transferCfnd (e.g. CFGLPRewards staking contract).
    mapping(address => bool) public cfndTransferWhitelist;

    /// Guardian address — can pause/unpause the protocol in emergencies.
    /// Separate from owner (governance). Typically a multi-sig.
    address public guardian;

    // ── Admin registration ─────────────────────────────────────────────────
    /// @notice Once set to true, adminRegisterChallenge is permanently disabled.
    bool public adminRegisterDisabled;

    // ── Emergency withdrawal timelock ───────────────────────────────────────
    uint256 public constant EMERGENCY_DELAY = 48 hours;

    struct EmergencyRequest {
        address to;
        uint256 amount;
        bool    isCapital;
        uint256 executeAfter;
    }

    mapping(bytes32 => EmergencyRequest) public emergencyRequests;
    uint256 private emergencyRequestNonce;

    // ── Whitelister role ─────────────────────────────────────────────────────
    // Grants free (admin-registered) accounts directly, bypassing the governance
    // timelock — analogous to `guardian`, but for whitelisting instead of pausing.
    // Declared LAST to preserve the upgradeable storage layout: there is no
    // storage gap, so any new state variable MUST be appended after all existing
    // ones (never inserted) or the upgrade would corrupt storage.
    /// @notice Address authorised to call adminRegisterChallenge directly. Typically a multi-sig.
    address public whitelister;

    event EmergencyWithdrawalRequested(bytes32 indexed requestId, address to, uint256 amount, bool isCapital, uint256 executeAfter);
    event EmergencyWithdrawalExecuted(bytes32 indexed requestId, address to, uint256 amount, bool isCapital);
    event EmergencyWithdrawalCancelled(bytes32 indexed requestId);

    // ── Events ───────────────────────────────────────────────────────────────

    event Deposited(address indexed lp, uint256 usdcAmount, uint256 cfndMinted);
    event Withdrawn(address indexed lp, uint256 cfndBurned, uint256 usdcReturned);
    event ProfitClaimed(address indexed lp, uint256 amount);
    event AffiliateTiersUpdated(uint256[] thresholds, uint256[] rates);

    event ChallengeRegistered(
        address indexed trader,
        string  indexed accountId,
        uint256 accountSizeUsdc,
        uint8   phase,
        uint256 feeAmount,
        uint256 protocolRevenue,
        uint256 lpProfitPoolShare,
        uint256 lpCapitalShare,
        address indexed affiliate,
        uint256 affiliateRevenue
    );

    event PayoutClaimed(
        address indexed trader,
        string  indexed accountId,
        string  indexed payoutId,
        uint256 grossProfitUsdc,
        uint256 traderAmount,
        uint256 protocolRevenue,
        uint256 lpProfitShare
    );

    event RulesUpdated();
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event SignatureThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event LabsWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event WhitelisterUpdated(address indexed oldWhitelister, address indexed newWhitelister);
    event AdminRegisterDisabled();
    event CfndTransferWhitelistUpdated(address indexed addr, bool enabled);
    event CfndTransferred(address indexed from, address indexed to, uint256 amount);
    event PostPayoutRegistered(
        address indexed trader,
        string  indexed settledAccountId,
        string  indexed freshAccountId,
        uint256 freshAccountSize
    );

    event FundedRegistered(
        address indexed trader,
        string  indexed phase2AccountId,
        string  indexed fundedAccountId,
        uint256 accountSizeUsdc
    );

    event Phase2Registered(
        address indexed trader,
        string  indexed phase1AccountId,
        string  indexed phase2AccountId,
        uint256 accountSizeUsdc
    );

    // ── Initializer (replaces constructor for UUPS proxy) ─────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _cfndToken,
        address[] memory _signers,
        uint256 _signatureThreshold,
        address _labsWallet,
        address initialOwner
    ) public initializer {
        if (_usdc == address(0)) revert InvalidAddress();
        if (_cfndToken == address(0)) revert InvalidAddress();
        if (_signers.length == 0) revert InvalidAmount();
        if (_signatureThreshold == 0 || _signatureThreshold > _signers.length) revert InvalidThreshold();
        if (_labsWallet == address(0)) revert InvalidAddress();

        __Ownable_init(initialOwner);
        __Ownable2Step_init();
        __Pausable_init();

        usdc           = IERC20(_usdc);
        cfndToken      = CFNDToken(_cfndToken);
        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0)) revert InvalidAddress();
            if (authorizedSigners[_signers[i]]) revert DuplicateSigner();
            authorizedSigners[_signers[i]] = true;
        }
        signerCount        = _signers.length;
        signatureThreshold = _signatureThreshold;
        labsWallet = _labsWallet;
        guardian        = initialOwner; // Guardian defaults to owner; update via updateGuardian()
        whitelister     = initialOwner; // Whitelister defaults to owner; update via updateWhitelister()
                                        // (on an upgrade of an existing proxy this initializer does
                                        //  not re-run, so the owner must call updateWhitelister()).

        // Default challenge rules (must be set explicitly — declaration initializers
        // don't run behind a proxy)
        defaultPhase1ProfitTargetBps = 1_000; // 10%
        defaultPhase2ProfitTargetBps =   500; //  5%
        defaultMaxDailyLossBps       =   500; //  5%
        defaultMaxTotalLossBps       = 1_000; // 10%
        defaultMinTradingDays        =     4;
        defaultTraderShareBps        = 8_000; // 80%
        defaultMaxBestDayBps         = 5_000; // 50%

        // Default challenge tiers (matching business plan)
        _setTier(1_000 * 1e6,   30 * 1e6,    0);                // $1K  → $30  (launch tier, no TVL gate)
        _setTier(10_000 * 1e6,  155 * 1e6,   100_000 * 1e6);   // $10K → $155 (unlocks at $100K TVL)
        _setTier(25_000 * 1e6,  250 * 1e6,   250_000 * 1e6);   // $25K → $250 (unlocks at $250K TVL)
        _setTier(50_000 * 1e6,  345 * 1e6,   500_000 * 1e6);   // $50K → $345 (unlocks at $500K TVL)
        _setTier(100_000 * 1e6, 540 * 1e6,   1_000_000 * 1e6); // $100K→ $540 (unlocks at $1M TVL)
        _setTier(200_000 * 1e6, 1_080 * 1e6, 2_000_000 * 1e6); // $200K→ $1,080 (unlocks at $2M TVL)

        // Default affiliate tiers (matching business plan)
        affiliateTierThresholds.push(0);               // $0+
        affiliateTierThresholds.push(1_000 * 1e6);     // $1,000+
        affiliateTierThresholds.push(2_500 * 1e6);     // $2,500+
        affiliateTierThresholds.push(5_000 * 1e6);     // $5,000+
        affiliateTierThresholds.push(10_000 * 1e6);    // $10,000+

        affiliateTierRates.push(800);    //  8%
        affiliateTierRates.push(1_000);  // 10%
        affiliateTierRates.push(1_200);  // 12%
        affiliateTierRates.push(1_500);  // 15%
        affiliateTierRates.push(2_000);  // 20%
    }

    // ── UUPS upgrade authorization ──────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── Internal: challenge tier helper ────────────────────────────────────────

    /**
     * @dev Add or update a challenge tier. If the size already exists, updates
     *      the fee. If new, appends to the sizes array.
     */
    function _setTier(uint256 accountSize, uint256 fee, uint256 tvlThreshold) internal {
        if (challengeTierFee[accountSize] == 0) {
            challengeTierSizes.push(accountSize);
        }
        challengeTierFee[accountSize] = fee;
        challengeTierTvlThreshold[accountSize] = tvlThreshold;
    }

    // ── Internal: affiliate tier helpers ───────────────────────────────────────

    /**
     * @dev Returns the current UTC month epoch: year * 12 + (month - 1).
     *      Used to key the monthly volume mapping. Volume auto-resets when
     *      the epoch advances (no admin action required).
     */
    function _currentMonthEpoch() internal view returns (uint256) {
        // Approximate: 1 month ≈ 30.44 days. Use actual calendar math.
        // Unix timestamp → year/month via the "civil_from_days" algorithm.
        uint256 z = block.timestamp / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
        return y * 12 + (m - 1);
    }

    /**
     * @dev Look up the affiliate commission rate (BPS) for a given monthly volume.
     *      Iterates tiers in reverse (highest first) and returns the first match.
     */
    function _affiliateRateBps(uint256 monthlyVolume) internal view returns (uint256) {
        uint256 len = affiliateTierThresholds.length;
        if (len == 0) return 0;
        for (uint256 i = len; i > 0; i--) {
            if (monthlyVolume >= affiliateTierThresholds[i - 1]) {
                return affiliateTierRates[i - 1];
            }
        }
        return affiliateTierRates[0]; // fallback to lowest tier
    }

    // ── Internal: profit pool accounting ─────────────────────────────────────

    /**
     * @dev Add `amount` USDC to the LP profit pool and advance the accumulator.
     *      If no CFND is outstanding yet, profits accumulate and will be
     *      distributed once the first deposit arrives — handled by debt
     *      initialisation on deposit.
     */
    function _addToProfit(uint256 amount) internal {
        profitPoolBalance += amount;
        uint256 supply = cfndToken.totalSupply();
        if (supply > 0) {
            accProfitPerToken += (amount * ACC_PRECISION) / supply;
        }
    }

    /**
     * @dev Compute an LP's pending (unclaimed) profit in raw USDC units.
     */
    function _pendingProfit(address lp) internal view returns (uint256) {
        uint256 bal = cfndToken.balanceOf(lp);
        if (bal == 0) return 0;
        uint256 accumulated = (bal * accProfitPerToken) / ACC_PRECISION;
        return accumulated > rewardDebt[lp] ? accumulated - rewardDebt[lp] : 0;
    }

    // ── LP: deposit ──────────────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the LP capital pool. Receive CFND tokens at 1:1.
     *
     *         CFND minted = depositAmount (fixed 1 USDC : 1 CFND peg)
     *
     *         LP capital (CFND) is at risk — trader payouts can reduce the pool
     *         balance. Any pending profits are auto-harvested before the CFND
     *         balance changes so accounting stays clean.
     *
     * @param amount USDC amount (6 decimals)
     */
    function deposit(uint256 amount, uint256 gasReimbursementUsdc) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        // Collect deposit + gas reimbursement from user
        uint256 totalIn = amount + gasReimbursementUsdc;
        usdc.safeTransferFrom(msg.sender, address(this), totalIn);

        // Send gas reimbursement to labs wallet
        if (gasReimbursementUsdc > 0) usdc.safeTransfer(labsWallet, gasReimbursementUsdc);

        // Auto-harvest pending profits before changing CFND balance.
        uint256 pending = _pendingProfit(msg.sender);
        if (pending > 0) {
            profitPoolBalance -= pending;
            usdc.safeTransfer(msg.sender, pending);
            emit ProfitClaimed(msg.sender, pending);
        }

        // Always mint 1:1 — CFND is pegged to 1 USDC.
        uint256 cfndToMint = amount;

        cfndToken.mint(msg.sender, cfndToMint);

        // Sync reward debt for new total balance (post-harvest, post-mint).
        rewardDebt[msg.sender] = (cfndToken.balanceOf(msg.sender) * accProfitPerToken) / ACC_PRECISION;

        // Record deposit block to prevent same-block sandwich attacks.
        lastDepositBlock[msg.sender] = block.number;

        emit Deposited(msg.sender, amount, cfndToMint);
    }

    /**
     * @notice Burn CFND tokens to withdraw LP capital in USDC at 1:1.
     *         Supports partial withdrawals — specify exactly how many CFND to burn.
     *         Each CFND redeems for exactly 1 USDC. Reverts if the pool has been
     *         depleted below the requested amount by trader payouts.
     *         Any pending profits are auto-harvested before the CFND balance changes.
     *
     * @param cfndAmount CFND tokens to burn (raw, 6 decimals)
     */
    function withdraw(uint256 cfndAmount, uint256 gasReimbursementUsdc) external nonReentrant whenNotPaused {
        if (block.number <= lastDepositBlock[msg.sender]) revert SameBlockDeposit();
        if (cfndAmount == 0) revert InvalidAmount();
        uint256 balance = cfndToken.balanceOf(msg.sender);
        if (balance < cfndAmount) revert InsufficientCFND();

        // Pro-rata withdrawal: if pool is depleted, LP receives their fair
        // share of remaining capital instead of reverting. This prevents
        // bank-run dynamics where early withdrawers get 100% and late ones
        // get nothing.
        uint256 capital = lpCapitalBalance();
        uint256 supply  = cfndToken.totalSupply();
        uint256 usdcReturn;
        if (capital >= supply) {
            // Pool is healthy — capital covers all CFND at 1:1 peg.
            usdcReturn = cfndAmount;
        } else {
            // Pool is depleted — pro-rata share of remaining capital.
            usdcReturn = (cfndAmount * capital) / supply;
        }
        if (usdcReturn == 0) revert NoCapitalAvailable();

        // Auto-harvest all pending profits before changing CFND balance.
        uint256 pending = _pendingProfit(msg.sender);
        if (pending > 0) {
            profitPoolBalance -= pending;
        }

        cfndToken.burn(msg.sender, cfndAmount);

        // Sync reward debt for the remaining balance.
        rewardDebt[msg.sender] = (cfndToken.balanceOf(msg.sender) * accProfitPerToken) / ACC_PRECISION;

        // Total outflow = capital redemption + pending profit - gas reimbursement
        uint256 totalOut = usdcReturn + pending;
        if (gasReimbursementUsdc >= totalOut) revert GasExceedsAmount();
        uint256 netPayout = totalOut - gasReimbursementUsdc;

        usdc.safeTransfer(msg.sender, netPayout);
        if (gasReimbursementUsdc > 0) usdc.safeTransfer(labsWallet, gasReimbursementUsdc);
        if (pending > 0) emit ProfitClaimed(msg.sender, pending);
        emit Withdrawn(msg.sender, cfndAmount, usdcReturn);
    }

    /**
     * @notice Claim all accrued LP profit pool rewards. No CFND lockup — profits are
     *         claimable without burning tokens. Paused when the protocol is paused.
     */
    function claimProfit(uint256 gasReimbursementUsdc) external nonReentrant whenNotPaused {
        if (block.number <= lastDepositBlock[msg.sender]) revert SameBlockDeposit();
        uint256 pending = _pendingProfit(msg.sender);
        if (pending == 0) revert NoProfitToClaim();
        if (gasReimbursementUsdc >= pending) revert GasExceedsAmount();
        if (profitPoolBalance < pending) revert InsufficientProfitPool();

        profitPoolBalance -= pending;
        rewardDebt[msg.sender] = (cfndToken.balanceOf(msg.sender) * accProfitPerToken) / ACC_PRECISION;

        uint256 netPayout = pending - gasReimbursementUsdc;
        usdc.safeTransfer(msg.sender, netPayout);
        if (gasReimbursementUsdc > 0) usdc.safeTransfer(labsWallet, gasReimbursementUsdc);
        emit ProfitClaimed(msg.sender, netPayout);
    }

    // ── Trader: register challenge ────────────────────────────────────────────

    /**
     * @notice Pay the evaluation fee and register a Phase 1 challenge on-chain.
     *         Phase 1 only — use registerPhase2() for Phase 2 (requires a
     *         settled Phase 1 account and backend multi-sig attestation).
     *
     *         Rules are snapshotted at purchase time and cannot be changed
     *         for the life of this challenge.
     *
     *         Fee split (no affiliate):
     *           24% → labsWallet    (ChainFunded Labs / MZF Protocol Inc.)
     *            6% → LP profit pool    (reward-per-token yield)
     *           70% → LP capital pool   (reserves, funds trader payouts)
     *
     *         Fee split (with affiliate — rate depends on monthly volume tier):
     *           24%     → labsWallet    (ChainFunded Labs, unchanged)
     *            6%     → LP profit pool    (unchanged)
     *           8–20%   → affiliate wallet  (tiered, carved from LP capital share)
     *           50–62%  → LP capital pool
     *
     * @param feeAmount   Evaluation fee (USDC, 6 decimals)
     * @param accountId   Base44 ChallengeAccount ID
     * @param accountSize Simulated account size (USDC, 6 decimals)
     * @param phase       1 or 2
     * @param affiliate   Affiliate wallet (address(0) if none)
     */
    function registerChallenge(
        uint256 feeAmount,
        string  calldata accountId,
        uint256 accountSize,
        uint8   phase,
        address affiliate,
        uint256 gasReimbursementUsdc
    ) external nonReentrant whenNotPaused {
        if (feeAmount == 0) revert InvalidAmount();
        if (accountSize == 0) revert InvalidAmount();
        if (phase != 1) revert InvalidPhase();
        if (bytes(accountId).length != 24) revert InvalidAccountId();
        if (challenges[accountId].createdAt != 0) revert ChallengeAlreadyRegistered();
        if (affiliate == msg.sender) revert SelfReferral();
        if (cfndToken.totalSupply() == 0) revert PoolMustHaveDeposits();
        if (challengeTierFee[accountSize] == 0 || challengeTierFee[accountSize] != feeAmount) revert TierNotEnabled();
        if (lpCapitalBalance() < challengeTierTvlThreshold[accountSize]) revert TvlTooLow();

        // Collect challenge fee + gas reimbursement from user
        uint256 totalIn = feeAmount + gasReimbursementUsdc;
        usdc.safeTransferFrom(msg.sender, address(this), totalIn);

        // Send gas reimbursement to labs wallet
        if (gasReimbursementUsdc > 0) usdc.safeTransfer(labsWallet, gasReimbursementUsdc);

        uint256 profitTargetBps = defaultPhase1ProfitTargetBps;

        challenges[accountId] = Challenge({
            trader:          msg.sender,
            accountSizeUsdc: accountSize,
            phase:           phase,
            settled:         false,
            createdAt:       block.timestamp,
            profitTargetBps: profitTargetBps,
            maxDailyLossBps: defaultMaxDailyLossBps,
            maxTotalLossBps: defaultMaxTotalLossBps,
            minTradingDays:  defaultMinTradingDays,
            traderShareBps:  defaultTraderShareBps,
            maxBestDayBps:   defaultMaxBestDayBps
        });

        // 24% → protocol
        uint256 protocolRevenue = (feeAmount * FEE_PROTOCOL_BPS) / BPS;
        usdc.safeTransfer(labsWallet, protocolRevenue);

        // 6% → LP profit pool (reward-per-token yield)
        uint256 lpProfitShare = (feeAmount * FEE_PROFIT_POOL_BPS) / BPS;
        _addToProfit(lpProfitShare);

        // Tiered affiliate commission — first referral per trader only.
        // Repeat purchases by the same trader do not earn commission or
        // count toward the affiliate's monthly volume.
        uint256 affiliateRevenue = 0;
        if (affiliate != address(0) && !affiliateHasReferred[affiliate][msg.sender]) {
            affiliateHasReferred[affiliate][msg.sender] = true;

            uint256 epoch = _currentMonthEpoch();
            uint256 currentVolume = affiliateMonthlyVolume[affiliate][epoch];
            uint256 rateBps = _affiliateRateBps(currentVolume);
            affiliateRevenue = (feeAmount * rateBps) / BPS;
            usdc.safeTransfer(affiliate, affiliateRevenue);
            // Update monthly volume AFTER calculating rate (volume grows for next purchase)
            affiliateMonthlyVolume[affiliate][epoch] += feeAmount;
        }

        // Remaining stays in contract as capital reserves to fund trader payouts
        uint256 lpCapitalShare = feeAmount - protocolRevenue - lpProfitShare - affiliateRevenue;

        emit ChallengeRegistered(
            msg.sender, accountId, accountSize, phase,
            feeAmount, protocolRevenue, lpProfitShare, lpCapitalShare,
            affiliate, affiliateRevenue
        );
    }

    // ── Trader: register Phase 2 challenge ───────────────────────────────────

    /**
     * @notice Register a Phase 2 challenge after passing Phase 1. Free — no fee.
     *         Permissionless — the trader calls this directly. Backend multi-sig
     *         signatures attest that Phase 1 was genuinely completed.
     *         No admin action required.
     *
     * @param phase1AccountId  The Base44 ID of the settled Phase 1 challenge
     * @param phase2AccountId  New 24-char Base44 ID for the Phase 2 challenge
     * @param accountSize      Simulated account size (USDC, 6 decimals)
     * @param deadline         Signature expiry timestamp
     * @param signatures       ECDSA signatures from authorized signers (sorted ascending)
     */
    function registerPhase2(
        string  calldata phase1AccountId,
        string  calldata phase2AccountId,
        uint256 accountSize,
        uint256 deadline,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        if (accountSize == 0) revert InvalidAmount();
        if (bytes(phase2AccountId).length != 24) revert InvalidAccountId();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify the Phase 1 challenge exists, is Phase 1, not yet settled, and belongs to caller.
        // registerPhase2 settles the Phase 1 challenge itself — no prior claimPayout needed.
        Challenge storage ph1 = challenges[phase1AccountId];
        if (ph1.createdAt == 0) revert ChallengeNotRegistered();
        if (ph1.phase != 1) revert InvalidPhase();
        if (ph1.settled) revert ChallengeAlreadySettled();
        if (ph1.trader != msg.sender) revert NotChallengeOwner();

        // Phase 2 account ID must be fresh
        if (challenges[phase2AccountId].createdAt != 0) revert ChallengeAlreadyRegistered();

        // Verify multi-sig attestation that Phase 1 was genuinely passed
        if (signatures.length < signatureThreshold) revert InsufficientSignatures();

        bytes32 msgHash = keccak256(abi.encode(
            msg.sender,
            phase1AccountId,
            phase2AccountId,
            accountSize,
            deadline,
            block.chainid,
            address(this)
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);

        address lastSigner = address(0);
        for (uint256 i = 0; i < signatures.length; i++) {
            address recovered = ethHash.recover(signatures[i]);
            if (!authorizedSigners[recovered]) revert UnauthorizedSigner();
            if (recovered <= lastSigner) revert DuplicateOrUnsortedSignature();
            lastSigner = recovered;
        }

        ph1.settled = true; // settle Phase 1 as part of this transition

        challenges[phase2AccountId] = Challenge({
            trader:          msg.sender,
            accountSizeUsdc: accountSize,
            phase:           2,
            settled:         false,
            createdAt:       block.timestamp,
            profitTargetBps: defaultPhase2ProfitTargetBps,
            maxDailyLossBps: defaultMaxDailyLossBps,
            maxTotalLossBps: defaultMaxTotalLossBps,
            minTradingDays:  defaultMinTradingDays,
            traderShareBps:  defaultTraderShareBps,
            maxBestDayBps:   defaultMaxBestDayBps
        });

        emit Phase2Registered(msg.sender, phase1AccountId, phase2AccountId, accountSize);
    }

    /**
     * @notice Register a funded account after passing Phase 2.
     *         Permissionless — the trader calls this directly. The payout
     *         signers attest via ECDSA that Phase 2 was genuinely passed.
     *         No USDC payout — this is a phase transition only.
     *
     *         Uses the same hash structure as registerPostPayout so the
     *         existing generatePostPayoutProof backend function can sign for it.
     *
     * @param phase2AccountId  The Phase 2 challenge account ID (must be unsettled)
     * @param fundedAccountId  New 24-char hex ID for the funded challenge
     * @param fundedAccountSize Account size in USDC (6-decimal units)
     * @param deadline         Signature expiry timestamp
     * @param signatures       ECDSA signatures from authorized signers (sorted ascending)
     */
    function registerFunded(
        string  calldata phase2AccountId,
        string  calldata fundedAccountId,
        uint256 fundedAccountSize,
        uint256 deadline,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        if (fundedAccountSize == 0) revert InvalidAmount();
        if (bytes(fundedAccountId).length != 24) revert InvalidAccountId();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify the Phase 2 challenge exists, is Phase 2, not yet settled, belongs to caller
        Challenge storage ph2 = challenges[phase2AccountId];
        if (ph2.createdAt == 0) revert ChallengeNotRegistered();
        if (ph2.phase != 2) revert InvalidPhase();
        if (ph2.settled) revert ChallengeAlreadySettled();
        if (ph2.trader != msg.sender) revert NotChallengeOwner();

        // Funded account ID must be fresh
        if (challenges[fundedAccountId].createdAt != 0) revert FreshAccountAlreadyRegistered();

        // Verify multi-sig attestation — same hash layout as registerPostPayout so
        // generatePostPayoutProof can produce valid signatures for this function.
        if (signatures.length < signatureThreshold) revert InsufficientSignatures();

        bytes32 msgHash = keccak256(abi.encode(
            msg.sender,
            phase2AccountId,
            fundedAccountId,
            fundedAccountSize,
            deadline,
            block.chainid,
            address(this)
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);

        address lastSigner = address(0);
        for (uint256 i = 0; i < signatures.length; i++) {
            address recovered = ethHash.recover(signatures[i]);
            if (!authorizedSigners[recovered]) revert UnauthorizedSigner();
            if (recovered <= lastSigner) revert DuplicateOrUnsortedSignature();
            lastSigner = recovered;
        }

        ph2.settled = true; // settle Phase 2 as part of this transition

        challenges[fundedAccountId] = Challenge({
            trader:          msg.sender,
            accountSizeUsdc: fundedAccountSize,
            phase:           3,
            settled:         false,
            createdAt:       block.timestamp,
            profitTargetBps: 0,
            maxDailyLossBps: defaultMaxDailyLossBps,
            maxTotalLossBps: defaultMaxTotalLossBps,
            minTradingDays:  defaultMinTradingDays,
            traderShareBps:  defaultTraderShareBps,
            maxBestDayBps:   defaultMaxBestDayBps
        });

        emit FundedRegistered(msg.sender, phase2AccountId, fundedAccountId, fundedAccountSize);
    }

    // ── Trader: claim payout ─────────────────────────────────────────────────

    /**
     * @notice Submit a backend-signed compliance proof to claim a trader payout.
     *
     *         Rule checks (all must pass):
     *           ✓ worstDailyLossBps  ≤ maxDailyLossBps
     *           ✓ maxDrawdownBps     ≤ maxTotalLossBps
     *           ✓ tradingDaysCount   ≥ minTradingDays
     *           ✓ grossProfitUsdc    ≥ accountSize × profitTargetBps / BPS
     *           ✓ bestDayBps         ≤ maxBestDayBps  (50% rule: best day ≤ 50% of total profit)
     *
     *         Payout splits (grossProfitUsdc = G):
     *           80%   → trader (traderShare)
     *           16%   → labsWallet / ChainFunded Labs (firmCut × 80%)
     *           4%    → LP profit pool (firmCut × 20%)
     *
     *         LP capital absorbs the full gross (traderShare + protocolShare leave
     *         the pool; 4% lpProfitShare stays as profit pool credit).
     *         CFND NAV decreases by G / cfndSupply.
     *
     * @param accountId         Base44 ChallengeAccount ID
     * @param grossProfitUsdc   Total realized P&L (USDC, 6 decimals)
     * @param worstDailyLossBps Worst single-day loss (BPS of account size)
     * @param maxDrawdownBps    Max loss from opening balance (BPS)
     * @param tradingDaysCount  Distinct calendar days with closed trades
     * @param bestDayBps        Best single-day profit as BPS of total gross profit (50% rule)
     * @param payoutId          Unique Base44 Payout record ID (replay protection)
     * @param signatures        Backend ECDSA signatures (sorted by signer address, ascending)
     */
    function claimPayout(
        string  calldata accountId,
        uint256 grossProfitUsdc,
        uint256 worstDailyLossBps,
        uint256 maxDrawdownBps,
        uint256 tradingDaysCount,
        uint256 bestDayBps,
        string  calldata payoutId,
        uint256 deadline,
        bytes[] calldata signatures,
        uint256 gasReimbursementUsdc
    ) external nonReentrant whenNotPaused {
        if (bytes(accountId).length == 0) revert InvalidAccountId();
        if (bytes(payoutId).length == 0) revert InvalidPayoutId();
        if (settledPayouts[payoutId]) revert PayoutAlreadySettled();
        if (grossProfitUsdc == 0) revert NoProfitForPayout();
        if (block.timestamp > deadline) revert SignatureExpired();

        Challenge storage ch = challenges[accountId];
        if (ch.createdAt == 0) revert ChallengeNotRegistered();
        if (ch.settled) revert ChallengeAlreadySettled();
        if (ch.trader != msg.sender) revert NotChallengeOwner();

        // ── Verify multi-sig backend signatures ──────────────────────────────
        // Uses abi.encode (not encodePacked) to avoid hash collisions with
        // dynamic string types (accountId, payoutId). Backend must match.
        if (signatures.length < signatureThreshold) revert InsufficientSignatures();

        bytes32 msgHash = keccak256(abi.encode(
            msg.sender,
            accountId,
            grossProfitUsdc,
            worstDailyLossBps,
            maxDrawdownBps,
            tradingDaysCount,
            bestDayBps,
            payoutId,
            deadline,
            block.chainid,
            address(this)
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);

        address lastSigner = address(0);
        for (uint256 i = 0; i < signatures.length; i++) {
            address recovered = ethHash.recover(signatures[i]);
            if (!authorizedSigners[recovered]) revert UnauthorizedSigner();
            // Signatures must be sorted by signer address (ascending) to
            // cheaply enforce uniqueness without a mapping.
            if (recovered <= lastSigner) revert DuplicateOrUnsortedSignature();
            lastSigner = recovered;
        }

        // ── Rule enforcement ─────────────────────────────────────────────────
        if (worstDailyLossBps > ch.maxDailyLossBps) revert RuleBreachedDailyLoss();
        if (maxDrawdownBps > ch.maxTotalLossBps) revert RuleBreachedTotalLoss();
        if (tradingDaysCount < ch.minTradingDays) revert RuleBreachedMinDays();
        if (grossProfitUsdc < (ch.accountSizeUsdc * ch.profitTargetBps) / BPS) revert RuleBreachedProfitTarget();
        if (bestDayBps > ch.maxBestDayBps) revert RuleBreachedBestDay();

        // ── Capital solvency check ───────────────────────────────────────────
        uint256 traderShare   = (grossProfitUsdc * ch.traderShareBps) / BPS;
        uint256 firmCut       = grossProfitUsdc - traderShare;
        uint256 protocolShare = (firmCut * FIRM_CUT_PROTOCOL_BPS) / BPS;
        uint256 lpProfitShare = firmCut - protocolShare;

        uint256 totalOut = traderShare + protocolShare;
        if (lpCapitalBalance() < totalOut) revert InsufficientLPCapital();

        ch.settled               = true;
        settledPayouts[payoutId] = true;

        // Deduct gas reimbursement from trader's share (covers sponsored gas)
        if (gasReimbursementUsdc >= traderShare) revert GasExceedsTraderShare();
        uint256 traderNet = traderShare - gasReimbursementUsdc;

        // Transfer payout from LP capital
        usdc.safeTransfer(ch.trader, traderNet);
        if (gasReimbursementUsdc > 0) usdc.safeTransfer(labsWallet, gasReimbursementUsdc);
        if (protocolShare > 0) usdc.safeTransfer(labsWallet, protocolShare);

        // Credit LP profit pool — stays in contract, CFND NAV unaffected by this portion
        _addToProfit(lpProfitShare);

        emit PayoutClaimed(
            ch.trader, accountId, payoutId,
            grossProfitUsdc, traderNet, protocolShare, lpProfitShare
        );
    }

    // ── Post-payout re-registration (permissionless, signer-attested) ─────────

    /**
     * @notice Register a fresh funded account after a successful payout.
     *         Permissionless — the trader calls this directly. The payout
     *         signers attest via ECDSA that the trader is entitled to a new
     *         funded account. No governance vote or owner action required.
     *
     *         Requirements:
     *           - settledAccountId must reference a settled challenge owned by msg.sender
     *           - freshAccountId must not already exist
     *           - Multi-sig signatures from authorized signers (same as payouts)
     *
     * @param settledAccountId  The account ID of the settled (paid out) challenge
     * @param freshAccountId    New 24-char hex account ID for the funded account
     * @param freshAccountSize  Account size in USDC (6-decimal units)
     * @param deadline          Signature expiry timestamp
     * @param signatures        ECDSA signatures from authorized signers (sorted ascending)
     */
    function registerPostPayout(
        string  calldata settledAccountId,
        string  calldata freshAccountId,
        uint256 freshAccountSize,
        uint256 deadline,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        if (freshAccountSize == 0) revert InvalidAmount();
        if (bytes(freshAccountId).length != 24) revert InvalidAccountId();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify the settled challenge exists, is settled, and belongs to the caller
        Challenge storage settled = challenges[settledAccountId];
        if (settled.createdAt == 0) revert ChallengeNotRegistered();
        if (!settled.settled) revert ChallengeNotSettled();
        if (settled.trader != msg.sender) revert NotChallengeOwner();

        // Fresh account must not already exist
        if (challenges[freshAccountId].createdAt != 0) revert FreshAccountAlreadyRegistered();

        // Verify multi-sig signatures
        if (signatures.length < signatureThreshold) revert InsufficientSignatures();

        bytes32 msgHash = keccak256(abi.encode(
            msg.sender,
            settledAccountId,
            freshAccountId,
            freshAccountSize,
            deadline,
            block.chainid,
            address(this)
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);

        address lastSigner = address(0);
        for (uint256 i = 0; i < signatures.length; i++) {
            address recovered = ethHash.recover(signatures[i]);
            if (!authorizedSigners[recovered]) revert UnauthorizedSigner();
            if (recovered <= lastSigner) revert DuplicateOrUnsortedSignature();
            lastSigner = recovered;
        }

        // Register the fresh funded account (phase 3, no profit target)
        challenges[freshAccountId] = Challenge({
            trader:          msg.sender,
            accountSizeUsdc: freshAccountSize,
            phase:           3,
            settled:         false,
            createdAt:       block.timestamp,
            profitTargetBps: 0,
            maxDailyLossBps: defaultMaxDailyLossBps,
            maxTotalLossBps: defaultMaxTotalLossBps,
            minTradingDays:  defaultMinTradingDays,
            traderShareBps:  defaultTraderShareBps,
            maxBestDayBps:   defaultMaxBestDayBps
        });

        emit PostPayoutRegistered(msg.sender, settledAccountId, freshAccountId, freshAccountSize);
    }

    // ── Owner: admin ──────────────────────────────────────────────────────────

    /**
     * @notice Register a challenge account on behalf of a trader without collecting
     *         a fee.  Used by the admin to bring manually-created (off-chain) funded
     *         accounts into the on-chain verification system so the trader can later
     *         call claimPayout().
     *
     * @param trader      The trader's wallet address (must match account.trader_address
     *                    in Base44 so the claimPayout ownership check passes).
     * @param accountId   The Base44 ChallengeAccount ID string.
     * @param accountSize Account size in USDC (6-decimal units, e.g. 10_000e6 = $10k).
     * @param phase       1 = Phase 1, 2 = Phase 2, 3 = Funded (no profit target).
     */
    function adminRegisterChallenge(
        address trader,
        string  calldata accountId,
        uint256 accountSize,
        uint8   phase
    ) external onlyWhitelisterOrOwner {
        if (adminRegisterDisabled) revert AdminRegisterPermanentlyDisabled();
        if (trader == address(0)) revert InvalidAddress();
        if (accountSize == 0) revert InvalidAmount();
        if (phase < 1 || phase > 3) revert InvalidPhase();
        if (bytes(accountId).length == 0) revert InvalidAccountId();
        if (challenges[accountId].createdAt != 0) revert ChallengeAlreadyRegistered();
        // Only currently-open tiers: the size must be an enabled tier (fee set)
        // and TVL-unlocked. Bounds the whitelister to legitimate, capacity-backed
        // sizes rather than arbitrary off-tier amounts.
        if (challengeTierFee[accountSize] == 0) revert TierNotEnabled();
        if (lpCapitalBalance() < challengeTierTvlThreshold[accountSize]) revert TvlTooLow();

        // Funded accounts (phase 3) have no profit target — they already
        // passed both challenge phases. Any positive P&L is claimable.
        uint256 profitTargetBps = phase == 3
            ? 0
            : phase == 1
                ? defaultPhase1ProfitTargetBps
                : defaultPhase2ProfitTargetBps;

        challenges[accountId] = Challenge({
            trader:          trader,
            accountSizeUsdc: accountSize,
            phase:           phase,
            settled:         false,
            createdAt:       block.timestamp,
            profitTargetBps: profitTargetBps,
            maxDailyLossBps: defaultMaxDailyLossBps,
            maxTotalLossBps: defaultMaxTotalLossBps,
            minTradingDays:  defaultMinTradingDays,
            traderShareBps:  defaultTraderShareBps,
            maxBestDayBps:   defaultMaxBestDayBps
        });

        emit ChallengeRegistered(trader, accountId, accountSize, phase, 0, 0, 0, 0, address(0), 0);
    }

    /**
     * @notice Permanently disable adminRegisterChallenge. Irreversible.
     *         Call via governance proposal once all whitelist accounts have
     *         been registered, so the DAO cannot create free accounts.
     */
    function disableAdminRegister() external onlyOwner {
        if (adminRegisterDisabled) revert AdminRegisterPermanentlyDisabled();
        adminRegisterDisabled = true;
        emit AdminRegisterDisabled();
    }

    /**
     * @notice Update default rules for future challenges.
     *         Existing challenges are unaffected (rules snapshotted at purchase).
     */
    function setDefaultRules(
        uint256 phase1ProfitTargetBps,
        uint256 phase2ProfitTargetBps,
        uint256 maxDailyLossBps,
        uint256 maxTotalLossBps,
        uint256 minTradingDays,
        uint256 traderShareBps,
        uint256 maxBestDayBps
    ) external onlyOwner {
        if (phase1ProfitTargetBps > BPS) revert InvalidRuleValue();
        if (phase2ProfitTargetBps > BPS) revert InvalidRuleValue();
        if (maxDailyLossBps > BPS) revert InvalidRuleValue();
        if (maxTotalLossBps > BPS) revert InvalidRuleValue();
        if (traderShareBps > BPS) revert InvalidRuleValue();
        if (maxBestDayBps > BPS) revert InvalidRuleValue();

        defaultPhase1ProfitTargetBps = phase1ProfitTargetBps;
        defaultPhase2ProfitTargetBps = phase2ProfitTargetBps;
        defaultMaxDailyLossBps       = maxDailyLossBps;
        defaultMaxTotalLossBps       = maxTotalLossBps;
        defaultMinTradingDays        = minTradingDays;
        defaultTraderShareBps        = traderShareBps;
        defaultMaxBestDayBps         = maxBestDayBps;

        emit RulesUpdated();
    }

    /**
     * @notice Update affiliate tier thresholds and commission rates.
     *         Adjustable by owner (Timelock governance on mainnet).
     *
     *         Arrays must be equal length, sorted ascending by threshold,
     *         and no rate may exceed MAX_AFFILIATE_BPS (20%).
     *
     * @param thresholds Monthly volume thresholds in USDC (6 decimals), sorted ascending
     * @param rates      Commission rates in BPS corresponding to each threshold
     */
    /**
     * @notice Update challenge tiers — set which account sizes are available
     *         and their corresponding evaluation fees.
     *         Adjustable by owner (Timelock governance on mainnet).
     *
     *         To add or update a tier, include it in the arrays.
     *         To remove a tier, omit it — any size not in the new arrays
     *         will have its fee set to 0 (disabled).
     *
     * @param sizes         Array of account sizes (USDC, 6 decimals)
     * @param fees          Array of evaluation fees (USDC, 6 decimals), same length
     * @param tvlThresholds Array of minimum LP capital (TVL) to unlock each tier. 0 = always available.
     */
    function setChallengeTiers(
        uint256[] calldata sizes,
        uint256[] calldata fees,
        uint256[] calldata tvlThresholds
    ) external onlyOwner {
        if (sizes.length == 0) revert InvalidAmount();
        if (sizes.length > 20) revert TooManyTiers();
        if (sizes.length != fees.length) revert LengthMismatch();
        if (sizes.length != tvlThresholds.length) revert LengthMismatch();

        // Clear existing tiers
        uint256 tierCount = challengeTierSizes.length;
        for (uint256 i = 0; i < tierCount; i++) {
            uint256 s = challengeTierSizes[i];
            delete challengeTierFee[s];
            delete challengeTierTvlThreshold[s];
        }
        delete challengeTierSizes;

        // Set new tiers
        for (uint256 i = 0; i < sizes.length; i++) {
            if (sizes[i] == 0) revert InvalidAmount();
            if (fees[i] == 0) revert InvalidAmount();
            if (fees[i] < sizes[i] / 1000) revert FeeTooLow();
            if (fees[i] > sizes[i] / 10) revert FeeTooHigh();
            challengeTierFee[sizes[i]] = fees[i];
            challengeTierTvlThreshold[sizes[i]] = tvlThresholds[i];
            challengeTierSizes.push(sizes[i]);
        }

        emit ChallengeTiersUpdated();
    }

    function setAffiliateTiers(
        uint256[] calldata thresholds,
        uint256[] calldata rates
    ) external onlyOwner {
        if (thresholds.length == 0) revert InvalidAmount();
        if (thresholds.length > 20) revert TooManyTiers();
        if (thresholds.length != rates.length) revert LengthMismatch();
        if (thresholds[0] != 0) revert ThresholdsNotAscending();

        for (uint256 i = 0; i < thresholds.length; i++) {
            if (rates[i] > MAX_AFFILIATE_BPS) revert RateExceedsCap();
            if (i > 0) {
                if (thresholds[i] <= thresholds[i - 1]) revert ThresholdsNotAscending();
                if (rates[i] < rates[i - 1]) revert RatesNotNonDecreasing();
            }
        }

        delete affiliateTierThresholds;
        delete affiliateTierRates;

        for (uint256 i = 0; i < thresholds.length; i++) {
            affiliateTierThresholds.push(thresholds[i]);
            affiliateTierRates.push(rates[i]);
        }

        emit AffiliateTiersUpdated(thresholds, rates);
    }

    function addSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidAddress();
        if (authorizedSigners[signer]) revert DuplicateSigner();
        authorizedSigners[signer] = true;
        signerCount++;
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external onlyOwner {
        if (!authorizedSigners[signer]) revert NotASigner();
        authorizedSigners[signer] = false;
        signerCount--;
        if (signerCount < signatureThreshold) revert WouldBreachThreshold();
        emit SignerRemoved(signer);
    }

    function setSignatureThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0) revert InvalidThreshold();
        if (newThreshold > signerCount) revert InvalidThreshold();
        emit SignatureThresholdUpdated(signatureThreshold, newThreshold);
        signatureThreshold = newThreshold;
    }

    function updateLabsWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        emit LabsWalletUpdated(labsWallet, newWallet);
        labsWallet = newWallet;
    }

    /**
     * @notice Request an emergency withdrawal. Subject to a 48-hour delay
     *         before execution. Emits an event so LPs can monitor and react.
     *
     * @param to        Recipient address
     * @param amount    USDC amount (6 decimals)
     * @param isCapital True = LP capital, false = profit pool
     */
    function requestEmergencyWithdrawal(address to, uint256 amount, bool isCapital) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        bytes32 requestId = keccak256(abi.encode(to, amount, isCapital, block.timestamp, emergencyRequestNonce++));
        uint256 executeAfter = block.timestamp + EMERGENCY_DELAY;

        emergencyRequests[requestId] = EmergencyRequest({
            to: to,
            amount: amount,
            isCapital: isCapital,
            executeAfter: executeAfter
        });

        emit EmergencyWithdrawalRequested(requestId, to, amount, isCapital, executeAfter);
    }

    /**
     * @notice Execute a previously requested emergency withdrawal after the
     *         48-hour delay has elapsed.
     *
     * @param requestId The ID returned by requestEmergencyWithdrawal
     */
    function executeEmergencyWithdrawal(bytes32 requestId) external onlyOwner nonReentrant {
        EmergencyRequest storage req = emergencyRequests[requestId];
        if (req.executeAfter == 0) revert InvalidEmergencyRequest();
        if (block.timestamp < req.executeAfter) revert DelayNotMet();

        address to = req.to;
        uint256 amount = req.amount;
        bool isCapital = req.isCapital;

        delete emergencyRequests[requestId];

        if (isCapital) {
            if (lpCapitalBalance() < amount) revert ExceedsLPCapital();
        } else {
            if (profitPoolBalance < amount) revert ExceedsProfitPool();
            profitPoolBalance -= amount;
        }

        usdc.safeTransfer(to, amount);
        emit EmergencyWithdrawalExecuted(requestId, to, amount, isCapital);
    }

    /**
     * @notice Cancel a pending emergency withdrawal request.
     *
     * @param requestId The ID of the request to cancel
     */
    function cancelEmergencyWithdrawal(bytes32 requestId) external onlyOwner {
        if (emergencyRequests[requestId].executeAfter == 0) revert InvalidEmergencyRequest();
        delete emergencyRequests[requestId];
        emit EmergencyWithdrawalCancelled(requestId);
    }

    // ── Guardian (emergency pause) ────────────────────────────────────────────

    modifier onlyGuardianOrOwner() {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardianOrOwner();
        _;
    }

    /**
     * @notice Pause the protocol. Blocks deposits, withdrawals, registrations, and payouts.
     *         Can be called by the guardian (multi-sig) OR the owner (governance timelock).
     *         This is the emergency circuit breaker.
     */
    function pause() external onlyGuardianOrOwner {
        _pause();
    }

    /**
     * @notice Unpause the protocol. Only the owner (governance) can unpause.
     *         The guardian can pause but cannot unilaterally unpause — this ensures
     *         governance has the final say on resuming operations.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Update the guardian address. Only callable by owner (governance).
     * @param newGuardian New guardian address (typically a multi-sig)
     */
    function updateGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert InvalidAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    // ── Whitelister (timelock-bypass account whitelisting) ──────────────────

    modifier onlyWhitelisterOrOwner() {
        if (msg.sender != whitelister && msg.sender != owner()) revert NotWhitelisterOrOwner();
        _;
    }

    /**
     * @notice Update the whitelister address. Only callable by owner (governance).
     *         The whitelister can call adminRegisterChallenge directly, so marketing
     *         giveaway accounts can be granted without a governance proposal after
     *         ownership moves to the timelock. Pass address(0) to revoke the role.
     *
     *         The role is intentionally low-privilege: it can only create free,
     *         simulated challenge accounts of currently-open sizes. It cannot move
     *         funds (payouts still require backend-signed proofs + the signer
     *         threshold), and it remains subject to the permanent
     *         adminRegisterDisabled kill-switch.
     * @param newWhitelister New whitelister address (typically a multi-sig)
     */
    function updateWhitelister(address newWhitelister) external onlyOwner {
        emit WhitelisterUpdated(whitelister, newWhitelister);
        whitelister = newWhitelister;
    }

    // ── CFND transfer whitelist ─────────────────────────────────────────────

    /**
     * @notice Whitelist an address for CFND transfers via transferCfnd().
     *         Intended for staking contracts (e.g. CFGLPRewards) that need to
     *         move CFND on behalf of LPs while keeping rewardDebt in sync.
     */
    function setCfndTransferWhitelist(address addr, bool enabled) external onlyOwner {
        cfndTransferWhitelist[addr] = enabled;
        emit CfndTransferWhitelistUpdated(addr, enabled);
    }

    /**
     * @notice Move CFND between addresses with proper profit-accumulator sync.
     *         Only callable by whitelisted addresses (staking contracts).
     *
     *         Flow:
     *           1. Harvest pending USDC profit for both `from` and `to`.
     *           2. Burn CFND from `from`, mint to `to` (totalSupply unchanged).
     *           3. Sync rewardDebt for both addresses.
     *
     *         USDC profit harvested for `from` is sent to `from`; profit
     *         harvested for `to` is sent to `to` (the staking contract).
     *
     * @param from   Address to move CFND from (typically the LP).
     * @param to     Address to move CFND to (typically the staking contract).
     * @param amount CFND amount to transfer (6 decimals, same as USDC).
     */
    function transferCfnd(address from, address to, uint256 amount) external nonReentrant whenNotPaused {
        if (!cfndTransferWhitelist[msg.sender]) revert CallerNotWhitelisted();
        if (amount == 0) revert InvalidAmount();
        if (cfndToken.balanceOf(from) < amount) revert InsufficientCFND();

        // Calculate pending profits before any state changes
        uint256 fromPending = _pendingProfit(from);
        uint256 toPending = _pendingProfit(to);

        // Effects: update state
        if (fromPending > 0) {
            profitPoolBalance -= fromPending;
        }
        if (toPending > 0) {
            profitPoolBalance -= toPending;
        }

        // Move CFND via burn+mint (totalSupply stays constant)
        cfndToken.burn(from, amount);
        cfndToken.mint(to, amount);

        // Sync rewardDebt for both addresses
        rewardDebt[from] = (cfndToken.balanceOf(from) * accProfitPerToken) / ACC_PRECISION;
        rewardDebt[to]   = (cfndToken.balanceOf(to)   * accProfitPerToken) / ACC_PRECISION;

        // Stamp the recipient's deposit block so same-block sandwich protection
        // applies to CFND received via transfer, not just via deposit().
        lastDepositBlock[to] = block.number;

        // Interactions: external calls last
        if (fromPending > 0) {
            usdc.safeTransfer(from, fromPending);
            emit ProfitClaimed(from, fromPending);
        }
        if (toPending > 0) {
            usdc.safeTransfer(to, toPending);
            emit ProfitClaimed(to, toPending);
        }

        emit CfndTransferred(from, to, amount);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    /** @notice Total USDC held by this contract (LP capital + profit pool). */
    function totalBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /**
     * @notice USDC available for LP withdrawals = total − profit pool.
     *         When capital ≥ CFND supply the pool is healthy and withdrawals
     *         settle at 1:1. Below that threshold withdrawals are pro-rata.
     */
    function lpCapitalBalance() public view returns (uint256) {
        uint256 total = usdc.balanceOf(address(this));
        return total > profitPoolBalance ? total - profitPoolBalance : 0;
    }

    /**
     * @notice CFND net asset value — capped at $1.00 (1:1 peg).
     *         Falls below $1.00 only when trader payouts have depleted LP
     *         capital below CFND supply. Fee revenue in the pool is surplus
     *         that absorbs payout risk — it does not inflate CFND value.
     */
    function cfndPriceUsdc() external view returns (uint256) {
        uint256 supply = cfndToken.totalSupply();
        if (supply == 0) return 1e6;
        uint256 capital = lpCapitalBalance();
        if (capital >= supply) return 1e6; // healthy: capped at $1.00
        return (capital * 1e6) / supply;   // depleted: below peg
    }

    /**
     * @notice Preview USDC return for burning `cfndAmount` CFND.
     *         Returns cfndAmount (1:1 peg) when pool is healthy, or the
     *         pro-rata share of available capital if depleted.
     */
    function previewWithdraw(uint256 cfndAmount) external view returns (uint256) {
        uint256 supply = cfndToken.totalSupply();
        if (supply == 0) return 0;
        uint256 capital = lpCapitalBalance();
        if (capital >= supply) return cfndAmount; // healthy: 1:1
        uint256 proRata = (cfndAmount * capital) / supply;
        return proRata < cfndAmount ? proRata : cfndAmount;
    }

    /**
     * @notice Pool solvency ratio (scaled ×1e6). 1_000_000 = fully solvent.
     *         Based on LP-contributed capital (CFND supply) vs available capital.
     */
    function solvencyRatio() external view returns (uint256) {
        uint256 supply = cfndToken.totalSupply();
        if (supply == 0) return 1_000_000;
        uint256 capital = lpCapitalBalance();
        if (capital >= supply) return 1_000_000; // capped at 100%
        return (capital * 1_000_000) / supply;
    }

    /** @notice Pending (unclaimed) profit for an LP address. */
    function pendingProfit(address lp) external view returns (uint256) {
        return _pendingProfit(lp);
    }

    /** @notice Address of the CFND LP token. */
    function cfndTokenAddress() external view returns (address) {
        return address(cfndToken);
    }

    /** @notice Look up a registered challenge. */
    function getChallenge(string calldata accountId) external view returns (Challenge memory) {
        return challenges[accountId];
    }

    /** @notice Whether a payout ID has already been settled. */
    function isPayoutSettled(string calldata payoutId) external view returns (bool) {
        return settledPayouts[payoutId];
    }

    /**
     * @notice Preview whether a payout would pass all rule checks.
     *         Returns (passes, failReason). Call off-chain before submitting.
     */
    function previewPayout(
        string  calldata accountId,
        uint256 grossProfitUsdc,
        uint256 worstDailyLossBps,
        uint256 maxDrawdownBps,
        uint256 tradingDaysCount,
        uint256 bestDayBps
    ) external view returns (bool passes, string memory failReason) {
        Challenge storage ch = challenges[accountId];
        if (ch.createdAt == 0) return (false, "Challenge not registered");
        if (ch.settled)        return (false, "Challenge already settled");

        if (worstDailyLossBps > ch.maxDailyLossBps)
            return (false, "Rule breached: max daily loss exceeded");
        if (maxDrawdownBps > ch.maxTotalLossBps)
            return (false, "Rule breached: max total loss exceeded");
        if (tradingDaysCount < ch.minTradingDays)
            return (false, "Rule breached: minimum trading days not met");
        if (grossProfitUsdc < (ch.accountSizeUsdc * ch.profitTargetBps) / BPS)
            return (false, "Rule breached: profit target not reached");
        if (bestDayBps > ch.maxBestDayBps)
            return (false, "Rule breached: best day exceeds 50% of total profit");

        uint256 traderShare   = (grossProfitUsdc * ch.traderShareBps) / BPS;
        uint256 firmCut       = grossProfitUsdc - traderShare;
        uint256 protocolShare = (firmCut * FIRM_CUT_PROTOCOL_BPS) / BPS;
        if (lpCapitalBalance() < traderShare + protocolShare)
            return (false, "Insufficient LP capital for payout");

        return (true, "");
    }

    // ── Challenge tier view functions ─────────────────────────────────────────

    /** @notice Number of challenge tiers configured. */
    function challengeTierCount() external view returns (uint256) {
        return challengeTierSizes.length;
    }

    /**
     * @notice Get all challenge tiers in a single call (for frontend display).
     * @return sizes          Array of account sizes (USDC, 6 decimals)
     * @return fees           Array of evaluation fees (USDC, 6 decimals)
     * @return tvlThresholds  Array of TVL thresholds to unlock each tier (0 = always available)
     */
    function getChallengeTiers() external view returns (
        uint256[] memory sizes,
        uint256[] memory fees,
        uint256[] memory tvlThresholds
    ) {
        uint256 len = challengeTierSizes.length;
        sizes          = new uint256[](len);
        fees           = new uint256[](len);
        tvlThresholds  = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 s = challengeTierSizes[i];
            sizes[i]         = s;
            fees[i]          = challengeTierFee[s];
            tvlThresholds[i] = challengeTierTvlThreshold[s];
        }
        return (sizes, fees, tvlThresholds);
    }

    // ── Affiliate view functions ─────────────────────────────────────────────

    /**
     * @notice Get the current commission rate (BPS) for an affiliate based on
     *         their monthly volume in the current calendar month.
     */
    function getAffiliateRateBps(address affiliate) external view returns (uint256) {
        uint256 epoch = _currentMonthEpoch();
        return _affiliateRateBps(affiliateMonthlyVolume[affiliate][epoch]);
    }

    /**
     * @notice Get an affiliate's total referred fee volume for the current month.
     */
    function getAffiliateMonthlyVolume(address affiliate) external view returns (uint256) {
        uint256 epoch = _currentMonthEpoch();
        return affiliateMonthlyVolume[affiliate][epoch];
    }

    /** @notice Number of affiliate tiers configured. */
    function affiliateTierCount() external view returns (uint256) {
        return affiliateTierThresholds.length;
    }

    /**
     * @notice Get all affiliate tiers in a single call (for frontend display).
     * @return thresholds Array of volume thresholds (USDC, 6 decimals)
     * @return rates      Array of commission rates (BPS)
     */
    function getAffiliateTiers() external view returns (
        uint256[] memory thresholds,
        uint256[] memory rates
    ) {
        return (affiliateTierThresholds, affiliateTierRates);
    }
}
