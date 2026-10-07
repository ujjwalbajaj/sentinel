// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "./IERC165.sol";

/// @title IReceiver - receives Chainlink CRE / Keystone reports
/// @notice Implementations must support this interface through ERC-165.
interface IReceiver is IERC165 {
    /// @param metadata Workflow identity. Production KeystoneForwarder passes 64 bytes.
    /// @param report ABI-encoded payload from the workflow.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
