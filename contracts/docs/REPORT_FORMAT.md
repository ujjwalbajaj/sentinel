# CRE report format

Shared by Guardian and the CRE workflow.

```solidity
report = abi.encode(address vault, uint8 score, bytes32 incidentId)
incidentId = keccak256(abi.encodePacked(uint256 chainId, bytes32 suspectTxHash))
```

Fixed test vector (`test_17_IncidentIdVector`):

| Field | Value |
| --- | --- |
| chainId | `56` |
| suspectTxHash | `0x1111111111111111111111111111111111111111111111111111111111111111` |
| incidentId | `0x9240ffc6acd796b72393694832cc4d0758061fe286eb2435f31124d826f2bfef` |

Guardian overrides `ReceiverTemplate._processReport(bytes calldata report)`. The forwarder calls `onReport(bytes metadata, bytes report)`. `ReceiverTemplate` checks `msg.sender` against the forwarder stored in the constructor, then passes `report` to `_processReport`.

## Warning: zero forwarder

`setForwarderAddress` in the official `ReceiverTemplate` is **not virtual**, so Guardian cannot override it. The Chainlink file was left unchanged.

The constructor rejects `address(0)`. After deployment, the owner can still call `setForwarderAddress(address(0))`. The template then skips the `msg.sender` check. That path is mitigated in `Guardian._processReport`: if `getForwarderAddress()` is `address(0)`, the report reverts `ForwarderNotSet` and nothing is paused. Switching to a new non-zero forwarder is fine: the previous forwarder is rejected.

## Forwarders

Use the mock forwarder in the Guardian constructor for `cre workflow simulate`. After the CRE workflow is deployed, redeploy Guardian with the real KeystoneForwarder and run onboarding again. The constructor fixes the forwarder.

| Chain | Chain id | Mock (simulation) | Real (after CRE deploy) |
| --- | --- | --- | --- |
| BNB Chain | 56 | `0x6f3239bbb26e98961e1115aba83f8a282e5508c8` | `0x76c9cf548b4179F8901cda1f8623568b58215E62` |
| Base | 8453 | `0x5e342a8438b4f5d39e72875fcee6f76b39cce548` | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |
