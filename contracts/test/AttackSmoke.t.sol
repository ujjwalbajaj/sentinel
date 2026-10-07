// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Attacker} from "../src/Attacker.sol";
import {Guardian} from "../src/Guardian.sol";
import {MockMixer} from "../src/MockMixer.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {MockForwarder} from "./mocks/MockForwarder.sol";

contract AttackSmokeTest is Test {
    VulnerableVault internal vault;
    MockMixer internal mixer;

    address internal admin = makeAddr("admin");
    address internal user = makeAddr("user");
    address internal fresh = makeAddr("fresh");
    address internal outsider = makeAddr("outsider");

    uint256 internal constant CAP = 100 ether;
    uint256 internal constant DENOM = 0.05 ether;

    function setUp() public {
        vault = new VulnerableVault(admin, CAP);
        mixer = new MockMixer(DENOM);
        address[] memory who = new address[](2);
        who[0] = user;
        who[1] = fresh;
        vm.prank(admin);
        vault.setAllowlist(who, true);
    }

    function _seed(uint256 amount) internal {
        vm.deal(user, amount);
        vm.prank(user, user);
        vault.deposit{value: amount}();
    }

    function _attacker() internal returns (Attacker attacker) {
        vm.prank(fresh);
        attacker = new Attacker(address(vault));
    }

    function test_Mixer_DepositWithdraw_ThenDoubleSpendAndWrongAmount() public {
        bytes32 secret = bytes32(uint256(1));
        bytes32 commitment = keccak256(abi.encode(secret));
        address depositor = makeAddr("depositor");
        address receiver = makeAddr("receiver");

        vm.deal(depositor, DENOM);
        vm.prank(depositor);
        mixer.deposit{value: DENOM}(commitment);
        assertEq(mixer.commitments(commitment), true);

        mixer.withdraw(secret, payable(receiver));
        assertEq(receiver.balance, DENOM);
        assertEq(mixer.spent(commitment), true);

        vm.expectRevert(MockMixer.InvalidNote.selector);
        mixer.withdraw(secret, payable(receiver));

        vm.deal(depositor, DENOM - 1);
        vm.prank(depositor);
        vm.expectRevert(MockMixer.WrongAmount.selector);
        mixer.deposit{value: DENOM - 1}(bytes32(uint256(2)));
    }

    function test_Probe_AllowlistedOrigin_GainsTwiceDeposit() public {
        _seed(1 ether);
        Attacker attacker = _attacker();
        uint256 depositAmount = 0.1 ether;
        vm.deal(fresh, depositAmount);

        vm.prank(fresh, fresh);
        attacker.probe{value: depositAmount}();

        assertEq(attacker.lastDeposit(), depositAmount);
        assertEq(address(attacker).balance, depositAmount * 2);
    }

    function test_Strike_DrainsMuchMoreThanDeposited() public {
        _seed(20 ether);
        Attacker attacker = _attacker();
        uint256 depositAmount = 0.1 ether;
        vm.deal(fresh, depositAmount);

        vm.prank(fresh, fresh);
        attacker.strike{value: depositAmount}(10);

        assertGt(address(attacker).balance, depositAmount * 2);
        assertEq(address(attacker).balance, depositAmount * 11);
    }

    function test_Strike_RevertsAfterGuardianPause() public {
        _seed(1 ether);
        Attacker attacker = _attacker();
        MockForwarder forwarder = new MockForwarder();
        Guardian guardian = new Guardian(address(forwarder), 80);
        bytes32 pauserRole = vault.PAUSER_ROLE();
        vm.prank(admin);
        vault.grantRole(pauserRole, address(guardian));
        vm.prank(admin);
        guardian.registerVault(address(vault));
        forwarder.deliver(guardian, "", abi.encode(address(vault), uint8(96), bytes32("pause")));
        assertTrue(vault.paused());

        vm.deal(fresh, 0.1 ether);
        vm.prank(fresh, fresh);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        attacker.strike{value: 0.1 ether}(10);
    }

    function test_Probe_NonAllowlistedOrigin_Reverts() public {
        vm.prank(outsider);
        Attacker attacker = new Attacker(address(vault));
        vm.deal(outsider, 0.1 ether);
        vm.prank(outsider, outsider);
        vm.expectRevert(abi.encodeWithSelector(VulnerableVault.NotAllowlisted.selector, outsider));
        attacker.probe{value: 0.1 ether}();
    }
}
