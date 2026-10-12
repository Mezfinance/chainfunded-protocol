// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IChainFundedPool
 * @dev Minimal interface for the pool functions CFGLPRewards needs.
 */
interface IChainFundedPool {
    function cfndTokenAddress() external view returns (address);
    function transferCfnd(address from, address to, uint256 amount) external;
    function claimProfit(uint256 gasReimbursementUsdc) external;
    function pendingProfit(address lp) external view returns (uint256);
}

/**
 * @title CFGLPRewards
 * @author ChainFunded
 * @notice Stake CFND to earn CFG governance tokens + proxy-harvested USDC profit.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Overview                                                               │
 * │                                                                         │
 * │  LPs stake their CFND (LP tokens) into this contract to earn CFG       │
 * │  governance tokens at a continuous per-second emission rate. The 10 M   │
 * │  CFG LP-reward allocation is split across 10 six-month seasons with    │
 * │  a front-loaded decay schedule matching the trader distributor.         │
 * │                                                                         │
 * │  Staking is an active opt-in — LPs must explicitly stake/unstake.      │
 * │  This is a regulatory requirement: passive CFND holders do NOT earn    │
 * │  CFG rewards, avoiding classification as yield on a held token.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CFG emission (Synthetix StakingRewards pattern)
 * ────────────────────────────────────────────────
 *   rewardRate        = seasonBudget / SEASON_DURATION  (CFG per second)
 *   rewardPerToken   += rewardRate × elapsed / totalStaked
 *   earned(lp)        = staked[lp] × (rewardPerToken - userPaid[lp]) + rewards[lp]
 *
 * USDC proxy harvest
 * ──────────────────
 *   While CFND is staked here, the Pool's profit accumulator assigns USDC
 *   profit to this contract's address. Anyone can call harvestPoolProfit()
 *   to pull that USDC in and distribute it to stakers pro-rata via a second
 *   Synthetix-style accumulator. Stakers do NOT lose USDC yield by staking.
 *
 * Season schedule (10 × ~6-month seasons, 10 M CFG total)
 * ────────────────────────────────────────────────────────
 *   Season  1   3,000,000 CFG   30.00 %
 *   Season  2   2,000,000 CFG   20.00 %
 *   Season  3   1,500,000 CFG   15.00 %
 *   Season  4   1,000,000 CFG   10.00 %
 *   Season  5     750,000 CFG    7.50 %
 *   Season  6     500,000 CFG    5.00 %
 *   Season  7     375,000 CFG    3.75 %
 *   Season  8     375,000 CFG    3.75 %
 *   Season  9     250,000 CFG    2.50 %
 *   Season 10     250,000 CFG    2.50 %
 *              ──────────────────────────
 *              10,000,000 CFG  100.00 %
 */
contract CFGLPRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MAX_SEASONS     = 10;
    uint256 public constant SEASON_DURATION = 182 days;
    uint256 public constant TOTAL_CFG       = 10_000_000e18;
    uint256 private constant PRECISION      = 1e18;

    // ─── Immutables ──────────────────────────────────────────────────────────

    IERC20              public immutable cfgToken;
    IERC20              public immutable cfndToken;
    IERC20              public immutable usdc;
    IChainFundedPool    public immutable pool;

    // ─── Season storage ──────────────────────────────────────────────────────

    struct Season {
        uint256 startTime;
        uint256 endTime;
        uint256 cfgBudget;
        uint256 rewardRate;   // CFG per second (18 dec)
    }

    uint256 public seasonCount;
    mapping(uint256 => Season) public seasons;

    // ─── CFG reward accumulator (Synthetix pattern) ──────────────────────────

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    uint256 public cfgRewardPerTokenStored;
    uint256 public cfgLastUpdateTime;
    mapping(address => uint256) public cfgUserRewardPerTokenPaid;
    mapping(address => uint256) public cfgRewards;   // unclaimed CFG

    // ─── USDC profit proxy-harvest accumulator ───────────────────────────────

    uint256 public usdcRewardPerTokenStored;
    mapping(address => uint256) public usdcUserRewardPerTokenPaid;
    mapping(address => uint256) public usdcRewards;  // unclaimed USDC

    // ─── Events ──────────────────────────────────────────────────────────────

    event SeasonStarted(uint256 indexed seasonId, uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 rewardRate);
    event Staked(address indexed lp, uint256 amount);
    event Unstaked(address indexed lp, uint256 amount);
    event CfgRewardClaimed(address indexed lp, uint256 amount);
    event UsdcProfitHarvested(uint256 amount);
    event UsdcProfitClaimed(address indexed lp, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error MaxSeasonsReached();
    error SeasonOverlap();
    error InvalidStartTime();    // startTime cannot be in the past
    error SeasonDoesNotExist();
    error InsufficientStake();
    error ZeroAmount();
    error NothingToClaim();

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _cfgToken CFG governance token address.
     * @param _pool     ChainFundedPool address (must have this contract whitelisted for transferCfnd).
     * @param _usdc     USDC token address.
     * @param _owner    Initial owner (governance timelock or ops multi-sig).
     */
    constructor(
        address _cfgToken,
        address _pool,
        address _usdc,
        address _owner
    ) Ownable(_owner) {
        cfgToken  = IERC20(_cfgToken);
        pool      = IChainFundedPool(_pool);
        usdc      = IERC20(_usdc);
        cfndToken = IERC20(IChainFundedPool(_pool).cfndTokenAddress());
    }

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier updateCfgReward(address account) {
        cfgRewardPerTokenStored = cfgRewardPerToken();
        cfgLastUpdateTime       = lastTimeRewardApplicable();

        if (account != address(0)) {
            cfgRewards[account]                = earnedCfg(account);
            cfgUserRewardPerTokenPaid[account] = cfgRewardPerTokenStored;
        }
        _;
    }

    modifier updateUsdcReward(address account) {
        if (account != address(0)) {
            if (totalStaked > 0) {
                usdcRewards[account] = earnedUsdc(account);
            }
            // Always sync paid marker — prevents phantom earnings when
            // totalStaked was 0 but usdcRewardPerTokenStored is non-zero.
            usdcUserRewardPerTokenPaid[account] = usdcRewardPerTokenStored;
        }
        _;
    }

    // ─── Season management ───────────────────────────────────────────────────

    /**
     * @notice Start the next season. Pass cfgBudget = 0 to use the canonical schedule.
     *         CFG must already be held by this contract.
     * @param startTime  Unix timestamp for season open.
     * @param cfgBudget  CFG (18 dec) for this season. 0 → canonical schedule.
     */
    function startSeason(
        uint256 startTime,
        uint256 cfgBudget
    ) external onlyOwner updateCfgReward(address(0)) returns (uint256 seasonId) {
        if (seasonCount >= MAX_SEASONS) revert MaxSeasonsReached();
        if (startTime < block.timestamp) revert InvalidStartTime();

        uint256 idx = seasonCount;
        if (cfgBudget == 0) cfgBudget = seasonBudget(idx);

        uint256 endTime = startTime + SEASON_DURATION;

        if (seasonCount > 0 && startTime < seasons[seasonCount].endTime) {
            revert SeasonOverlap();
        }

        uint256 rate = cfgBudget / SEASON_DURATION;

        seasonId = ++seasonCount;
        seasons[seasonId] = Season({
            startTime:  startTime,
            endTime:    endTime,
            cfgBudget:  cfgBudget,
            rewardRate: rate
        });

        // Set cfgLastUpdateTime to the earliest season start if this is the first season,
        // otherwise leave it alone (the updateCfgReward modifier handles accumulation).
        if (seasonCount == 1) {
            cfgLastUpdateTime = startTime;
        }

        emit SeasonStarted(seasonId, startTime, endTime, cfgBudget, rate);
    }

    /**
     * @notice Canonical CFG budget for a 0-indexed season slot.
     */
    function seasonBudget(uint256 idx) public pure returns (uint256) {
        if (idx == 0) return 3_000_000e18;
        if (idx == 1) return 2_000_000e18;
        if (idx == 2) return 1_500_000e18;
        if (idx == 3) return 1_000_000e18;
        if (idx == 4) return   750_000e18;
        if (idx == 5) return   500_000e18;
        if (idx == 6) return   375_000e18;
        if (idx == 7) return   375_000e18;
        if (idx == 8) return   250_000e18;
        if (idx == 9) return   250_000e18;
        return 0;
    }

    // ─── Staking ─────────────────────────────────────────────────────────────

    /**
     * @notice Stake CFND to start earning CFG rewards.
     *         Moves CFND from msg.sender into this contract via the Pool's
     *         transferCfnd (which also harvests the staker's pending USDC).
     *
     * @param amount CFND amount to stake (6 decimals).
     */
    function stake(uint256 amount)
        external
        nonReentrant
        updateCfgReward(msg.sender)
        // NOTE: updateUsdcReward intentionally NOT used here — we must
        // snapshot after the harvest so the staker doesn't get credited
        // for USDC profit that was harvested before their stake.
    {
        if (amount == 0) revert ZeroAmount();

        // Snapshot USDC balance before — Pool sends harvested USDC to this contract
        uint256 usdcBefore = usdc.balanceOf(address(this));

        // Move CFND from staker → this contract (Pool handles rewardDebt sync)
        pool.transferCfnd(msg.sender, address(this), amount);

        // Distribute any USDC harvested during the transfer to existing stakers
        _distributeUsdcHarvest(usdcBefore);

        // Snapshot USDC reward state AFTER harvest — user starts earning
        // from this point forward, not from pre-existing pool profit.
        if (totalStaked > 0) {
            usdcRewards[msg.sender] = earnedUsdc(msg.sender);
        }
        usdcUserRewardPerTokenPaid[msg.sender] = usdcRewardPerTokenStored;

        stakedBalance[msg.sender] += amount;
        totalStaked               += amount;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstake CFND — stops earning CFG. CFND returns to the staker.
     * @param amount CFND amount to unstake.
     */
    function unstake(uint256 amount)
        external
        nonReentrant
        updateCfgReward(msg.sender)
        updateUsdcReward(msg.sender)
    {
        if (amount == 0)                         revert ZeroAmount();
        if (stakedBalance[msg.sender] < amount)  revert InsufficientStake();

        stakedBalance[msg.sender] -= amount;
        totalStaked               -= amount;

        // Snapshot USDC balance before — Pool sends harvested USDC to this contract
        uint256 usdcBefore = usdc.balanceOf(address(this));

        // Move CFND from this contract → staker (Pool handles rewardDebt sync)
        pool.transferCfnd(address(this), msg.sender, amount);

        // Distribute any USDC harvested during the transfer to remaining stakers
        _distributeUsdcHarvest(usdcBefore);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Unstake all CFND + claim both CFG and USDC rewards.
     */
    function exit() external nonReentrant {
        // Claim first (while staked balance is still > 0 for reward calc)
        _claimCfgReward();
        _claimUsdcProfit();
        // Then unstake
        uint256 staked = stakedBalance[msg.sender];
        if (staked > 0) {
            // Use the internal logic directly to avoid nested nonReentrant
            _unstakeInternal(msg.sender, staked);
        }
    }

    // ─── Claiming ────────────────────────────────────────────────────────────

    /**
     * @notice Claim accrued CFG governance token rewards.
     */
    function claimCfgReward()
        external
        nonReentrant
        updateCfgReward(msg.sender)
    {
        _claimCfgRewardTransfer();
    }

    /**
     * @notice Claim accrued USDC profit from proxy-harvested pool rewards.
     */
    function claimUsdcProfit()
        external
        nonReentrant
        updateUsdcReward(msg.sender)
    {
        _claimUsdcProfitTransfer();
    }

    // ─── USDC proxy harvest ──────────────────────────────────────────────────

    /**
     * @notice Harvest pending USDC profit from ChainFundedPool for all stakers.
     *         Anyone can call this — it pulls the Pool's accumulated USDC profit
     *         for the CFND held by this contract and distributes it pro-rata
     *         to stakers via the USDC reward accumulator.
     *
     *         Automatically called during stake/unstake; this is for manual
     *         top-ups between stake events.
     */
    function harvestPoolProfit() external nonReentrant {
        uint256 pending = pool.pendingProfit(address(this));
        if (pending == 0) return;

        uint256 usdcBefore = usdc.balanceOf(address(this));
        pool.claimProfit(0);
        uint256 harvested = usdc.balanceOf(address(this)) - usdcBefore;

        if (harvested > 0 && totalStaked > 0) {
            usdcRewardPerTokenStored += (harvested * PRECISION) / totalStaked;
            emit UsdcProfitHarvested(harvested);
        }
    }

    // ─── View helpers ────────────────────────────────────────────────────────

    /**
     * @notice Returns the last timestamp at which CFG rewards are applicable.
     *         Handles active seasons, gaps between seasons, and pre-start.
     */
    function lastTimeRewardApplicable() public view returns (uint256) {
        // Check for active season first
        (uint256 start, uint256 end,) = _activeSeasonParams();
        if (start != 0) {
            // Active season — cap at current time or season end
            if (block.timestamp < start) return start;
            return block.timestamp < end ? block.timestamp : end;
        }

        // No active season — find the most recently ended season
        for (uint256 i = seasonCount; i >= 1; --i) {
            if (block.timestamp >= seasons[i].endTime) {
                return seasons[i].endTime; // cap at that season's end
            }
            if (block.timestamp < seasons[i].startTime) {
                // Future season — check if there's one before it
                if (i > 1 && block.timestamp >= seasons[i-1].endTime) {
                    return seasons[i-1].endTime;
                }
            }
        }

        return cfgLastUpdateTime;
    }

    /**
     * @notice Current CFG reward per staked CFND token.
     *         Finds the season that overlaps with [cfgLastUpdateTime, now] and
     *         accumulates rewards at that season's rate up to its end or now.
     */
    function cfgRewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return cfgRewardPerTokenStored;

        // Find the season that was active at cfgLastUpdateTime or is active now
        uint256 accumulated = cfgRewardPerTokenStored;
        uint256 fromTime = cfgLastUpdateTime;

        for (uint256 i = 1; i <= seasonCount; ++i) {
            Season storage s = seasons[i];
            if (s.endTime <= fromTime) continue;     // already fully accounted
            if (s.startTime > block.timestamp) break; // future season

            uint256 segStart = fromTime > s.startTime ? fromTime : s.startTime;
            uint256 segEnd   = block.timestamp < s.endTime ? block.timestamp : s.endTime;

            if (segEnd > segStart) {
                accumulated += ((segEnd - segStart) * s.rewardRate * PRECISION) / totalStaked;
            }
        }

        return accumulated;
    }

    /**
     * @notice CFG earned by an account (unclaimed).
     */
    function earnedCfg(address account) public view returns (uint256) {
        return (
            stakedBalance[account] *
            (cfgRewardPerToken() - cfgUserRewardPerTokenPaid[account])
        ) / PRECISION + cfgRewards[account];
    }

    /**
     * @notice USDC earned by an account from proxy harvest (unclaimed).
     */
    function earnedUsdc(address account) public view returns (uint256) {
        return (
            stakedBalance[account] *
            (usdcRewardPerTokenStored - usdcUserRewardPerTokenPaid[account])
        ) / PRECISION + usdcRewards[account];
    }

    /**
     * @notice Returns the ID of the currently active season (0 if none).
     */
    function activeSeason() external view returns (uint256) {
        for (uint256 i = seasonCount; i >= 1; --i) {
            if (block.timestamp >= seasons[i].startTime && block.timestamp < seasons[i].endTime) {
                return i;
            }
        }
        return 0;
    }

    /**
     * @notice Current CFG reward rate (per second). Zero if no active season.
     */
    function currentRewardRate() external view returns (uint256) {
        (,, uint256 rate) = _activeSeasonParams();
        return rate;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /**
     * @notice Recover CFG from seasons that had zero stakers.
     */
    function recoverCfg(address to, uint256 amount) external onlyOwner {
        cfgToken.safeTransfer(to, amount);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _currentRewardRate() internal view returns (uint256) {
        (,, uint256 rate) = _activeSeasonParams();
        return rate;
    }

    /**
     * @dev Find the season that contains block.timestamp and return its params.
     *      Returns (0, 0, 0) if no season is currently active.
     */
    function _activeSeasonParams() internal view returns (uint256 start, uint256 end, uint256 rate) {
        for (uint256 i = seasonCount; i >= 1; --i) {
            Season storage s = seasons[i];
            if (block.timestamp >= s.startTime && block.timestamp < s.endTime) {
                return (s.startTime, s.endTime, s.rewardRate);
            }
        }
        return (0, 0, 0);
    }

    function _distributeUsdcHarvest(uint256 usdcBefore) internal {
        uint256 harvested = usdc.balanceOf(address(this)) - usdcBefore;
        if (harvested > 0 && totalStaked > 0) {
            usdcRewardPerTokenStored += (harvested * PRECISION) / totalStaked;
            emit UsdcProfitHarvested(harvested);
        }
    }

    function _claimCfgReward() internal updateCfgReward(msg.sender) {
        _claimCfgRewardTransfer();
    }

    function _claimCfgRewardTransfer() internal {
        uint256 reward = cfgRewards[msg.sender];
        if (reward == 0) return;
        cfgRewards[msg.sender] = 0;
        cfgToken.safeTransfer(msg.sender, reward);
        emit CfgRewardClaimed(msg.sender, reward);
    }

    function _claimUsdcProfit() internal updateUsdcReward(msg.sender) {
        _claimUsdcProfitTransfer();
    }

    function _claimUsdcProfitTransfer() internal {
        uint256 reward = usdcRewards[msg.sender];
        if (reward == 0) return;
        usdcRewards[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, reward);
        emit UsdcProfitClaimed(msg.sender, reward);
    }

    function _unstakeInternal(address lp, uint256 amount) internal
        updateCfgReward(lp)
        updateUsdcReward(lp)
    {
        stakedBalance[lp] -= amount;
        totalStaked        -= amount;

        uint256 usdcBefore = usdc.balanceOf(address(this));
        pool.transferCfnd(address(this), lp, amount);
        _distributeUsdcHarvest(usdcBefore);

        emit Unstaked(lp, amount);
    }
}
