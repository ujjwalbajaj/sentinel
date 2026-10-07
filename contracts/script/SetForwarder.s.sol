// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Guardian} from "../src/Guardian.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Guardian owner points the receiver at NEW_FORWARDER. address(0) is refused.
contract SetForwarder is SentinelScript {
    function run() external {
        uint256 ownerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address next = vm.envAddress("NEW_FORWARDER");
        if (next == address(0)) revert("NEW_FORWARDER is zero");

        ChainParams memory params = chainParams();
        Deployment memory deployment = loadDeployment();
        string memory kind = next == params.forwarder ? "mock" : "real";

        vm.startBroadcast(ownerKey);
        Guardian(deployment.guardian).setForwarderAddress(next);
        vm.stopBroadcast();

        console2.log("forwarder", next);
        console2.log("forwarderKind", kind);

        if (!broadcasting()) {
            console2.log("dry run: deployments json not updated");
            return;
        }

        deployment.forwarder = next;
        deployment.forwarderKind = kind;
        writeDeployment(deployment);
        console2.log("updated", deploymentPath());
    }
}
