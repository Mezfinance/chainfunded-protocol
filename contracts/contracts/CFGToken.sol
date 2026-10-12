// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title CFGToken
 * @author ChainFunded
 * @notice Governance token for the ChainFunded protocol.
 *
 *   Separate from CFND (LP token). CFG holders vote on protocol
 *   parameters, treasury allocation, and signer key rotation.
 *
 *   - Fixed supply: 100,000,000 CFG (no inflation, no minting after deployment)
 *   - ERC20Votes: delegation + checkpointing for snapshot-safe governance
 *   - ERC20Permit: gasless approvals via EIP-2612
 *
 *   Allocation (minted at deployment to designated addresses):
 *     46% Community Treasury  — Timelock, released via governance vote
 *     15% Trading Rewards     — 5-year emission to active traders (CFGDistributor)
 *     10% LP Rewards          — 5-year emission to CFND stakers (CFGLPRewards)
 *      5% Airdrop Reserve     — Timelock escrow, distributed via governance proposal
 *     20% Team & Founders     — 4yr vesting, 6mo cliff (CFGVesting)
 *      2% Advisors            — 10% TGE unlock + 12mo linear vest (CFGVesting)
 *      2% Investors           — 10% TGE unlock + 12mo linear vest (CFGVesting)
 */
contract CFGToken is ERC20, ERC20Permit, ERC20Votes, Ownable {

    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 100M tokens

    bool private _initialMintDone;

    constructor(address initialOwner)
        ERC20("ChainFunded Governance", "CFG")
        ERC20Permit("ChainFunded Governance")
        Ownable(initialOwner)
    {}

    /**
     * @notice One-time mint of the full token supply to allocation addresses.
     *         Can only be called once by the owner. After this, no new tokens
     *         can ever be created.
     *
     * @param recipients Array of addresses to receive tokens
     * @param amounts    Array of token amounts (in wei, 18 decimals)
     */
    function initialMint(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(!_initialMintDone, "Initial mint already completed");
        require(recipients.length == amounts.length, "Length mismatch");

        require(recipients.length > 0, "No recipients provided");

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "Cannot mint to zero address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            total += amounts[i];
        }
        require(total == MAX_SUPPLY, "Must mint exactly MAX_SUPPLY");

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }

        _initialMintDone = true;
    }

    /**
     * @notice Returns true after the one-time initial mint has been executed.
     */
    function initialMintCompleted() external view returns (bool) {
        return _initialMintDone;
    }

    // ── Required overrides for ERC20 + ERC20Votes ──────────────────────────

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(
        address owner
    ) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
