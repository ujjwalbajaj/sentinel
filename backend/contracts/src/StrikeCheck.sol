// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Exploit} from "./Exploit.sol";

/// @notice Used by the local broadcast script to record that `strike` reverted.
contract StrikeCheck {
    bool public lastSucceeded;

    function tryStrike(Exploit exploit) external {
        try exploit.strike() {
            lastSucceeded = true;
        } catch {
            lastSucceeded = false;
        }
    }
}
