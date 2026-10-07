// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Forwards ETH so the funding source of a demo attacker is this contract.
contract MockMixer {
    event Funded(address indexed to, uint256 amount);

    function fund(address to) external payable {
        (bool ok,) = to.call{value: msg.value}("");
        require(ok, "fund");
        emit Funded(to, msg.value);
    }
}
