// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title CFGPresale
 * @author ChainFunded
 * @notice Self-hosted, open-ended presale for the CFG governance token.
 *
 *   Pricing — 10 fixed tiers of 250,000 CFG each, stepping $0.04 → $0.76
 *   ($0.08 per step). Blended average is $0.40, so 2,500,000 CFG raises
 *   EXACTLY $1,000,000 when fully sold: every tier's boundary fill is a clean
 *   USD6 integer (tier 0 = $10,000 … tier 9 = $190,000), so there is no
 *   boundary dust. The only rounding is on a partial final buy, which may leave
 *   sub-cent USDC unspent in the buyer's wallet — never lost from the raise.
 *   A single purchase fills across tier boundaries ("cross-tier fill").
 *
 *   Settlement — the contract natively accepts USDC only (6dp). ETH, USDT and
 *   other-chain assets are converted to USDC at market rate on the front end
 *   (thirdweb Pay) before `buy()` is called — so the contract never needs a
 *   price oracle and can't be arbitraged by a depegged stable. USDC is
 *   forwarded to the treasury (Safe) on every buy — the contract only ever
 *   custodies the CFG reserved for claims.
 *
 *   Vesting — buyers accrue CFG immediately on-chain but claim on a single
 *   global schedule set at listing: 10% at TGE, 0 cliff, remaining 90%
 *   linear over 12 months. `setTGE()` opens claiming; `claim()` pulls
 *   whatever has vested.
 *
 *   Lifecycle — open-ended. `finalize()` stops sales and sweeps unsold CFG
 *   back to the treasury. Pausable for emergencies.
 */
contract CFGPresale is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Tokens ──────────────────────────────────────────────────────────────
    IERC20 public immutable CFG;       // 18 decimals
    IERC20 public immutable USDC;      // 6 decimals (only accepted stable)
    address public immutable treasury; // Safe — receives net proceeds (immutable: no redirect path)

    // ── Tier configuration ──────────────────────────────────────────────────
    uint256 public constant TIER_COUNT       = 10;
    uint256 public constant TIER_ALLOCATION  = 250_000 ether;       // CFG per tier (18dp)
    uint256 public constant TOTAL_ALLOCATION = 2_500_000 ether;     // 10 × 250k

    /// USD price (6dp) for 1.0 CFG (1e18), per tier: $0.04 … $0.76.
    function tierPrice(uint256 i) public pure returns (uint256) {
        // 40_000 == $0.04 in 6dp; step 80_000 == $0.08
        return 40_000 + (i * 80_000);
    }

    // ── Buy limits (USD, 6dp) ───────────────────────────────────────────────
    uint256 public constant MIN_BUY = 10e6;       // $10
    uint256 public constant MAX_BUY = 10_000e6;   // $10,000 cumulative per wallet

    // ── Vesting ─────────────────────────────────────────────────────────────
    uint256 public constant TGE_BPS          = 1_000;     // 10% at TGE
    uint256 public constant BPS              = 10_000;
    uint256 public constant VESTING_DURATION = 365 days;  // remaining 90% linear
    uint256 public tgeTime;                               // 0 until listing

    // ── State ───────────────────────────────────────────────────────────────
    uint256 public totalSold;       // CFG sold (18dp)
    uint256 public totalRaised;     // gross USD in (6dp)
    uint256 public totalClaimed;    // CFG claimed (18dp)
    uint256 public buyerCount;
    bool    public finalized;

    mapping(address => uint256) public purchased;     // CFG owed (18dp)
    mapping(address => uint256) public claimed;       // CFG claimed (18dp)
    mapping(address => uint256) public contributed;   // USD spent (6dp), for MAX_BUY

    // ── Events ──────────────────────────────────────────────────────────────
    event Purchased(address indexed buyer, uint256 usdSpent, uint256 cfgOut, uint256 newTier);
    event Claimed(address indexed buyer, uint256 amount);
    event TGEScheduled(uint256 tgeTime);
    event Finalized(uint256 unsoldSwept);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    constructor(
        address _cfg,
        address _usdc,
        address _treasury,
        address _owner
    ) Ownable(_owner) {
        require(_cfg != address(0) && _usdc != address(0) && _treasury != address(0) && _owner != address(0), "zero addr");
        CFG = IERC20(_cfg);
        USDC = IERC20(_usdc);
        treasury = _treasury;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Buy
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Buy CFG with USDC.
     * @param amount    USDC amount to spend (6dp). If the sale sells out mid-buy,
     *                  only the filled portion is pulled; the rest stays with you.
     * @param minCfgOut Minimum CFG to receive — slippage guard against the tier
     *                  advancing between quote and inclusion. Pass 0 to skip.
     */
    function buy(uint256 amount, uint256 minCfgOut)
        external
        nonReentrant
        whenNotPaused
    {
        require(!finalized, "sale closed");
        require(amount > 0, "zero amount");

        (uint256 cfgOut, uint256 usdSpent) = _quote(amount, totalSold);
        require(cfgOut > 0, "sold out");
        require(cfgOut >= minCfgOut, "slippage");
        require(usdSpent >= MIN_BUY, "below min");
        require(contributed[msg.sender] + usdSpent <= MAX_BUY, "exceeds max");
        // H-1: never sell more CFG than the contract holds to back claims.
        // Invariant relies on CFG being a plain fixed-supply ERC20 (no transfer
        // fee, no rebasing) — true for CFGToken; the only CFG exit paths are
        // claim()/finalize() (owed-retaining) and rescueToken (CFG blocked).
        require(CFG.balanceOf(address(this)) >= totalSold + cfgOut - totalClaimed, "underfunded");

        // ── effects ──
        if (purchased[msg.sender] == 0) buyerCount++;
        purchased[msg.sender] += cfgOut;
        contributed[msg.sender] += usdSpent;
        totalSold += cfgOut;
        totalRaised += usdSpent;

        // ── interactions ──
        // Zero-custody: pull only what's spent, straight from the buyer to the
        // treasury in a single hop — the contract never touches USDC. If the
        // sale sells out mid-buy, the unspent portion of the buyer's approval is
        // simply left in their wallet — no refund needed.
        USDC.safeTransferFrom(msg.sender, treasury, usdSpent);

        emit Purchased(msg.sender, usdSpent, cfgOut, currentTier());
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Pricing / quotes (view)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice CFG out and USD actually spent for `amount` at current sale state.
    function quote(uint256 amount) external view returns (uint256 cfgOut, uint256 usdSpent) {
        return _quote(amount, totalSold);
    }

    function _quote(uint256 amount, uint256 sold)
        internal
        pure
        returns (uint256 cfgOut, uint256 usdSpent)
    {
        uint256 remaining = amount;
        uint256 i = sold / TIER_ALLOCATION;
        while (i < TIER_COUNT && remaining > 0) {
            uint256 tierEnd = (i + 1) * TIER_ALLOCATION;
            uint256 cfgLeft = tierEnd - sold;            // CFG remaining in this tier
            uint256 price = 40_000 + (i * 80_000);       // USD6 per 1e18 CFG
            uint256 costToFill = (cfgLeft * price) / 1e18;

            if (remaining >= costToFill && costToFill > 0) {
                cfgOut += cfgLeft;
                usdSpent += costToFill;
                remaining -= costToFill;
                sold = tierEnd;
                i++;
            } else {
                uint256 cfgBuyable = (remaining * 1e18) / price;
                if (cfgBuyable > cfgLeft) cfgBuyable = cfgLeft;
                uint256 cost = (cfgBuyable * price) / 1e18;
                cfgOut += cfgBuyable;
                usdSpent += cost;
                break; // remainder (dust or sell-out) left unspent
            }
        }
    }

    function currentTier() public view returns (uint256) {
        uint256 t = totalSold / TIER_ALLOCATION;
        return t >= TIER_COUNT ? TIER_COUNT : t;
    }

    /// @notice Current price (USD6 per 1 CFG); 0 once sold out.
    function currentPrice() external view returns (uint256) {
        uint256 t = currentTier();
        return t >= TIER_COUNT ? 0 : tierPrice(t);
    }

    /// @notice CFG remaining in the current tier (18dp).
    function remainingInTier() external view returns (uint256) {
        uint256 t = currentTier();
        if (t >= TIER_COUNT) return 0;
        return ((t + 1) * TIER_ALLOCATION) - totalSold;
    }

    function remainingTotal() external view returns (uint256) {
        return TOTAL_ALLOCATION - totalSold;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Vesting / claim
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Total CFG vested for `who` (incl. already claimed).
    function vestedAmount(address who) public view returns (uint256) {
        uint256 total = purchased[who];
        if (total == 0 || tgeTime == 0 || block.timestamp < tgeTime) return 0;

        uint256 tgeAmt = (total * TGE_BPS) / BPS;
        uint256 linear = total - tgeAmt;
        uint256 elapsed = block.timestamp - tgeTime;
        if (elapsed >= VESTING_DURATION) return total;
        return tgeAmt + (linear * elapsed) / VESTING_DURATION;
    }

    /// @notice CFG claimable right now for `who`.
    function releasable(address who) public view returns (uint256) {
        return vestedAmount(who) - claimed[who];
    }

    /// @notice Claim all currently-vested CFG.
    function claim() external nonReentrant {
        uint256 amount = releasable(msg.sender);
        require(amount > 0, "nothing to claim");
        claimed[msg.sender] += amount;
        totalClaimed += amount;
        CFG.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Set the global TGE (claiming) time. Can be corrected up until the
    ///         scheduled time passes (fat-finger recovery), then locks in.
    function setTGE(uint256 _tgeTime) external onlyOwner {
        require(tgeTime == 0 || block.timestamp < tgeTime, "TGE reached");
        require(_tgeTime >= block.timestamp, "past");
        require(_tgeTime <= block.timestamp + 365 days, "too far");
        tgeTime = _tgeTime;
        emit TGEScheduled(_tgeTime);
    }

    /// @notice Close the sale and sweep unsold CFG back to the treasury.
    ///         Retains exactly the CFG still owed to buyers for claims.
    function finalize() external onlyOwner {
        require(!finalized, "done");
        finalized = true;
        uint256 owed = totalSold - totalClaimed;
        uint256 bal = CFG.balanceOf(address(this));
        uint256 unsold = bal > owed ? bal - owed : 0;
        if (unsold > 0) CFG.safeTransfer(treasury, unsold);
        emit Finalized(unsold);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Rescue stray tokens sent here by mistake. CFG (backs claims) and
    ///         USDC (sale proceeds) cannot be pulled; use finalize() for unsold CFG.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(CFG), "CFG locked");
        require(token != address(USDC), "USDC locked");
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, to, amount);
    }
}
