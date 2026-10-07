// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Admin and user deposit. The two amounts together must stay within the vault cap.
contract Seed is SentinelScript {
    function run() external {
        uint256 adminKey = vm.envUint("VAULT_ADMIN_PRIVATE_KEY");
        uint256 userKey = vm.envUint("USER_PRIVATE_KEY");
        address admin = vm.addr(adminKey);
        address user = vm.addr(userKey);
        uint256 seedAdmin;
        uint256 seedUser;
        if (block.chainid == 56) {
            seedAdmin = 6_000_000_000_000_000;
            seedUser = 1_500_000_000_000_000;
        } else {
            seedAdmin = vm.envUint("SEED_ADMIN_WEI");
            seedUser = vm.envUint("SEED_USER_WEI");
        }
        if (seedAdmin == 0 || seedUser == 0) revert("seed amount is zero");

        Deployment memory deployment = loadDeployment();
        VulnerableVault vault = VulnerableVault(payable(deployment.vault));
        uint256 cap = vault.maxTotalDeposits();
        uint256 nextBalance = address(vault).balance + seedAdmin + seedUser;
        if (nextBalance > cap) revert("seed exceeds TVL cap");

        vm.startBroadcast(adminKey);
        vault.deposit{value: seedAdmin}();
        vm.stopBroadcast();

        vm.startBroadcast(userKey);
        vault.deposit{value: seedUser}();
        vm.stopBroadcast();

        console2.log("seed admin", admin);
        console2.log("seed user", user);
        console2.log("seed total wei", seedAdmin + seedUser);
        console2.log("cap wei", cap);
    }
}
