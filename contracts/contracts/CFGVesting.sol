// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/**
 * @title CFGVesting
 * @author ChainFunded
 * @notice Linear vesting with cliff for CFG governance tokens.
 *
 *   Used for team, advisor, and investor allocations.
 *     Team: 6-month cliff, 4-year linear vesting.
 *     Advisors: 0 cliff, 12-month linear vest (10% TGE sent directly at mint).
 *     Investors: 0 cliff, 12-month linear vest (10% TGE sent directly at mint).
 *
 *   - Tokens are locked in this contract at deployment
 *   - Nothing is released before the cliff
 *   - After the cliff, tokens vest linearly per second
 *   - Beneficiary can claim vested tokens at any time
 *   - Vested but unclaimed tokens can be delegated for governance
 */
contract CFGVesting {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable beneficiary;
    uint256 public immutable totalAllocation;
    uint256 public immutable startTime;
    uint256 public immutable cliffDuration;
    uint256 public immutable vestingDuration;

    uint256 public released;

    event TokensReleased(address indexed beneficiary, uint256 amount);

    /**
     * @param _token            CFG token address
     * @param _beneficiary      Address that receives vested tokens
     * @param _totalAllocation  Total tokens to vest (must be transferred to this contract)
     * @param _startTime        Unix timestamp when vesting starts
     * @param _cliffDuration    Seconds before any tokens unlock (e.g. 182 days)
     * @param _vestingDuration  Total vesting period in seconds (e.g. 4 years)
     */
    constructor(
        IERC20 _token,
        address _beneficiary,
        uint256 _totalAllocation,
        uint256 _startTime,
        uint256 _cliffDuration,
        uint256 _vestingDuration
    ) {
        require(address(_token) != address(0), "Zero token address");
        require(_beneficiary != address(0), "Zero beneficiary");
        require(_totalAllocation > 0, "Zero allocation");
        require(_vestingDuration > 0, "Zero vesting");
        require(_cliffDuration <= _vestingDuration, "Cliff > vesting");
        require(_startTime >= block.timestamp, "Start time in the past");
        require(_startTime <= block.timestamp + 365 days, "Start time too far in future");

        token = _token;
        beneficiary = _beneficiary;
        totalAllocation = _totalAllocation;
        startTime = _startTime;
        cliffDuration = _cliffDuration;
        vestingDuration = _vestingDuration;
    }

    /**
     * @notice Amount of tokens that have vested (including already released).
     */
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < startTime + cliffDuration) {
            return 0;
        }
        uint256 elapsed = block.timestamp - startTime;
        if (elapsed >= vestingDuration) {
            return totalAllocation;
        }
        return (totalAllocation * elapsed) / vestingDuration;
    }

    /**
     * @notice Amount of tokens available to release right now.
     */
    function releasable() public view returns (uint256) {
        return vestedAmount() - released;
    }

    /**
     * @notice Release vested tokens to the beneficiary.
     */
    function release() external {
        uint256 amount = releasable();
        require(amount > 0, "Nothing to release");
        released += amount;
        token.safeTransfer(beneficiary, amount);
        emit TokensReleased(beneficiary, amount);
    }

    /**
     * @notice Delegate the voting power of tokens held in this vesting contract.
     *         Only the beneficiary can call this. Allows vested-but-unclaimed
     *         (and unvested) tokens to participate in CFG governance.
     *         See audit finding M-06.
     *
     * @param delegatee Address to delegate voting power to (can be self)
     */
    function delegateHeld(address delegatee) external {
        require(msg.sender == beneficiary, "Not beneficiary");
        IVotes(address(token)).delegate(delegatee);
    }

    /**
     * @notice Returns cliff end timestamp.
     */
    function cliffEnd() external view returns (uint256) {
        return startTime + cliffDuration;
    }

    /**
     * @notice Returns full vesting end timestamp.
     */
    function vestingEnd() external view returns (uint256) {
        return startTime + vestingDuration;
    }
}
