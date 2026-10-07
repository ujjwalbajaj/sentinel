// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Guardian} from "../src/Guardian.sol";
import {SubscriptionRegistry} from "../src/SubscriptionRegistry.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";

/// @notice Deploys a guardian and a VaultX instance.
/// FORWARDER is the Chainlink KeystoneForwarder for that chain.
/// On a local anvil demo, FORWARDER can be the deployer address.
contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address forwarder = vm.envAddress("FORWARDER");
        vm.startBroadcast(key);
        SubscriptionRegistry registry = new SubscriptionRegistry(0.01 ether);
        Guardian guardian = new Guardian(forwarder, 80);
        guardian.setSubscriptions(address(registry));
        VulnerableVault vault = new VulnerableVault(address(guardian), "VaultX");
        registry.subscribe{value: 0.01 ether}(address(vault));
        vm.stopBroadcast();
        console2.log("Registry", address(registry));
        console2.log("Guardian", address(guardian));
        console2.log("VaultX", address(vault));
    }
}
