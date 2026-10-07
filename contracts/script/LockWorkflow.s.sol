// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Guardian} from "../src/Guardian.sol";
import {SentinelScript} from "./SentinelScript.sol";

/// @notice Guardian owner locks reports to one workflow id and author. For later, after the workflow exists.
contract LockWorkflow is SentinelScript {
    function run() external {
        uint256 ownerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        bytes32 workflowId = vm.envBytes32("EXPECTED_WORKFLOW_ID");
        address author = vm.envAddress("EXPECTED_AUTHOR");
        if (workflowId == bytes32(0)) revert("EXPECTED_WORKFLOW_ID is zero");
        if (author == address(0)) revert("EXPECTED_AUTHOR is zero");

        Deployment memory deployment = loadDeployment();

        vm.startBroadcast(ownerKey);
        Guardian guardian = Guardian(deployment.guardian);
        guardian.setExpectedWorkflowId(workflowId);
        guardian.setExpectedAuthor(author);
        vm.stopBroadcast();

        console2.log("workflow author", author);
        console2.log("guardian", address(guardian));
    }
}
