// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Attacker} from "../src/Attacker.sol";
import {Guardian} from "../src/Guardian.sol";
import {ReceiverTemplate} from "../src/chainlink/ReceiverTemplate.sol";
import {MockMixer} from "../src/MockMixer.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {MockForwarder} from "./mocks/MockForwarder.sol";

/// @notice Bot used to show that tx.origin, not the contract caller, is what the vault allowlist checks.
contract ExploitBot {
    function attack(VulnerableVault vault_) external payable {
        vault_.deposit{value: msg.value}();
        vault_.withdrawAll();
    }
}

contract SentinelTest is Test {
    VulnerableVault internal vault;
    Guardian internal guardian;
    MockForwarder internal forwarder;
    MockMixer internal mixer;

    address internal admin = makeAddr("admin");
    address internal user = makeAddr("user");
    address internal fresh = makeAddr("fresh");
    address internal stranger = makeAddr("stranger");
    address internal funder = makeAddr("funder");

    uint256 internal constant CAP = 100 ether;
    uint256 internal constant DENOM = 0.05 ether;
    uint8 internal constant THRESHOLD = 80;

    // Fixed vector for CRE and the backend. chainId 56, tx hash 0x11..11.
    uint256 internal constant VECTOR_CHAIN_ID = 56;
    bytes32 internal constant VECTOR_TX_HASH = 0x1111111111111111111111111111111111111111111111111111111111111111;
    bytes32 internal constant VECTOR_INCIDENT_ID = 0x9240ffc6acd796b72393694832cc4d0758061fe286eb2435f31124d826f2bfef;

    event ExploitBlocked(address indexed vault, uint8 score, bytes32 indexed incidentId, uint256 timestamp);

    function setUp() public {
        forwarder = new MockForwarder();
        guardian = new Guardian(address(forwarder), THRESHOLD);
        vault = new VulnerableVault(admin, CAP);
        mixer = new MockMixer(DENOM);
        _allow(user);
    }

    function _allow(address account) internal {
        address[] memory who = new address[](1);
        who[0] = account;
        vm.prank(admin);
        vault.setAllowlist(who, true);
    }

    function _deposit(address account, uint256 amount) internal {
        vm.deal(account, amount);
        vm.prank(account, account);
        vault.deposit{value: amount}();
    }

    function _onboard() internal {
        bytes32 pauserRole = vault.PAUSER_ROLE();
        vm.prank(admin);
        vault.grantRole(pauserRole, address(guardian));
        vm.prank(admin);
        guardian.registerVault(address(vault));
    }

    function _deliver(uint8 score, bytes32 incidentId) internal {
        forwarder.deliver(guardian, "", abi.encode(address(vault), score, incidentId));
    }

    function test_01_DepositAndWithdraw() public {
        _deposit(user, 0.4 ether);
        assertEq(vault.balances(user), 0.4 ether);

        uint256 before = user.balance;
        vm.prank(user, user);
        vault.withdrawAll();
        assertEq(vault.balances(user), 0);
        assertEq(user.balance, before + 0.4 ether);
        assertEq(vault.vaultBalance(), 0);
    }

    function test_02_StrikeDrainsTenTimesDeposit() public {
        _allow(fresh);
        _deposit(user, 20 ether);
        vm.prank(fresh);
        Attacker attacker = new Attacker(address(vault));

        uint256 d = 0.1 ether;
        uint256 before = vault.vaultBalance();
        vm.deal(fresh, d);
        vm.prank(fresh, fresh);
        attacker.strike{value: d}(10);

        assertEq(before - vault.vaultBalance(), 10 * d);
    }

    function test_03_ProbeTakesTwiceDeposit() public {
        _allow(fresh);
        _deposit(user, 1 ether);
        vm.prank(fresh);
        Attacker attacker = new Attacker(address(vault));

        uint256 d = 0.1 ether;
        vm.deal(fresh, d);
        vm.prank(fresh, fresh);
        attacker.probe{value: d}();
        assertEq(address(attacker).balance, 2 * d);
    }

    function test_04_NonAllowlisted_CannotDepositOrWithdraw() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger, stranger);
        vm.expectRevert(abi.encodeWithSelector(VulnerableVault.NotAllowlisted.selector, stranger));
        vault.deposit{value: 0.1 ether}();

        vm.prank(stranger, stranger);
        vm.expectRevert(abi.encodeWithSelector(VulnerableVault.NotAllowlisted.selector, stranger));
        vault.withdrawAll();
    }

    function test_05_BotFromNonAllowlistedOrigin_CannotExploit() public {
        _deposit(user, 5 ether);
        ExploitBot bot = new ExploitBot();
        vm.deal(stranger, 1 ether);
        vm.prank(stranger, stranger);
        vm.expectRevert(abi.encodeWithSelector(VulnerableVault.NotAllowlisted.selector, stranger));
        bot.attack{value: 0.2 ether}(vault);
        assertEq(vault.vaultBalance(), 5 ether);
    }

    function test_06_TvlCapEnforced() public {
        vm.deal(user, CAP + 1);
        vm.prank(user, user);
        vm.expectRevert(VulnerableVault.TvlCapExceeded.selector);
        vault.deposit{value: CAP + 1}();
    }

    function test_07_RegisterRequiresAdminAndPauserRole() public {
        vm.prank(stranger);
        vm.expectRevert(Guardian.NotVaultAdmin.selector);
        guardian.registerVault(address(vault));

        vm.prank(admin);
        vm.expectRevert(Guardian.PauserRoleMissing.selector);
        guardian.registerVault(address(vault));

        _onboard();
        assertTrue(guardian.protectedVault(address(vault)));
        assertEq(guardian.vaultAdmin(address(vault)), admin);
    }

    function test_08_HighScorePausesAndEmits() public {
        _onboard();
        bytes32 incidentId = keccak256("probe");
        vm.expectEmit(true, true, false, true, address(guardian));
        emit ExploitBlocked(address(vault), 96, incidentId, block.timestamp);
        _deliver(96, incidentId);
        assertTrue(vault.paused());
    }

    function test_09_StrikeAfterPause_RevertsAndBalanceUnchanged() public {
        _allow(fresh);
        _deposit(user, 5 ether);
        _onboard();
        _deliver(96, bytes32("pause-first"));
        assertTrue(vault.paused());

        vm.prank(fresh);
        Attacker attacker = new Attacker(address(vault));
        uint256 before = vault.vaultBalance();
        vm.deal(fresh, 0.1 ether);
        vm.prank(fresh, fresh);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        attacker.strike{value: 0.1 ether}(10);
        assertEq(vault.vaultBalance(), before);
    }

    function test_10_LowScore_DoesNotPause() public {
        _onboard();
        vm.expectRevert(abi.encodeWithSelector(Guardian.ScoreBelowThreshold.selector, uint8(70), THRESHOLD));
        _deliver(70, bytes32("low"));
        assertFalse(vault.paused());
    }

    function test_11_UnregisteredVault_Reverts() public {
        _onboard();
        VulnerableVault other = new VulnerableVault(admin, CAP);
        vm.expectRevert(abi.encodeWithSelector(Guardian.VaultNotProtected.selector, address(other)));
        forwarder.deliver(guardian, "", abi.encode(address(other), uint8(96), bytes32("other")));
    }

    function test_12_ReplayIncident_Reverts() public {
        _onboard();
        bytes32 incidentId = keccak256("once");
        _deliver(96, incidentId);
        vm.expectRevert(abi.encodeWithSelector(Guardian.IncidentAlreadyHandled.selector, incidentId));
        _deliver(96, incidentId);
    }

    function test_13_NonForwarder_RevertsInvalidSender() public {
        _onboard();
        vm.expectRevert(
            abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), address(forwarder))
        );
        guardian.onReport("", abi.encode(address(vault), uint8(96), bytes32("direct")));
    }

    function test_14_ZeroForwarder_RevertsForwarderNotSet() public {
        _onboard();
        guardian.setForwarderAddress(address(0));
        assertEq(guardian.getForwarderAddress(), address(0));

        vm.prank(stranger);
        vm.expectRevert(Guardian.ForwarderNotSet.selector);
        guardian.onReport("", abi.encode(address(vault), uint8(96), bytes32("open")));
        assertFalse(vault.paused());
    }

    function test_15_GuardianCannotUnpause_AdminCan() public {
        _onboard();
        _deliver(96, bytes32("unpause"));
        assertTrue(vault.paused());

        (bool ok,) = address(guardian).call(abi.encodeWithSignature("unpause()"));
        assertFalse(ok);
        assertTrue(vault.paused());

        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_16_RescueWhilePaused_AdminOnly() public {
        _deposit(user, 0.5 ether);
        _onboard();
        _deliver(96, bytes32("rescue"));

        vm.prank(stranger);
        vm.expectRevert();
        vault.rescue(payable(stranger));

        uint256 before = admin.balance;
        vm.prank(admin);
        vault.rescue(payable(admin));
        assertEq(vault.vaultBalance(), 0);
        assertEq(admin.balance, before + 0.5 ether);
    }

    function test_17_IncidentIdVector() public pure {
        bytes32 computed = keccak256(abi.encodePacked(VECTOR_CHAIN_ID, VECTOR_TX_HASH));
        assertEq(computed, VECTOR_INCIDENT_ID);
        console2.log("incidentId vector chainId", VECTOR_CHAIN_ID);
        console2.logBytes32(VECTOR_TX_HASH);
        console2.logBytes32(computed);
    }

    function test_18_FullDemoStory() public {
        _deposit(user, 1 ether);
        address surplus = makeAddr("surplus");
        _allow(surplus);
        _deposit(surplus, 1 ether);

        bytes32 secret = bytes32(uint256(7));
        bytes32 commitment = keccak256(abi.encode(secret));
        vm.deal(funder, DENOM);
        vm.prank(funder);
        mixer.deposit{value: DENOM}(commitment);
        mixer.withdraw(secret, payable(fresh));
        assertEq(fresh.balance, DENOM);

        _allow(fresh);
        vm.prank(fresh);
        Attacker attacker = new Attacker(address(vault));

        uint256 probeAmount = 0.01 ether;
        vm.prank(fresh, fresh);
        attacker.probe{value: probeAmount}();
        assertEq(address(attacker).balance, probeAmount * 2);

        _onboard();
        bytes32 incidentId = keccak256(abi.encodePacked(block.chainid, bytes32("probe-tx")));
        vm.expectEmit(true, true, false, true, address(guardian));
        emit ExploitBlocked(address(vault), 96, incidentId, block.timestamp);
        _deliver(96, incidentId);
        assertTrue(vault.paused());

        uint256 vaultBeforeStrike = vault.vaultBalance();
        vm.prank(fresh, fresh);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        attacker.strike{value: 0.01 ether}(10);
        assertEq(vault.vaultBalance(), vaultBeforeStrike);

        vm.prank(user, user);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.withdrawAll();

        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());

        uint256 userBefore = user.balance;
        vm.prank(user, user);
        vault.withdrawAll();
        assertEq(user.balance, userBefore + 1 ether);
        assertEq(vault.balances(user), 0);
    }
}
