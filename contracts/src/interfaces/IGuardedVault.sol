// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IGuardedVault
/// @notice The only surface Guardian is allowed to use: read pause state, read the pauser role, and pause.
interface IGuardedVault {
    /// @notice Pause the vault. Callable only by an account that holds PAUSER_ROLE.
    function pause() external;

    /// @notice True when deposits and withdrawals are stopped.
    function paused() external view returns (bool);

    /// @notice Role id the vault admin must grant to Guardian before SENTINEL can pause this vault.
    function PAUSER_ROLE() external view returns (bytes32);
}
