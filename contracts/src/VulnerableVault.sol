// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IGuardedVault} from "./interfaces/IGuardedVault.sol";

/// @title VulnerableVault
/// @notice DEMO ONLY — INTENTIONALLY VULNERABLE (reentrancy) — ALLOWLISTED + TVL-CAPPED FOR MAINNET SAFETY
/// @dev withdrawAll sends ETH before it clears the balance, so an allowlisted attacker contract can re-enter
///      and withdraw the same credit more than once. Two locks keep strangers and MEV bots out: demoAllowlist
///      is checked against tx.origin, and maxTotalDeposits caps how much ETH the vault will hold.
contract VulnerableVault is AccessControl, Pausable, IGuardedVault {
    /// @notice Role Guardian receives later. This contract never grants it in the constructor.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Role that may lift the pause. The constructor gives it to the vault admin only.
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    /// @notice Admin passed address(0).
    error ZeroAddress();

    /// @notice TVL cap was zero. A zero cap would make every deposit revert.
    error InvalidCap();

    /// @notice tx.origin is not on the demo allowlist, so this call cannot move funds.
    error NotAllowlisted(address origin);

    /// @notice Deposit value was zero.
    error ZeroAmount();

    /// @notice This deposit would push the vault's ETH balance above maxTotalDeposits.
    error TvlCapExceeded();

    /// @notice Caller has no recorded balance to withdraw.
    error NothingToWithdraw();

    /// @notice The ETH transfer failed.
    error TransferFailed();

    /// @notice Plain ETH transfers are rejected. Use deposit().
    error UseDeposit();

    /// @notice An allowlisted account deposited ETH.
    event Deposited(address indexed user, uint256 amount);

    /// @notice An allowlisted account was paid its recorded balance. The bug may emit this more than once per credit.
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice The vault admin changed one allowlist entry.
    event AllowlistUpdated(address indexed account, bool allowed);

    /// @notice PAUSER_ROLE paused the vault. OpenZeppelin also emits Paused.
    event PausedBy(address indexed account);

    /// @notice The admin recovered the whole ETH balance. This can happen while the vault is paused.
    event Rescued(address indexed to, uint256 amount);

    /// @notice Wallets the admin has approved for the demo. Checked on tx.origin, not msg.sender.
    mapping(address account => bool allowed) public demoAllowlist;

    /// @notice Recorded credit per account. withdrawAll does not clear this until after the ETH transfer.
    mapping(address account => uint256 amount) public balances;

    /// @notice Maximum ETH this vault will hold, including the deposit currently being made.
    uint256 public immutable maxTotalDeposits;

    /// @notice Blocks anyone whose transaction origin is not on the demo allowlist.
    /// @dev tx.origin is deliberate. When the attacker contract re-enters, msg.sender is that contract, but
    ///      tx.origin is still the allowlisted attacker wallet. A stranger or MEV bot is not on the list, so
    ///      their contract cannot deposit or withdraw.
    modifier onlyDemoParticipant() {
        if (!demoAllowlist[tx.origin]) revert NotAllowlisted(tx.origin);
        _;
    }

    /// @param admin Vault admin. Receives DEFAULT_ADMIN_ROLE and UNPAUSER_ROLE. Does not receive PAUSER_ROLE.
    /// @param _maxTotalDeposits Hard cap on address(this).balance. Must be non-zero.
    constructor(address admin, uint256 _maxTotalDeposits) {
        if (admin == address(0)) revert ZeroAddress();
        if (_maxTotalDeposits == 0) revert InvalidCap();
        maxTotalDeposits = _maxTotalDeposits;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UNPAUSER_ROLE, admin);
    }

    /// @notice Add or remove demo participants. Pass a short list; this is the admin's onboarding call, not a public loop.
    /// @param who Accounts to update.
    /// @param allowed True to let that account's transactions deposit and withdraw. False to remove them.
    function setAllowlist(address[] calldata who, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = who.length;
        for (uint256 i = 0; i < length; ++i) {
            demoAllowlist[who[i]] = allowed;
            emit AllowlistUpdated(who[i], allowed);
        }
    }

    /// @notice Record an ETH deposit for the caller.
    /// @dev Reverts when the vault's balance, which already includes msg.value, is above the cap.
    function deposit() external payable whenNotPaused onlyDemoParticipant {
        if (msg.value == 0) revert ZeroAmount();
        if (address(this).balance > maxTotalDeposits) revert TvlCapExceeded();
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Pay the caller their recorded balance.
    /// @dev INTENTIONAL BUG. The ETH is sent before balances[msg.sender] is set to 0, so the recipient can
    ///      re-enter withdrawAll and be paid again while the credit is still non-zero. The update must be
    ///      `= 0`, not `-= bal`. With `-= bal`, Solidity 0.8 checked math underflows on re-entry and the
    ///      whole exploit reverts by itself, which would kill the demo. Do not add ReentrancyGuard.
    function withdrawAll() external whenNotPaused onlyDemoParticipant {
        uint256 bal = balances[msg.sender];
        if (bal == 0) revert NothingToWithdraw();
        (bool ok,) = msg.sender.call{value: bal}("");
        if (!ok) revert TransferFailed();
        balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, bal);
    }

    /// @notice Stop deposits and withdrawals. Guardian calls this through the PAUSER_ROLE. It cannot unpause.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit PausedBy(msg.sender);
    }

    /// @notice Resume deposits and withdrawals. Only UNPAUSER_ROLE, which stays with the vault admin.
    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }

    /// @notice Send the entire ETH balance to `to`. Works while paused so the admin can recover funds after the demo.
    /// @param to Recipient of the whole vault balance. Cannot be address(0).
    function rescue(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Rescued(to, amount);
    }

    /// @notice ETH currently held by the vault.
    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Plain ETH is rejected so the cap and the allowlist cannot be bypassed.
    receive() external payable {
        revert UseDeposit();
    }

    /// @inheritdoc IGuardedVault
    function paused() public view override(Pausable, IGuardedVault) returns (bool) {
        return super.paused();
    }

    /// @notice Reports AccessControl plus this vault's guard interface.
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return interfaceId == type(IGuardedVault).interfaceId || super.supportsInterface(interfaceId);
    }
}
