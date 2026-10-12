// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only mock USDC with 6 decimals and free minting.
contract MockUSDC is ERC20 {
    constructor(address initialHolder) ERC20("USD Coin", "USDC") {
        _mint(initialHolder, 1_000_000_000 * 1e6); // 1B USDC
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
