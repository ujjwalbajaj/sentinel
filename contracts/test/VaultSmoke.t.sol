// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";

contract VaultSmokeTest is Test {
    VulnerableVault internal vault;
    address internal admin = makeAddr("admin");
    address internal user = makeAddr("user");
    address internal stranger = makeAddr("stranger");
    address internal pauser = makeAddr("pauser");

    uint256 internal constant CAP = 1 ether;

    function setUp() public {
        vault = new VulnerableVault(admin, CAP);
        address[] memory who = new address[](1);
        who[0] = user;
        vm.prank(admin);
        vault.setAllowlist(who, true);
    }

    function test_AllowlistedUser_DepositAndWithdraw() public {
        vm.deal(user, 1 ether);
        vm.prank(user, user);
        vault.deposit{value: 0.4 ether}();
        assertEq(vault.balances(user), 0.4 ether);
        assertEq(vault.vaultBalance(), 0.4 ether);

        vm.prank(user, user);
        vault.withdrawAll();
        assertEq(vault.balances(user), 0);
        assertEq(user.balance, 1 ether);
        assertEq(vault.vaultBalance(), 0);
    }

    function test_NonAllowlisted_CannotDeposit() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger, stranger);
        vm.expectRevert(abi.encodeWithSelector(VulnerableVault.NotAllowlisted.selector, stranger));
        vault.deposit{value: 0.1 ether}();
    }

    function test_TvlCap_Enforced() public {
        vm.deal(user, 2 ether);
        vm.prank(user, user);
        vm.expectRevert(VulnerableVault.TvlCapExceeded.selector);
        vault.deposit{value: CAP + 1}();
    }

    function test_AdminRescue_WhilePaused() public {
        vm.deal(user, 1 ether);
        vm.prank(user, user);
        vault.deposit{value: 0.5 ether}();

        vm.startPrank(admin);
        vault.grantRole(vault.PAUSER_ROLE(), pauser);
        vm.stopPrank();

        vm.prank(pauser);
        vault.pause();
        assertTrue(vault.paused());

        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        vault.rescue(payable(admin));
        assertEq(vault.vaultBalance(), 0);
        assertEq(admin.balance, adminBefore + 0.5 ether);
    }
}
