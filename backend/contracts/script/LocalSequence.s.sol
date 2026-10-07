// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Exploit} from "../src/Exploit.sol";
import {Guardian} from "../src/Guardian.sol";
import {MockMixer} from "../src/MockMixer.sol";
import {StrikeCheck} from "../src/StrikeCheck.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";

/// @notice Full deploy-test-pause-strike sequence against a local anvil node.
/// Default keys are Anvil accounts 0 and 1 (public development keys).
contract LocalSequence is Script {
    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        uint256 attackerKey = vm.envOr(
            "ATTACKER_PRIVATE_KEY",
            uint256(0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d)
        );
        address deployer = vm.addr(deployerKey);
        address attacker = vm.addr(attackerKey);

        vm.startBroadcast(deployerKey);
        // On anvil the deployer stands in for KeystoneForwarder.
        Guardian guardian = new Guardian(deployer, 80);
        VulnerableVault vault = new VulnerableVault(address(guardian), "VaultX");
        vault.deposit{value: 99 ether}();
        MockMixer mixer = new MockMixer();
        mixer.fund{value: 2 ether}(attacker);
        vm.stopBroadcast();

        vm.startBroadcast(attackerKey);
        Exploit exploit = new Exploit{value: 1 ether}(address(vault));
        exploit.probe();
        StrikeCheck check = new StrikeCheck();
        vm.stopBroadcast();

        vm.startBroadcast(deployerKey);
        guardian.onReport("", abi.encode(address(vault), uint16(96), keccak256("sentinel-local")));
        vm.stopBroadcast();

        vm.startBroadcast(attackerKey);
        check.tryStrike(exploit);
        vm.stopBroadcast();

        require(guardian.paused(address(vault)), "vault not paused");
        require(!check.lastSucceeded(), "strike should have reverted");
        console2.log("Guardian", address(guardian));
        console2.log("VaultX", address(vault));
        console2.log("Exploit", address(exploit));
        console2.log("Mixer", address(mixer));
        console2.log("Strike reverted");
    }
}
