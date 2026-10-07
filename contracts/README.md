# SENTINEL

Smart contracts for SENTINEL, a real-time exploit shield. A watcher spots an attacker's small test call, a Chainlink CRE workflow writes a signed report on-chain, and Guardian pauses the victim vault before the real strike.

This repository is the Foundry project: Solidity only. Target chains are BNB Chain mainnet (chain id 56) and Base mainnet (chain id 8453). These are real-money networks.

## What this is

SENTINEL can pause a registered vault. It cannot unpause, move funds, or upgrade anything. The vault admin keeps `UNPAUSER_ROLE` and resets the demo themselves.

The demo vault is intentionally vulnerable to reentrancy. It exists only to show the shield stopping a strike.

## Contracts

| Contract | Role |
| --- | --- |
| `VulnerableVault` | Victim vault. Pause is granted to Guardian. Unpause stays with the vault admin. |
| `Guardian` | CRE consumer. Pauses a registered vault when a report score is high enough. |
| `Attacker` | Demo attacker. `probe()` is the small test call. `strike()` is the real drain. |
| `MockMixer` | Demo funding path that breaks the link between depositor and a fresh wallet. |
| `IGuardedVault` | Pause surface Guardian calls. |

## Deploy

Copy `.env.example` to `.env` and fill in keys and RPC URLs. Do not commit `.env`.

```bash
forge build
forge test -vvv
```

Broadcast and verify commands are added with the deploy scripts.

## Deployed addresses

| Chain | Vault | Guardian | Mixer |
| --- | --- | --- | --- |
| BNB Chain (56) | — | — | — |
| Base (8453) | — | — | — |

Addresses are written to `deployments/<chainId>.json` after deploy.

## Demo script

1. Deploy vault, Guardian, and mixer. Do not grant roles yet.
2. Seed the vault so it has visible deposits.
3. Onboarding: vault admin grants `PAUSER_ROLE` to Guardian, then `guardian.registerVault(vault)`.
4. Attacker takes mixer-sourced gas, deploys `Attacker`, and calls `probe()`.
5. Backend and CRE deliver a report. Guardian pauses the vault.
6. `strike()` reverts with `EnforcedPause()`. Vault balance is unchanged.
7. A normal user's `withdrawAll()` also reverts while the vault is paused, then succeeds after the admin unpauses.
8. Vault admin unpauses to reset the demo.

## Gas

`forge test` is 34 tests, all passing. Deploy gas is the full transaction gas from a local Anvil deploy (includes the 21,000 base). Call gas is the function gas from `forge test --gas-report` for one successful call, so it does not include that 21,000 base.

Prices used: BNB **$757.59** at **0.05 gwei**, ETH **$2,661.44** at **0.006 gwei**. On Base the L1 data fee is extra and small.

| Action | Gas | BNB Chain | Base |
| --- | --- | --- | --- |
| Deploy `VulnerableVault` | 833,851 | $0.0316 | $0.0133 |
| Deploy `Guardian` | 1,241,745 | $0.0470 | $0.0198 |
| Deploy `MockMixer` | 269,449 | $0.0102 | $0.0043 |
| Deploy `Attacker` | 413,278 | $0.0157 | $0.0066 |
| `grantRole` | 51,551 | $0.0020 | $0.0008 |
| `registerVault` | 77,082 | $0.0029 | $0.0012 |
| `probe` | 124,826 | $0.0047 | $0.0020 |
| `strike(10)` | 198,952 | $0.0075 | $0.0032 |
| `onReport` (pause, via forwarder) | 94,940 | $0.0036 | $0.0015 |
| `unpause` | 29,949 | $0.0011 | $0.0005 |
