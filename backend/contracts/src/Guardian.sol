// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {ISubscription} from "./SubscriptionRegistry.sol";

/// @title Guardian
/// @notice Shield for one or more protocol contracts. A Chainlink CRE workflow
/// submits a signed report; KeystoneForwarder calls `onReport`, and this
/// contract pauses the protocol the report names.
///
/// Report layout, shared with the TypeScript workflow:
///   abi.encode(address protocol, uint16 probability, bytes32 alertId)
///
/// `probability` is 0-100. Reports under `pauseThreshold` are rejected.
contract Guardian is ReceiverTemplate {
    uint16 public pauseThreshold;
    ISubscription public subscriptions;

    mapping(address protocol => bool) private _paused;
    mapping(address protocol => bytes32 alertId) public pauseAlert;
    mapping(address protocol => uint16 probability) public pauseProbability;

    error BadThreshold();
    error BelowThreshold(uint16 probability);
    error ZeroProtocol();
    error NotSubscribed(address protocol);

    event ProtocolPaused(
        address indexed protocol, bytes32 indexed alertId, uint16 probability, address indexed reporter
    );
    event ProtocolUnpaused(address indexed protocol);

    constructor(address forwarder, uint16 pauseThreshold_) ReceiverTemplate(forwarder) {
        if (pauseThreshold_ == 0 || pauseThreshold_ > 100) revert BadThreshold();
        pauseThreshold = pauseThreshold_;
    }

    function paused(address protocol) external view returns (bool) {
        return _paused[protocol];
    }

    function setPauseThreshold(uint16 pauseThreshold_) external onlyOwner {
        if (pauseThreshold_ == 0 || pauseThreshold_ > 100) revert BadThreshold();
        pauseThreshold = pauseThreshold_;
    }

    /// @notice Turn on the subscription check. address(0) leaves pauses unrestricted.
    function setSubscriptions(address registry) external onlyOwner {
        subscriptions = ISubscription(registry);
    }

    /// @notice Break-glass pause for the owner multisig. The product path is `onReport`.
    function emergencyPause(address protocol, uint16 probability, bytes32 alertId) external onlyOwner {
        _pause(protocol, probability, alertId);
    }

    function unpause(address protocol) external onlyOwner {
        _paused[protocol] = false;
        emit ProtocolUnpaused(protocol);
    }

    function _processReport(bytes calldata report) internal override {
        (address protocol, uint16 probability, bytes32 alertId) = abi.decode(report, (address, uint16, bytes32));
        _pause(protocol, probability, alertId);
    }

    function _pause(address protocol, uint16 probability, bytes32 alertId) private {
        if (protocol == address(0)) revert ZeroProtocol();
        if (probability < pauseThreshold) revert BelowThreshold(probability);
        if (address(subscriptions) != address(0) && !subscriptions.covered(protocol)) {
            revert NotSubscribed(protocol);
        }
        _paused[protocol] = true;
        pauseAlert[protocol] = alertId;
        pauseProbability[protocol] = probability;
        emit ProtocolPaused(protocol, alertId, probability, msg.sender);
    }
}
