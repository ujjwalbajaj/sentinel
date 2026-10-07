// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Guardian} from "../src/Guardian.sol";
import {MockMixer} from "../src/MockMixer.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Deploy the vault, Guardian, and mixer. Does not grant roles or register the vault.
contract Deploy is SentinelScript {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envAddress("VAULT_ADMIN_ADDRESS");
        if (admin == address(0)) revert("VAULT_ADMIN_ADDRESS is zero");

        ChainParams memory params = chainParams();
        uint256 threshold = vm.envUint("PAUSE_THRESHOLD");
        if (threshold < 50 || threshold > 100) revert("PAUSE_THRESHOLD must be 50..100");

        vm.startBroadcast(deployerKey);
        VulnerableVault vault = new VulnerableVault(admin, params.maxTvl);
        Guardian guardian = new Guardian(params.forwarder, uint8(threshold));
        MockMixer mixer = new MockMixer(params.mixerDenom);
        vm.stopBroadcast();

        console2.log("chain", params.name);
        console2.log("vault", address(vault));
        console2.log("guardian", address(guardian));
        console2.log("mixer", address(mixer));
        console2.log("forwarder", params.forwarder);

        if (!broadcasting()) {
            console2.log("dry run: deployments json not written");
            return;
        }

        writeDeployment(
            Deployment({
                chainId: block.chainid,
                chainName: params.name,
                vault: address(vault),
                guardian: address(guardian),
                mixer: address(mixer),
                forwarder: params.forwarder,
                forwarderKind: "mock",
                vaultAdmin: admin,
                deployer: deployer,
                deployBlock: block.number,
                timestamp: block.timestamp
            })
        );
        console2.log("wrote", deploymentPath());
    }
}
