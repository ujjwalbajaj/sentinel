// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IGuardian} from "./IGuardian.sol";

/// @title SentinelShieldUpgradeable
/// @notice Same `whenNotPaused` hook for a proxy. Call `__SentinelShield_init` from the upgrade initializer.
/// Storage lives in an ERC-7201 namespace so it does not collide with the vault's own variables.
abstract contract SentinelShieldUpgradeable {
    /// @custom:storage-location erc7201:sentinel.shield
    struct SentinelStorage {
        address guardian;
        bool initialized;
    }

    /// keccak256(abi.encode(uint256(keccak256("sentinel.shield")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant SENTINEL_STORAGE_LOCATION =
        0x25c72677867551ad2434669de8c0f1721307b79b10bba7ed2bf85ff1f3fc7f00;

    error SentinelPaused();
    error SentinelAlreadyInitialized();

    function sentinelGuardian() public view returns (address) {
        return _sentinelStorage().guardian;
    }

    /// @param guardian The SENTINEL guardian. address(0) installs the hook with no guard on duty.
    function __SentinelShield_init(address guardian) internal {
        SentinelStorage storage $ = _sentinelStorage();
        if ($.initialized) revert SentinelAlreadyInitialized();
        $.initialized = true;
        $.guardian = guardian;
    }

    modifier whenNotPaused() {
        address guardian = _sentinelStorage().guardian;
        if (guardian != address(0) && IGuardian(guardian).paused(address(this))) {
            revert SentinelPaused();
        }
        _;
    }

    function _sentinelStorage() private pure returns (SentinelStorage storage $) {
        bytes32 slot = SENTINEL_STORAGE_LOCATION;
        assembly {
            $.slot := slot
        }
    }
}
