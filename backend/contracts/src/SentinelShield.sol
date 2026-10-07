// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IGuardian} from "./IGuardian.sol";

/// @title SentinelShield
/// @notice Drop-in guard for a new contract, used like OpenZeppelin's ReentrancyGuard.
/// Inherit it, pass the guardian, and put `whenNotPaused` on every function that sends funds.
///
/// The modifier only reads a pause flag. It does not check a subscription. If the
/// protocol stops paying, SENTINEL stops pausing them and withdrawals keep working.
abstract contract SentinelShield {
    IGuardian public immutable SENTINEL_GUARDIAN;

    error SentinelPaused();

    /// @param guardian The SENTINEL guardian. Pass address(0) to install the hook with no guard on duty.
    constructor(address guardian) {
        SENTINEL_GUARDIAN = IGuardian(guardian);
    }

    modifier whenNotPaused() {
        if (address(SENTINEL_GUARDIAN) != address(0) && SENTINEL_GUARDIAN.paused(address(this))) {
            revert SentinelPaused();
        }
        _;
    }
}
