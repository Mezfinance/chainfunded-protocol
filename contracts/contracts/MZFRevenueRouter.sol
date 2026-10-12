// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title  MZFRevenueRouter
 * @notice Receives MZF Protocol Inc.'s share of ChainFunded platform fees and
 *         distributes contracted revenue shares to registered recipients.
 *
 *         ChainFundedPool.sol sends the protocol fee (the labsWallet transfer)
 *         to this contract's address. MZF then calls distribute() to pay each
 *         contracted recipient their calculated share, and sweepToTreasury() to
 *         forward the remainder to the MZF treasury wallet.
 *
 *         Revenue share rates (rateBps) are stored per recipient and serve as the
 *         authoritative on-chain record referenced by each signed legal agreement.
 *         The rate is set via setRevenueShare() immediately before or at the time
 *         both parties sign the agreement, so the document and the chain agree.
 *
 * @dev    Owned by MZF's Gnosis Safe. All distribution decisions are controlled
 *         entirely by MZF Protocol Inc. — independent of ChainFunded DAO governance.
 *         This contract is intentionally non-upgradeable; deploy a new router and
 *         call updateLabsWallet() on ChainFundedPool if a replacement is needed.
 */
contract MZFRevenueRouter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ───────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    /// MZF treasury — receives the remainder after all distributions.
    address public treasury;

    struct RevenueShare {
        uint256 rateBps;       // rate in BPS relative to gross transaction amount
        string  agreementRef;  // e.g. "C7" — links to the signed legal document
        bool    active;
    }

    /// Per-recipient revenue share agreements. rateBps is the on-chain source of truth.
    mapping(address => RevenueShare) public revenueShares;

    /// Ordered list of all recipients ever added (for enumeration; includes inactive).
    address[] private _recipients;

    uint256 public constant BPS = 10_000;

    // ── Events ──────────────────────────────────────────────────────────────

    event RevenueShareSet(address indexed recipient, uint256 rateBps, string agreementRef);
    event RevenueShareDeactivated(address indexed recipient);
    event Distributed(address indexed recipient, uint256 amount, string agreementRef);
    event SweptToTreasury(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ── Errors ──────────────────────────────────────────────────────────────

    error InvalidAddress();
    error InvalidRate();
    error NoActiveShare();
    error InsufficientBalance();
    error LengthMismatch();
    error NothingToSweep();

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(address _usdc, address _treasury, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _treasury == address(0) || _owner == address(0))
            revert InvalidAddress();
        usdc     = IERC20(_usdc);
        treasury = _treasury;
    }

    // ── Revenue share management ────────────────────────────────────────────

    /**
     * @notice Register or update a revenue share agreement.
     *         Called via MZF Safe tx when both parties have signed the legal agreement.
     * @param recipient    Wallet address of the revenue share recipient.
     * @param rateBps      Share rate in basis points (e.g. 500 = 5%).
     * @param agreementRef Legal agreement reference, e.g. "C7".
     */
    function setRevenueShare(
        address recipient,
        uint256 rateBps,
        string calldata agreementRef
    ) external onlyOwner {
        if (recipient == address(0))       revert InvalidAddress();
        if (rateBps == 0 || rateBps > BPS) revert InvalidRate();

        RevenueShare storage rs = revenueShares[recipient];
        if (!rs.active) _recipients.push(recipient);
        rs.rateBps      = rateBps;
        rs.agreementRef = agreementRef;
        rs.active       = true;

        emit RevenueShareSet(recipient, rateBps, agreementRef);
    }

    /**
     * @notice Deactivate a revenue share on agreement termination.
     *         The record is preserved for historical reference; rateBps is not zeroed.
     */
    function deactivateRevenueShare(address recipient) external onlyOwner {
        if (!revenueShares[recipient].active) revert NoActiveShare();
        revenueShares[recipient].active = false;
        emit RevenueShareDeactivated(recipient);
    }

    // ── Distribution ────────────────────────────────────────────────────────

    /**
     * @notice Pay a calculated amount to a single recipient.
     *         MZF calculates the owed amount off-chain from ChallengeRegistered
     *         events (feeAmount × rateBps / BPS for each qualifying purchase)
     *         and calls this to settle the payment.
     */
    function distribute(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (!revenueShares[recipient].active)      revert NoActiveShare();
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientBalance();
        usdc.safeTransfer(recipient, amount);
        emit Distributed(recipient, amount, revenueShares[recipient].agreementRef);
    }

    /**
     * @notice Settle multiple recipients in a single Safe transaction.
     */
    function distributeBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        if (recipients.length != amounts.length) revert LengthMismatch();
        uint256 total;
        for (uint256 i; i < amounts.length; i++) total += amounts[i];
        if (usdc.balanceOf(address(this)) < total) revert InsufficientBalance();
        for (uint256 i; i < recipients.length; i++) {
            if (!revenueShares[recipients[i]].active) revert NoActiveShare();
            usdc.safeTransfer(recipients[i], amounts[i]);
            emit Distributed(recipients[i], amounts[i], revenueShares[recipients[i]].agreementRef);
        }
    }

    /**
     * @notice Forward remaining USDC balance to the MZF treasury.
     *         Call after all distribute() calls for a given period.
     */
    function sweepToTreasury() external onlyOwner nonReentrant {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance == 0) revert NothingToSweep();
        usdc.safeTransfer(treasury, balance);
        emit SweptToTreasury(treasury, balance);
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    // ── Views ───────────────────────────────────────────────────────────────

    /// USDC currently held by this contract awaiting distribution.
    function pendingBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// All recipient addresses ever registered (includes inactive).
    function getRecipients() external view returns (address[] memory) {
        return _recipients;
    }
}
