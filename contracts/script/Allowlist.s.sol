// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Vault admin allowlists the demo wallets. FRESH_WALLET is included only when it is set.
contract Allowlist is SentinelScript {
    function run() external {
        uint256 adminKey = vm.envUint("VAULT_ADMIN_PRIVATE_KEY");
        address admin = vm.envAddress("VAULT_ADMIN_ADDRESS");
        address user = vm.envAddress("USER_ADDRESS");
        address funder = vm.envAddress("ATTACKER_FUNDER_ADDRESS");
        address fresh = vm.envOr("FRESH_WALLET", address(0));
        if (admin == address(0) || user == address(0) || funder == address(0)) revert("allowlist address is zero");

        Deployment memory deployment = loadDeployment();
        uint256 count = fresh == address(0) ? 3 : 4;
        address[] memory who = new address[](count);
        who[0] = admin;
        who[1] = user;
        who[2] = funder;
        if (fresh != address(0)) who[3] = fresh;

        vm.startBroadcast(adminKey);
        VulnerableVault(payable(deployment.vault)).setAllowlist(who, true);
        vm.stopBroadcast();

        console2.log("allowlisted", count);
        console2.log("vault", deployment.vault);
    }
}
