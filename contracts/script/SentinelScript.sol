// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {VmSafe} from "forge-std/Vm.sol";

/// @notice Shared chain config and deployments/<chainId>.json reads and writes.
abstract contract SentinelScript is Script {
    using stdJson for string;

    struct ChainParams {
        string name;
        address forwarder;
        uint256 mixerDenom;
        uint256 maxTvl;
    }

    struct Deployment {
        uint256 chainId;
        string chainName;
        address vault;
        address guardian;
        address mixer;
        address forwarder;
        string forwarderKind;
        address vaultAdmin;
        address deployer;
        uint256 deployBlock;
        uint256 timestamp;
    }

    /// @dev 8453 uses the Base env vars. 56 uses the BNB Chain env vars. Anything else reverts.
    function chainParams() internal view returns (ChainParams memory params) {
        if (block.chainid == 8453) {
            params.name = "Base";
            params.forwarder = vm.envAddress("CRE_FORWARDER_BASE");
            params.mixerDenom = vm.envUint("MIXER_DENOM_BASE_WEI");
            params.maxTvl = vm.envUint("MAX_TVL_BASE_WEI");
        } else if (block.chainid == 56) {
            params.name = "BNB Chain";
            params.forwarder = vm.envAddress("CRE_FORWARDER_BSC");
            params.mixerDenom = vm.envUint("MIXER_DENOM_BSC_WEI");
            params.maxTvl = vm.envUint("MAX_TVL_BSC_WEI");
        } else {
            revert(string.concat("unsupported chain ", vm.toString(block.chainid)));
        }
        if (params.forwarder == address(0)) revert("forwarder is zero");
    }

    function broadcasting() internal view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
    }

    function deploymentPath() internal view returns (string memory) {
        return string.concat("deployments/", vm.toString(block.chainid), ".json");
    }

    function loadDeployment() internal view returns (Deployment memory deployment) {
        string memory json = vm.readFile(deploymentPath());
        deployment.chainId = json.readUint(".chainId");
        deployment.chainName = json.readString(".chainName");
        deployment.vault = json.readAddress(".vault");
        deployment.guardian = json.readAddress(".guardian");
        deployment.mixer = json.readAddress(".mixer");
        deployment.forwarder = json.readAddress(".forwarder");
        deployment.forwarderKind = json.readString(".forwarderKind");
        deployment.vaultAdmin = json.readAddress(".vaultAdmin");
        deployment.deployer = json.readAddress(".deployer");
        deployment.deployBlock = json.readUint(".deployBlock");
        deployment.timestamp = json.readUint(".timestamp");
    }

    /// @dev Writes only the fields the deploy record keeps. Callers decide when a broadcast is real.
    function writeDeployment(Deployment memory deployment) internal {
        string memory key = "deployment";
        key.serialize("chainId", deployment.chainId);
        key.serialize("chainName", deployment.chainName);
        key.serialize("vault", deployment.vault);
        key.serialize("guardian", deployment.guardian);
        key.serialize("mixer", deployment.mixer);
        key.serialize("forwarder", deployment.forwarder);
        key.serialize("forwarderKind", deployment.forwarderKind);
        key.serialize("vaultAdmin", deployment.vaultAdmin);
        key.serialize("deployer", deployment.deployer);
        key.serialize("deployBlock", deployment.deployBlock);
        string memory json = key.serialize("timestamp", deployment.timestamp);
        vm.writeFile(deploymentPath(), json);
    }
}
