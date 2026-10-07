// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IGuardedVault} from "./interfaces/IGuardedVault.sol";
import {ReceiverTemplate} from "./chainlink/ReceiverTemplate.sol";

/// @title Guardian
/// @notice Guardian can ONLY pause. It has no unpause, no fund transfer, no upgrade path.
/// @dev Reports arrive through Chainlink CRE. ReceiverTemplate accepts onReport only from the forwarder,
///      then calls _processReport. The report bytes are abi.encode(address vault, uint8 score, bytes32 incidentId).
contract Guardian is ReceiverTemplate {
    /// @notice Vaults whose admin finished onboarding.
    mapping(address vault => bool protected) public protectedVault;

    /// @notice Admin who registered each vault. Only that account can unregister it.
    mapping(address vault => address admin) public vaultAdmin;

    /// @notice Incident ids already acted on. Stops the same report from pausing twice.
    mapping(bytes32 incidentId => bool handled) public incidentHandled;

    /// @notice Minimum report score that pauses a vault. Inclusive.
    uint8 public pauseThreshold;

    /// @notice Threshold was outside 50..100.
    error InvalidThreshold();

    /// @notice Caller is not the vault's DEFAULT_ADMIN_ROLE, or is not the admin who registered it.
    error NotVaultAdmin();

    /// @notice This Guardian does not yet hold PAUSER_ROLE on the vault.
    error PauserRoleMissing();

    /// @notice Report names a vault that was never registered.
    error VaultNotProtected(address vault);

    /// @notice This incident id was already processed.
    error IncidentAlreadyHandled(bytes32 incidentId);

    /// @notice Report score is below pauseThreshold, so the vault stays unpaused.
    error ScoreBelowThreshold(uint8 score, uint8 pauseThreshold);

    /// @notice The owner cleared the forwarder. Reports are refused so a zero forwarder cannot pause anything.
    error ForwarderNotSet();

    /// @notice A vault admin registered a vault after granting this contract PAUSER_ROLE.
    event VaultRegistered(address indexed vault, address indexed admin);

    /// @notice The registering admin removed a vault from protection.
    event VaultUnregistered(address indexed vault, address indexed admin);

    /// @notice A high-score report was accepted and the vault was paused if it was not already.
    event ExploitBlocked(address indexed vault, uint8 score, bytes32 indexed incidentId, uint256 timestamp);

    /// @notice Owner changed the score required to pause.
    event PauseThresholdUpdated(uint8 threshold);

    /// @param forwarder Chainlink forwarder allowed to call onReport. Stored by ReceiverTemplate.
    /// @param threshold Score at or above which a report pauses the vault. Must be 50..100.
    constructor(address forwarder, uint8 threshold) ReceiverTemplate(forwarder) {
        if (threshold < 50 || threshold > 100) revert InvalidThreshold();
        pauseThreshold = threshold;
    }

    /// @notice Finish onboarding. Caller must be the vault admin, and this contract must already hold PAUSER_ROLE.
    /// @param vault Vault to protect. Pause-only; this contract never receives an unpause role.
    function registerVault(address vault) external {
        // DEFAULT_ADMIN_ROLE is 0x00 in OpenZeppelin AccessControl.
        if (!IAccessControl(vault).hasRole(bytes32(0), msg.sender)) revert NotVaultAdmin();
        if (!IAccessControl(vault).hasRole(IGuardedVault(vault).PAUSER_ROLE(), address(this))) {
            revert PauserRoleMissing();
        }
        protectedVault[vault] = true;
        vaultAdmin[vault] = msg.sender;
        emit VaultRegistered(vault, msg.sender);
    }

    /// @notice Remove a vault. Only the admin who registered it can call this.
    /// @param vault Vault to stop protecting.
    function unregisterVault(address vault) external {
        if (vaultAdmin[vault] != msg.sender) revert NotVaultAdmin();
        protectedVault[vault] = false;
        vaultAdmin[vault] = address(0);
        emit VaultUnregistered(vault, msg.sender);
    }

    /// @notice Pause a protected vault when a CRE report scores at or above pauseThreshold.
    /// @dev Called only from ReceiverTemplate.onReport after the forwarder check. Does not unpause or move funds.
    /// @param report abi.encode(address vault, uint8 score, bytes32 incidentId).
    function _processReport(bytes calldata report) internal override {
        // Getter is external, so this is an external self-call. It still runs before any pause.
        if (this.getForwarderAddress() == address(0)) revert ForwarderNotSet();
        (address vault, uint8 score, bytes32 incidentId) = abi.decode(report, (address, uint8, bytes32));
        if (!protectedVault[vault]) revert VaultNotProtected(vault);
        if (incidentHandled[incidentId]) revert IncidentAlreadyHandled(incidentId);
        if (score < pauseThreshold) revert ScoreBelowThreshold(score, pauseThreshold);
        incidentHandled[incidentId] = true;
        if (!IGuardedVault(vault).paused()) IGuardedVault(vault).pause();
        emit ExploitBlocked(vault, score, incidentId, block.timestamp);
    }

    /// @notice Change the pause score. Only the ReceiverTemplate owner. Must stay in 50..100.
    /// @param threshold New minimum score.
    function setPauseThreshold(uint8 threshold) external onlyOwner {
        if (threshold < 50 || threshold > 100) revert InvalidThreshold();
        pauseThreshold = threshold;
        emit PauseThresholdUpdated(threshold);
    }
}
