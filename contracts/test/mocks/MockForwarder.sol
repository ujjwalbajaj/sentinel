// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IReceiver} from "../../src/chainlink/IReceiver.sol";

/// @title MockForwarder
/// @notice Test stand-in for KeystoneForwarder. Calls the real IReceiver.onReport entry.
contract MockForwarder {
    /// @notice Deliver a report the way the Chainlink forwarder does.
    /// @param consumer Guardian, or any IReceiver.
    /// @param metadata Workflow metadata. Empty is fine when the consumer has no expected workflow set.
    /// @param report ABI-encoded consumer payload.
    function deliver(IReceiver consumer, bytes calldata metadata, bytes calldata report) external {
        consumer.onReport(metadata, report);
    }
}
