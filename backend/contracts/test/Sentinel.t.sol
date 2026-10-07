// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";
import {Exploit} from "../src/Exploit.sol";
import {Guardian} from "../src/Guardian.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {MockMixer} from "../src/MockMixer.sol";
import {ReceiverTemplate} from "../src/ReceiverTemplate.sol";
import {SentinelShield} from "../src/SentinelShield.sol";
import {SentinelShieldUpgradeable} from "../src/SentinelShieldUpgradeable.sol";
import {SubscriptionRegistry} from "../src/SubscriptionRegistry.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";

contract SentinelTest is Test {
    Guardian internal guardian;
    VulnerableVault internal vault;
    Exploit internal exploit;
    MockMixer internal mixer;
    address internal attacker;

    function setUp() public {
        guardian = new Guardian(address(this), 80);
        vault = new VulnerableVault(address(guardian), "VaultX");
        vault.deposit{value: 99 ether}();

        attacker = makeAddr("attacker");
        mixer = new MockMixer();
        mixer.fund{value: 1 ether}(attacker);

        vm.prank(attacker);
        exploit = new Exploit{value: 1 ether}(address(vault));
    }

    function testProbeIsSmall() public {
        uint256 beforeBalance = address(vault).balance;
        vm.prank(attacker);
        exploit.probe();
        assertEq(beforeBalance - address(vault).balance, 0.001 ether);
    }

    function testStrikeDrainsThirtyEightPercent() public {
        uint256 beforeBalance = address(vault).balance;
        vm.prank(attacker);
        exploit.strike();
        uint256 drained = beforeBalance - address(vault).balance;
        assertEq(drained, (beforeBalance * 3800) / 10_000);
        assertEq(drained, 38 ether);
    }

    function testCreReportPausesBeforeStrike() public {
        bytes32 alertId = keccak256("alert-1");
        bytes memory report = abi.encode(address(vault), uint16(96), alertId);

        guardian.onReport("", report);

        assertTrue(guardian.paused(address(vault)));
        assertEq(guardian.pauseAlert(address(vault)), alertId);
        assertEq(guardian.pauseProbability(address(vault)), 96);

        vm.prank(attacker);
        vm.expectRevert(SentinelShield.SentinelPaused.selector);
        exploit.strike();
        assertEq(address(vault).balance, 100 ether);
    }

    function testRejectsUnauthorizedReport() public {
        bytes memory report = abi.encode(address(vault), uint16(96), bytes32("x"));
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, attacker, address(this)));
        guardian.onReport("", report);
    }

    function testRejectsLowProbability() public {
        bytes memory report = abi.encode(address(vault), uint16(79), bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(Guardian.BelowThreshold.selector, uint16(79)));
        guardian.onReport("", report);
    }

    function testSupportsReceiverInterface() public view {
        assertTrue(guardian.supportsInterface(type(IReceiver).interfaceId));
    }

    function testLapsedCoverageRefusesPauseAndWithdrawalsStayOpen() public {
        SubscriptionRegistry registry = new SubscriptionRegistry(0.01 ether);
        guardian.setSubscriptions(address(registry));

        bytes memory report = abi.encode(address(vault), uint16(96), bytes32("unpaid"));
        vm.expectRevert(abi.encodeWithSelector(Guardian.NotSubscribed.selector, address(vault)));
        guardian.onReport("", report);
        assertFalse(guardian.paused(address(vault)));

        vm.prank(attacker);
        exploit.probe();
        assertEq(address(vault).balance, 100 ether - 0.001 ether);
    }

    function testSubscribeThenPauseBlocksStrike() public {
        SubscriptionRegistry registry = new SubscriptionRegistry(0.01 ether);
        guardian.setSubscriptions(address(registry));
        registry.subscribe{value: 0.01 ether}(address(vault));
        assertTrue(registry.covered(address(vault)));

        guardian.onReport("", abi.encode(address(vault), uint16(96), bytes32("paid")));
        vm.prank(attacker);
        vm.expectRevert(SentinelShield.SentinelPaused.selector);
        exploit.strike();
        assertEq(address(vault).balance, 100 ether);
    }

    function testExistingPauseSurvivesExpiry() public {
        SubscriptionRegistry registry = new SubscriptionRegistry(0.01 ether);
        guardian.setSubscriptions(address(registry));
        registry.subscribe{value: 0.01 ether}(address(vault));
        guardian.onReport("", abi.encode(address(vault), uint16(96), bytes32("held")));

        vm.warp(block.timestamp + 31 days);
        assertFalse(registry.covered(address(vault)));
        assertTrue(guardian.paused(address(vault)));

        vm.prank(attacker);
        vm.expectRevert(SentinelShield.SentinelPaused.selector);
        exploit.probe();
        assertEq(address(vault).balance, 100 ether);
    }

    function testZeroGuardianDoesNotBlock() public {
        GuardedVault open = new GuardedVault(address(0));
        address user = makeAddr("depositor");
        vm.deal(user, 1 ether);
        vm.startPrank(user);
        open.deposit{value: 1 ether}();
        open.withdraw(1 ether);
        vm.stopPrank();
        assertEq(address(open).balance, 0);
        assertEq(user.balance, 1 ether);
    }

    function testUpgradeableInitOnce() public {
        UpgradeableVault box = new UpgradeableVault();
        box.initialize(address(0));
        box.withdraw();
        vm.expectRevert(SentinelShieldUpgradeable.SentinelAlreadyInitialized.selector);
        box.initialize(address(guardian));

        UpgradeableVault armed = new UpgradeableVault();
        armed.initialize(address(guardian));
        guardian.onReport("", abi.encode(address(armed), uint16(96), bytes32("upgrade")));
        vm.expectRevert(SentinelShieldUpgradeable.SentinelPaused.selector);
        armed.withdraw();
    }
}

contract UpgradeableVault is SentinelShieldUpgradeable {
    function initialize(address guardian) external {
        __SentinelShield_init(guardian);
    }

    function withdraw() external whenNotPaused {}
}
