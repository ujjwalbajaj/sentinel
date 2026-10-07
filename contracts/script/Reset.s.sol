// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Vault admin lifts the pause. Guardian cannot call this.
contract Reset is SentinelScript {
    function run() external {
        uint256 adminKey = vm.envUint("VAULT_ADMIN_PRIVATE_KEY");
        Deployment memory deployment = loadDeployment();
        VulnerableVault vault = VulnerableVault(payable(deployment.vault));

        vm.startBroadcast(adminKey);
        vault.unpause();
        vm.stopBroadcast();

        console2.log("unpaused", address(vault));
    }
}
