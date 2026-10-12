// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title CFGGovernor
 * @author ChainFunded
 * @notice On-chain governance for the ChainFunded protocol.
 *
 *   Built on OpenZeppelin Governor (the same pattern used by Uniswap,
 *   Compound, and Aave). CFG token holders vote on proposals that
 *   execute through a timelock.
 *
 *   Parameters (benchmarked against Uniswap/Compound/Aave):
 *     - Proposal threshold: 0.25% of supply (250,000 CFG)
 *     - Quorum: 4% of total supply
 *     - Voting delay: 1 day (7,200 blocks at 12s)
 *     - Voting period: 5 days (36,000 blocks at 12s)
 *     - Timelock: 2-day minimum delay
 *
 *   Governs:
 *     - Default challenge rules (setDefaultRules)
 *     - Signer key rotation (updateSigner)
 *     - Protocol wallet changes (updateProtocolWallet)
 *     - Treasury allocation
 *     - Emergency actions
 *
 *   Does NOT govern:
 *     - Individual challenge rules (immutable per challenge)
 *     - Fee split constants (hardcoded in ChainFundedPool)
 *     - CFND LP token mechanics
 *     - Payout execution (smart contract-enforced)
 */
contract CFGGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /**
     * @param token              CFGToken (ERC20Votes) address
     * @param timelock           TimelockController address
     * @param _votingDelay       Blocks before voting opens (mainnet: 7200 ≈ 1 day)
     * @param _votingPeriod      Blocks voting stays open (mainnet: 36000 ≈ 5 days)
     * @param _proposalThreshold CFG tokens needed to propose (mainnet: 250000e18)
     */
    constructor(
        IVotes token,
        TimelockController timelock,
        uint48 _votingDelay,
        uint32 _votingPeriod,
        uint256 _proposalThreshold
    )
        Governor("ChainFunded Governor")
        GovernorSettings(
            _votingDelay,
            _votingPeriod,
            _proposalThreshold
        )
        GovernorVotes(token)
        GovernorVotesQuorumFraction(4) // 4% quorum
        GovernorTimelockControl(timelock)
    {}

    // ── Required overrides ─────────────────────────────────────────────────

    function votingDelay()
        public view override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public view override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public view override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public view override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal view override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }
}
