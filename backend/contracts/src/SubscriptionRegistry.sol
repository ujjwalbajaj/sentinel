// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "./Ownable.sol";

interface ISubscription {
    function covered(address protocol) external view returns (bool);
}

/// @title SubscriptionRegistry
/// @notice Coverage clock for SENTINEL. While `covered` is true, the guardian may pause that protocol.
/// When it is false, the guardian rejects new pauses. The vault's shield does not read this contract,
/// so a lapsed invoice does not freeze withdrawals.
contract SubscriptionRegistry is Ownable, ISubscription {
    uint256 public monthlyPrice;
    mapping(address protocol => uint64 until) public coveredUntil;

    error NothingPaid();
    error ZeroProtocol();
    error TransferFailed();

    event Subscribed(address indexed protocol, address indexed payer, uint64 until, uint256 paid);
    event CoverageGranted(address indexed protocol, uint64 until);
    event MonthlyPriceUpdated(uint256 price);

    constructor(uint256 monthlyPrice_) Ownable(msg.sender) {
        monthlyPrice = monthlyPrice_;
    }

    function covered(address protocol) external view returns (bool) {
        return coveredUntil[protocol] >= block.timestamp;
    }

    /// @notice Extend coverage. 30 days costs `monthlyPrice`. Leftover time is kept.
    function subscribe(address protocol) external payable {
        if (protocol == address(0)) revert ZeroProtocol();
        if (msg.value == 0 || monthlyPrice == 0) revert NothingPaid();

        uint256 bought = (msg.value * 30 days) / monthlyPrice;
        if (bought == 0 || bought > type(uint64).max) revert NothingPaid();
        uint64 start = coveredUntil[protocol] > uint64(block.timestamp) ? coveredUntil[protocol] : uint64(block.timestamp);
        if (uint256(start) + bought > type(uint64).max) revert NothingPaid();
        uint64 until = start + uint64(bought);
        coveredUntil[protocol] = until;
        emit Subscribed(protocol, msg.sender, until, msg.value);
    }

    /// @notice Record coverage after an invoice was paid off-chain.
    function grant(address protocol, uint64 until) external onlyOwner {
        if (protocol == address(0)) revert ZeroProtocol();
        if (until > coveredUntil[protocol]) coveredUntil[protocol] = until;
        emit CoverageGranted(protocol, until);
    }

    function setMonthlyPrice(uint256 monthlyPrice_) external onlyOwner {
        monthlyPrice = monthlyPrice_;
        emit MonthlyPriceUpdated(monthlyPrice_);
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok,) = to.call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }
}
