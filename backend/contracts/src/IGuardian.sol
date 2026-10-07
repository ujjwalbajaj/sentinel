// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Read by every vault that inherits the SENTINEL shield.
interface IGuardian {
    function paused(address protocol) external view returns (bool);
}
