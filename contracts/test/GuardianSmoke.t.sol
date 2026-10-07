// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Guardian} from "../src/Guardian.sol";
import {ReceiverTemplate} from "../src/chainlink/ReceiverTemplate.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {MockForwarder} from "./mocks/MockForwarder.sol";

contract GuardianSmokeTest is Test {
    Guardian internal guardian;
    VulnerableVault internal vault;
    MockForwarder internal forwarder;

    address internal admin = makeAddr("admin");
    address internal stranger = makeAddr("stranger");

    uint8 internal constant THRESHOLD = 80;

    event ExploitBlocked(address indexed vault, uint8 score, bytes32 indexed incidentId, uint256 timestamp);

    function setUp() public {
        forwarder = new MockForwarder();
        guardian = new Guardian(address(forwarder), THRESHOLD);
        vault = new VulnerableVault(admin, 1 ether);
    }

    function _onboard() internal {
        bytes32 pauserRole = vault.PAUSER_ROLE();
        vm.prank(admin);
        vault.grantRole(pauserRole, address(guardian));
        vm.prank(admin);
        guardian.registerVault(address(vault));
    }

    function test_Register_RequiresAdminAndPauserRole() public {
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

    function test_ForwarderHighScore_PausesAndEmits() public {
        _onboard();
        bytes32 incidentId = keccak256("probe-tx");
        bytes memory report = abi.encode(address(vault), uint8(96), incidentId);

        vm.expectEmit(true, true, false, true, address(guardian));
        emit ExploitBlocked(address(vault), 96, incidentId, block.timestamp);
        forwarder.deliver(guardian, "", report);

        assertTrue(vault.paused());
        assertTrue(guardian.incidentHandled(incidentId));
    }

    function test_RandomCaller_CannotDeliverReport() public {
        _onboard();
        bytes memory report = abi.encode(address(vault), uint8(96), bytes32("direct"));
        vm.expectRevert(
            abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), address(forwarder))
        );
        guardian.onReport("", report);
        assertFalse(vault.paused());
    }

    function test_Replay_SameIncidentId_Reverts() public {
        _onboard();
        bytes32 incidentId = keccak256("same");
        bytes memory report = abi.encode(address(vault), uint8(96), incidentId);
        forwarder.deliver(guardian, "", report);

        vm.expectRevert(abi.encodeWithSelector(Guardian.IncidentAlreadyHandled.selector, incidentId));
        forwarder.deliver(guardian, "", report);
    }

    function test_Forwarder_IsNonZero() public view {
        assertTrue(guardian.getForwarderAddress() != address(0));
        assertEq(guardian.getForwarderAddress(), address(forwarder));
    }

    function test_Owner_CanSwitchForwarder_OldOneRejected() public {
        _onboard();
        MockForwarder next = new MockForwarder();
        guardian.setForwarderAddress(address(next));
        assertEq(guardian.getForwarderAddress(), address(next));

        bytes memory report = abi.encode(address(vault), uint8(96), bytes32("switch"));
        vm.expectRevert(
            abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(forwarder), address(next))
        );
        forwarder.deliver(guardian, "", report);
        assertFalse(vault.paused());

        next.deliver(guardian, "", report);
        assertTrue(vault.paused());
    }

    function test_LowScore_DoesNotPause() public {
        _onboard();
        bytes memory report = abi.encode(address(vault), uint8(70), bytes32("low"));
        vm.expectRevert(abi.encodeWithSelector(Guardian.ScoreBelowThreshold.selector, uint8(70), THRESHOLD));
        forwarder.deliver(guardian, "", report);
        assertFalse(vault.paused());
        assertFalse(guardian.incidentHandled(bytes32("low")));
    }
}
