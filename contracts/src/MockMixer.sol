// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockMixer
/// @notice DEMO mock. Breaks the visible link between depositor and receiver. Never use a real mixer.
/// @dev There is no zero-knowledge proof. A secret hashes to a commitment. Whoever later presents that secret
///      receives `denom`. The backend treats a wallet whose first funds came from Withdrawal as mixer-funded.
contract MockMixer {
    /// @notice Fixed note size. Set once in the constructor so BNB and ETH demos can differ.
    uint256 public immutable denom;

    /// @notice Commitments that have been deposited.
    mapping(bytes32 commitment => bool exists) public commitments;

    /// @notice Commitments that have already been paid out.
    mapping(bytes32 commitment => bool isSpent) public spent;

    /// @notice Constructor was given a zero denomination.
    error ZeroDenom();

    /// @notice msg.value was not exactly denom.
    error WrongAmount();

    /// @notice This commitment was already deposited.
    error DuplicateCommitment();

    /// @notice The secret does not match an unspent commitment.
    error InvalidNote();

    /// @notice Paying the recipient failed.
    error TransferFailed();

    /// @notice A note of size denom was accepted.
    event Deposit(bytes32 indexed commitment, uint256 timestamp);

    /// @notice denom was paid to a receiver. The depositor is not recorded.
    event Withdrawal(address indexed to, uint256 timestamp);

    /// @param _denom Note size in wei. Must be non-zero.
    constructor(uint256 _denom) {
        if (_denom == 0) revert ZeroDenom();
        denom = _denom;
    }

    /// @notice Lock one note. The commitment is keccak256(abi.encode(secret)), computed off-chain.
    /// @param commitment Hash of the secret. The secret itself is not stored.
    function deposit(bytes32 commitment) external payable {
        if (msg.value != denom) revert WrongAmount();
        if (commitments[commitment]) revert DuplicateCommitment();
        commitments[commitment] = true;
        emit Deposit(commitment, block.timestamp);
    }

    /// @notice Pay denom to `to` if `secret` matches an unspent note.
    /// @param secret Preimage of the commitment.
    /// @param to Receiver. This is the fresh wallet in the demo, not the depositor.
    function withdraw(bytes32 secret, address payable to) external {
        bytes32 commitment = keccak256(abi.encode(secret));
        if (!commitments[commitment] || spent[commitment]) revert InvalidNote();
        spent[commitment] = true;
        (bool ok,) = to.call{value: denom}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(to, block.timestamp);
    }
}
