// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Vault admin pulls the whole vault balance back to the vault admin.
contract Rescue is SentinelScript {
    function run() external {
        uint256 adminKey = vm.envUint("VAULT_ADMIN_PRIVATE_KEY");
        address admin = vm.envAddress("VAULT_ADMIN_ADDRESS");
        Deployment memory deployment = loadDeployment();
        VulnerableVault vault = VulnerableVault(payable(deployment.vault));

        vm.startBroadcast(adminKey);
        vault.rescue(payable(admin));
        vm.stopBroadcast();

        console2.log("rescued to", admin);
        console2.log("vault", address(vault));
    }
}
