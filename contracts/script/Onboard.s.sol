// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Guardian} from "../src/Guardian.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Vault admin grants PAUSER_ROLE, then registers the vault with Guardian.
contract Onboard is SentinelScript {
    function run() external {
        uint256 adminKey = vm.envUint("VAULT_ADMIN_PRIVATE_KEY");
        Deployment memory deployment = loadDeployment();
        VulnerableVault vault = VulnerableVault(payable(deployment.vault));
        Guardian guardian = Guardian(deployment.guardian);

        vm.startBroadcast(adminKey);
        vault.grantRole(vault.PAUSER_ROLE(), address(guardian));
        guardian.registerVault(address(vault));
        vm.stopBroadcast();

        console2.log("onboarded vault", address(vault));
        console2.log("guardian", address(guardian));
    }
}
