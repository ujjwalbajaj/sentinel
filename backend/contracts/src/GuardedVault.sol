// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SentinelShield} from "./SentinelShield.sol";

/// @title GuardedVault
/// @notice The contract a real protocol copies. Funds move only after balances are updated.
/// `whenNotPaused` is the SENTINEL hook.
contract GuardedVault is SentinelShield {
    mapping(address account => uint256) public balanceOf;

    error Insufficient();
    error TransferFailed();

    constructor(address guardian) SentinelShield(guardian) {}

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external whenNotPaused {
        uint256 credit = balanceOf[msg.sender];
        if (credit < amount) revert Insufficient();
        balanceOf[msg.sender] = credit - amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
