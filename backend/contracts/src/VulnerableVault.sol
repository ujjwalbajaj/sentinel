// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SentinelShield} from "./SentinelShield.sol";

/// @title VulnerableVault
/// @notice Demo vault. Do not deploy with real funds.
/// @dev `withdraw` sends ETH before it debits `balanceOf`. A callee can re-enter
/// and withdraw the same credit again until it chooses to stop. The pause hook is
/// the same `whenNotPaused` modifier a real vault imports.
contract VulnerableVault is SentinelShield {
    string public name;
    mapping(address account => uint256) public balanceOf;

    error Insufficient();
    error TransferFailed();

    constructor(address guardian_, string memory name_) SentinelShield(guardian_) {
        name = name_;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external whenNotPaused {
        uint256 credit = balanceOf[msg.sender];
        if (credit < amount) revert Insufficient();

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        // Debit uses the credit read before the call, so a re-entering callee
        // still sees the old balance and can withdraw it again.
        balanceOf[msg.sender] = credit - amount;
    }

    receive() external payable {}
}
