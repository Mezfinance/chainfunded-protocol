// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IChainFundedPool
 * @dev Minimal interface for on-chain challenge verification.
 */
interface IChainFundedPool {
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
        uint256 maxBestDayBps;
    }
    function getChallenge(string calldata accountId) external view returns (Challenge memory);
}

/**
 * @title CFGDistributor
 * @author ChainFunded
 * @notice Season-based CFG token distribution for ChainFunded challenge accounts.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Overview                                                               │
 * │                                                                         │
 * │  The 15 % trading-reward bucket (15,000,000 CFG) is pre-loaded into    │
 * │  this contract and split across 10 six-month seasons using a            │
 * │  front-loaded decay schedule that rewards early participation.          │
 * │                                                                         │
 * │  Every on-chain challenge registration—paid or whitelisted—earns        │
 * │  "points" within the active season. After the season window closes,     │
 * │  anyone can call finalizeSeason(), locking totalPoints so traders can   │
 * │  claim their pro-rata CFG share.                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * On-chain verification
 * ─────────────────────
 *   Every registration is verified against ChainFundedPool.getChallenge().
 *   The contract checks that the challenge exists on-chain and that the
 *   trader, accountSize, and phase match. This prevents reporters from
 *   fabricating registrations even if their key is compromised.
 *
 * Points formula
 * ──────────────
 *   base        = accountSizeUsdc / 1e6    (whole-dollar normalisation)
 *   phaseMulti  = phase == 2 ? 1.5 : 1.0  (Phase 2 earns 50 % more — reward progress)
 *   sourceMulti = isWhitelist ? 0.5 : 1.0 (paid buys earn more than free accounts)
 *   points      = base × phaseMulti × sourceMulti
 *
 *   Example: $10 000 Phase 2 paid account  → 10000 × 1.5 × 1.0 = 15 000 pts
 *            $1 000  Phase 1 whitelist      → 1000  × 1.0 × 0.5 =    500 pts
 *
 * Season schedule (10 × ~6-month seasons, 15 M CFG total)
 * ────────────────────────────────────────────────────────
 *   Season  1   4,500,000 CFG   30.00 %
 *   Season  2   3,000,000 CFG   20.00 %
 *   Season  3   2,250,000 CFG   15.00 %
 *   Season  4   1,500,000 CFG   10.00 %
 *   Season  5   1,125,000 CFG    7.50 %
 *   Season  6     750,000 CFG    5.00 %
 *   Season  7     562,500 CFG    3.75 %
 *   Season  8     562,500 CFG    3.75 %
 *   Season  9     375,000 CFG    2.50 %
 *   Season 10     375,000 CFG    2.50 %
 *              ──────────────────────────
 *              15,000,000 CFG  100.00 %
 *
 * Registration model
 * ──────────────────
 * recordRegistration() is intentionally permissionless — anyone can call it,
 * including traders registering their own accounts via the frontend. The
 * contract verifies every registration on-chain against ChainFundedPool:
 * the challenge must exist with matching trader, accountSize, and phase.
 * Duplicate accountIds are rejected, preventing double-counting. There is
 * no spam risk because each registration must correspond to a real on-chain
 * challenge, and each challenge can only be registered once.
 *
 * A batch variant (recordRegistrationBatch) is restricted to approved
 * "reporter" addresses (onlyReporter) for backfilling at season launch.
 *
 * The only reporter/owner-attested field is isWhitelist (whether the
 * challenge was admin-registered with zero fee). When called by a
 * non-reporter, isWhitelist is forced to false. This is a minor
 * multiplier (0.5× vs 1.0×) and cannot inflate points beyond the
 * verified account size.
 *
 * Claim flow
 * ──────────
 * 1. Season window closes (block.timestamp >= season.endTime).
 * 2. Anyone calls finalizeSeason(seasonId) → locks totalPoints.
 * 3. Traders call claim(seasonId) → receive (traderPoints / totalPoints) × cfgBudget.
 *
 * No time limit on claiming — traders can claim at any time after finalization.
 */
contract CFGDistributor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @dev Total number of seasons in the distribution schedule.
    uint256 public constant MAX_SEASONS = 10;

    /// @dev Duration of each season in seconds (~6 months).
    uint256 public constant SEASON_DURATION = 182 days;

    /// @dev Total CFG allocated to this distributor (15 M tokens, 18 dec).
    uint256 public constant TOTAL_CFG = 15_000_000e18;

    /// @dev Multiplier precision: 10_000 = 1.0×
    uint256 private constant PREC = 10_000;

    // Point multipliers (expressed in PREC units)
    uint256 public constant PHASE1_MULTI     = 10_000; // 1.0×
    uint256 public constant PHASE2_MULTI     = 15_000; // 1.5×
    uint256 public constant PAID_MULTI       = 10_000; // 1.0×
    uint256 public constant WHITELIST_MULTI  =  5_000; // 0.5×

    // ─── Immutables ──────────────────────────────────────────────────────────

    /// @notice The CFG governance token distributed by this contract.
    IERC20 public immutable cfgToken;

    /// @notice The ChainFundedPool contract used for on-chain challenge verification.
    IChainFundedPool public immutable pool;

    // ─── Storage: Seasons ────────────────────────────────────────────────────

    struct Season {
        uint256 startTime;   // inclusive open timestamp
        uint256 endTime;     // exclusive close timestamp (startTime + SEASON_DURATION)
        uint256 cfgBudget;   // CFG (18 dec) allocated to this season
        uint256 totalPoints; // accumulated across all registrations in this season
        bool    finalized;   // locked after season ends; enables claiming
    }

    /// @notice Number of seasons created so far (1-indexed).
    uint256 public seasonCount;

    /// @notice seasonId (1-indexed) → Season.
    mapping(uint256 => Season) public seasons;

    // ─── Storage: Registrations ──────────────────────────────────────────────

    struct Registration {
        address trader;
        uint256 accountSizeUsdc; // USDC with 6 decimals
        uint8   phase;           // 1 or 2
        bool    isWhitelist;     // true = free/admin-registered account
        uint256 points;          // computed at record time
        uint256 seasonId;        // season this registration belongs to
        bool    claimed;         // true once the trader has claimed CFG for this reg
    }

    /// @notice Total registrations recorded across all seasons.
    uint256 public registrationCount;

    /// @notice regId (1-indexed) → Registration.
    mapping(uint256 => Registration) public registrations;

    /// @notice seasonId → trader → list of regIds earned in that season.
    mapping(uint256 => mapping(address => uint256[])) public traderSeasonRegs;

    /// @notice accountId → recorded? Prevents double-counting the same challenge.
    mapping(string => bool) public accountRecorded;

    // ─── Storage: Access control ──────────────────────────────────────────────

    /// @notice Addresses authorised to call recordRegistration / recordRegistrationBatch.
    mapping(address => bool) public reporters;

    // ─── Events ──────────────────────────────────────────────────────────────

    event SeasonCreated(
        uint256 indexed seasonId,
        uint256 startTime,
        uint256 endTime,
        uint256 cfgBudget
    );
    event SeasonFinalized(uint256 indexed seasonId, uint256 totalPoints);
    event RegistrationRecorded(
        uint256 indexed regId,
        uint256 indexed seasonId,
        address indexed trader,
        string  accountId,
        uint256 accountSizeUsdc,
        uint8   phase,
        bool    isWhitelist,
        uint256 points
    );
    event Claimed(
        uint256 indexed seasonId,
        address indexed trader,
        uint256 cfgAmount,
        uint256 traderPoints
    );
    event ReporterSet(address indexed reporter, bool enabled);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotReporter();
    error MaxSeasonsReached();
    error InvalidSeasonWindow();     // startTime >= endTime or overlaps previous season
    error SeasonDoesNotExist();
    error SeasonNotActive();         // no season window covers block.timestamp
    error SeasonNotEnded();          // finalizeSeason called before endTime
    error SeasonAlreadyFinalized();
    error SeasonNotFinalized();      // claim called before finalization
    error AccountAlreadyRecorded();
    error InvalidPhase();            // phase must be 1 or 2
    error InvalidAccountSize();      // accountSizeUsdc must be > 0
    error NothingToClaim();
    error BatchTooLarge();           // batch exceeds 100 entries
    error LengthMismatch();
    error InvalidStartTime();       // startTime cannot be in the past
    error ChallengeNotFound();       // challenge does not exist on ChainFundedPool
    error ChallengeMismatch();       // challenge data does not match reporter's claim

    // ─── Modifier ────────────────────────────────────────────────────────────

    modifier onlyReporter() {
        if (!reporters[msg.sender] && msg.sender != owner()) revert NotReporter();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _cfgToken Address of the deployed CFGToken contract.
     * @param _pool     Address of the deployed ChainFundedPool (for challenge verification).
     * @param _owner    Initial owner (should be the ops multi-sig or governance timelock).
     */
    constructor(address _cfgToken, address _pool, address _owner) Ownable(_owner) {
        cfgToken = IERC20(_cfgToken);
        pool     = IChainFundedPool(_pool);
    }

    // ─── Season management ────────────────────────────────────────────────────

    /**
     * @notice Create the next season. Seasons must be created in order (no gaps).
     *         The CFG budget for the new season must already be held by this contract.
     *
     * @dev    Pass cfgBudget = 0 to use the canonical schedule budget for that season
     *         (see seasonBudget()). Seasons are non-overlapping by construction.
     *
     * @param startTime  Unix timestamp when the season opens for registrations.
     *                   Must be >= previous season's endTime (or >= now for season 1).
     * @param cfgBudget  CFG (18 dec) to allocate. 0 → use canonical schedule value.
     * @return seasonId  The newly assigned season ID (1-indexed).
     */
    function createSeason(
        uint256 startTime,
        uint256 cfgBudget
    ) external onlyOwner returns (uint256 seasonId) {
        if (seasonCount >= MAX_SEASONS) revert MaxSeasonsReached();
        if (startTime < block.timestamp) revert InvalidStartTime();

        uint256 idx = seasonCount; // 0-indexed lookup into canonical schedule
        if (cfgBudget == 0) cfgBudget = seasonBudget(idx);

        uint256 endTime = startTime + SEASON_DURATION;

        // Enforce non-overlapping: new season must start at or after previous end
        if (seasonCount > 0 && startTime < seasons[seasonCount].endTime) {
            revert InvalidSeasonWindow();
        }

        seasonId = ++seasonCount;
        seasons[seasonId] = Season({
            startTime:   startTime,
            endTime:     endTime,
            cfgBudget:   cfgBudget,
            totalPoints: 0,
            finalized:   false
        });

        emit SeasonCreated(seasonId, startTime, endTime, cfgBudget);
    }

    /**
     * @notice Finalise a season after its window has closed.
     *         Anyone can call this — it only locks totalPoints and enables claiming.
     *         There is no penalty for calling late.
     */
    function finalizeSeason(uint256 seasonId) external {
        Season storage s = _requireSeason(seasonId);
        if (block.timestamp < s.endTime)  revert SeasonNotEnded();
        if (s.finalized)                  revert SeasonAlreadyFinalized();
        s.finalized = true;
        emit SeasonFinalized(seasonId, s.totalPoints);
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /**
     * @notice Record a challenge registration and accrue points to the active season.
     *         Permissionless — anyone can call. The contract verifies the challenge
     *         exists on ChainFundedPool with correct trader, accountSize, and phase.
     *
     *         isWhitelist is forced to false unless the caller is a reporter or owner.
     *         This prevents non-reporters from claiming the whitelist multiplier.
     *
     * @param accountId   On-chain accountId (24 hex char string, matches ChainFundedPool).
     * @param isWhitelist True for admin-registered free accounts. Ignored unless caller is reporter/owner.
     * @return regId      The newly assigned registration ID.
     */
    function recordRegistration(
        string calldata accountId,
        bool    isWhitelist
    ) external returns (uint256 regId) {
        if (accountRecorded[accountId])  revert AccountAlreadyRecorded();

        // Only reporters/owner can attest whitelist status
        bool wl = isWhitelist && (reporters[msg.sender] || msg.sender == owner());

        // ── On-chain verification against ChainFundedPool ────────────────────
        IChainFundedPool.Challenge memory c = pool.getChallenge(accountId);
        if (c.createdAt == 0)            revert ChallengeNotFound();

        address trader          = c.trader;
        uint256 accountSizeUsdc = c.accountSizeUsdc;
        uint8   phase           = c.phase;

        if (phase != 1 && phase != 2)    revert InvalidPhase();
        if (accountSizeUsdc == 0)        revert InvalidAccountSize();

        uint256 sid = _activeSeasonId();
        if (sid == 0)                    revert SeasonNotActive();

        uint256 pts = _calcPoints(accountSizeUsdc, phase, wl);

        regId = ++registrationCount;
        registrations[regId] = Registration({
            trader:          trader,
            accountSizeUsdc: accountSizeUsdc,
            phase:           phase,
            isWhitelist:     wl,
            points:          pts,
            seasonId:        sid,
            claimed:         false
        });

        seasons[sid].totalPoints        += pts;
        traderSeasonRegs[sid][trader].push(regId);
        accountRecorded[accountId]       = true;

        emit RegistrationRecorded(regId, sid, trader, accountId, accountSizeUsdc, phase, wl, pts);
    }

    /**
     * @notice Batch variant of recordRegistration — processes up to 100 entries per call.
     *         Each entry is verified against ChainFundedPool. Invalid entries (duplicate
     *         accountId, challenge not found on-chain) are skipped silently so a single
     *         bad entry does not block the whole batch.
     *
     * @dev    Primary use-case: backfilling accounts at season launch.
     */
    function recordRegistrationBatch(
        string[] calldata accountIds,
        bool[]   calldata isWhitelists
    ) external onlyReporter {
        uint256 len = accountIds.length;
        if (len > 100)                   revert BatchTooLarge();
        if (len != isWhitelists.length)  revert LengthMismatch();

        uint256 sid = _activeSeasonId();
        if (sid == 0) revert SeasonNotActive();

        Season storage s = seasons[sid];

        for (uint256 i; i < len; ++i) {
            if (accountRecorded[accountIds[i]]) continue;

            // On-chain verification
            IChainFundedPool.Challenge memory c = pool.getChallenge(accountIds[i]);
            if (c.createdAt == 0)   continue;
            if (c.phase != 1 && c.phase != 2) continue;
            if (c.accountSizeUsdc == 0)        continue;

            uint256 pts   = _calcPoints(c.accountSizeUsdc, c.phase, isWhitelists[i]);
            uint256 regId = ++registrationCount;

            registrations[regId] = Registration({
                trader:          c.trader,
                accountSizeUsdc: c.accountSizeUsdc,
                phase:           c.phase,
                isWhitelist:     isWhitelists[i],
                points:          pts,
                seasonId:        sid,
                claimed:         false
            });

            s.totalPoints                          += pts;
            traderSeasonRegs[sid][c.trader].push(regId);
            accountRecorded[accountIds[i]]          = true;

            emit RegistrationRecorded(
                regId, sid, c.trader, accountIds[i],
                c.accountSizeUsdc, c.phase, isWhitelists[i], pts
            );
        }
    }

    // ─── Claiming ─────────────────────────────────────────────────────────────

    /**
     * @notice Claim all unclaimed CFG for msg.sender in a finalized season.
     *         Convenience wrapper that processes all registrations at once.
     *         For traders with many registrations, use claimPaginated() instead.
     */
    function claim(uint256 seasonId) external nonReentrant {
        uint256[] storage regIds = traderSeasonRegs[seasonId][msg.sender];
        _claimRange(seasonId, 0, regIds.length);
    }

    /**
     * @notice Paginated claim — processes registrations from startIndex to
     *         startIndex + maxClaims. Use when a trader has too many registrations
     *         to process in a single transaction.
     *
     * @param seasonId   The finalized season to claim from.
     * @param startIndex Index into the trader's registration array to start from.
     * @param maxClaims  Maximum number of registrations to process.
     */
    function claimPaginated(uint256 seasonId, uint256 startIndex, uint256 maxClaims) external nonReentrant {
        _claimRange(seasonId, startIndex, maxClaims);
    }

    function _claimRange(uint256 seasonId, uint256 startIndex, uint256 maxClaims) internal {
        Season storage s = _requireSeason(seasonId);
        if (!s.finalized) revert SeasonNotFinalized();

        uint256[] storage regIds = traderSeasonRegs[seasonId][msg.sender];
        uint256 endIndex = startIndex + maxClaims;
        if (endIndex > regIds.length) endIndex = regIds.length;

        uint256 traderPts;
        for (uint256 i = startIndex; i < endIndex; ++i) {
            Registration storage r = registrations[regIds[i]];
            if (!r.claimed) {
                r.claimed = true;
                traderPts += r.points;
            }
        }

        if (traderPts == 0) revert NothingToClaim();

        // Pro-rata share: safe because s.totalPoints >= traderPts > 0
        uint256 cfgAmount = (traderPts * s.cfgBudget) / s.totalPoints;
        cfgToken.safeTransfer(msg.sender, cfgAmount);

        emit Claimed(seasonId, msg.sender, cfgAmount, traderPts);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Preview the claimable CFG and point total for a trader in a given season.
     *         Returns (0, 0) if the season is not yet finalized or has nothing to claim.
     */
    function previewClaim(uint256 seasonId, address trader)
        external view
        returns (uint256 cfgAmount, uint256 traderPoints)
    {
        if (seasonId == 0 || seasonId > seasonCount) return (0, 0);
        Season storage s = seasons[seasonId];
        if (!s.finalized || s.totalPoints == 0)       return (0, 0);

        uint256[] storage regIds = traderSeasonRegs[seasonId][trader];
        for (uint256 i; i < regIds.length; ++i) {
            if (!registrations[regIds[i]].claimed) {
                traderPoints += registrations[regIds[i]].points;
            }
        }
        cfgAmount = (traderPoints * s.cfgBudget) / s.totalPoints;
    }

    /**
     * @notice Returns the ID of the currently active season (0 if none is active).
     */
    function activeSeason() external view returns (uint256) {
        return _activeSeasonId();
    }

    /**
     * @notice Returns all registration IDs earned by a trader in a given season.
     */
    function getTraderRegistrations(uint256 seasonId, address trader)
        external view
        returns (uint256[] memory)
    {
        return traderSeasonRegs[seasonId][trader];
    }

    /**
     * @notice Returns the canonical CFG budget for a given 0-indexed season slot.
     *         Used by createSeason() when cfgBudget == 0.
     */
    function seasonBudget(uint256 idx) public pure returns (uint256) {
        if (idx == 0) return 4_500_000e18;
        if (idx == 1) return 3_000_000e18;
        if (idx == 2) return 2_250_000e18;
        if (idx == 3) return 1_500_000e18;
        if (idx == 4) return 1_125_000e18;
        if (idx == 5) return   750_000e18;
        if (idx == 6) return   562_500e18;
        if (idx == 7) return   562_500e18;
        if (idx == 8) return   375_000e18;
        if (idx == 9) return   375_000e18;
        return 0;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Grant or revoke reporter access.
     * @param reporter Address to update.
     * @param enabled  True to grant, false to revoke.
     */
    function setReporter(address reporter, bool enabled) external onlyOwner {
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    /**
     * @notice Recover CFG from a finalized season that received zero registrations.
     *         Cannot be used to drain seasons that have (or had) participants.
     *
     * @param seasonId Season with zero totalPoints to recover from.
     * @param to       Recipient address (e.g. treasury).
     */
    function recoverUnclaimedCfg(uint256 seasonId, address to) external onlyOwner {
        Season storage s = _requireSeason(seasonId);
        require(s.finalized && s.totalPoints == 0, "CFGDistributor: season has participants");
        uint256 bal = cfgToken.balanceOf(address(this));
        uint256 amt = bal < s.cfgBudget ? bal : s.cfgBudget;
        cfgToken.safeTransfer(to, amt);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Returns the seasonId of the season whose window currently contains block.timestamp.
    ///      Iterates backwards so the most recently created active season wins (no overlaps anyway).
    ///      Returns 0 if no season is active.
    function _activeSeasonId() internal view returns (uint256) {
        for (uint256 i = seasonCount; i >= 1; --i) {
            Season storage s = seasons[i];
            if (!s.finalized
                && block.timestamp >= s.startTime
                && block.timestamp <  s.endTime)
            {
                return i;
            }
        }
        return 0;
    }

    /**
     * @dev Compute points for a registration.
     *      points = (accountSizeUsdc / 1e6) × phaseMulti × sourceMulti / PREC²
     */
    function _calcPoints(
        uint256 accountSizeUsdc,
        uint8   phase,
        bool    isWhitelist
    ) internal pure returns (uint256) {
        uint256 phaseMul = (phase == 2) ? PHASE2_MULTI : PHASE1_MULTI;
        uint256 srcMul   = isWhitelist   ? WHITELIST_MULTI : PAID_MULTI;
        // Multiply before dividing to avoid precision loss on small amounts
        return (accountSizeUsdc * phaseMul * srcMul) / (1e6 * PREC * PREC);
    }

    /// @dev Reverts with SeasonDoesNotExist if seasonId is out of range.
    function _requireSeason(uint256 seasonId) internal view returns (Season storage) {
        if (seasonId == 0 || seasonId > seasonCount) revert SeasonDoesNotExist();
        return seasons[seasonId];
    }
}
