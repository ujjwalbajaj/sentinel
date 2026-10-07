# sentinel-cre

Chainlink CRE workflow for SENTINEL. The watcher POSTs evidence. This workflow scores it with deterministic rules and, at or above the pause threshold, writes a signed report to Guardian.

**simulation = single-node execution; deployed = DON consensus.**

A `cre workflow simulate` run compiles the workflow to WASM and executes it on this machine. There is no DON quorum. A deployed workflow runs on the Chainlink DON, and the signed report is produced only after consensus.

Chains:

- BNB Chain: `binance_smart_chain-mainnet`
- Base: `ethereum-mainnet-base-1`

## Layout

```
sentinel-cre/
  project.yaml                 RPC targets
  sentinel-guard/              workflow
  sentinel-guard/fixtures/     attack, control, and below-threshold payloads
  sentinel-guard/tests/        pure scoring tests
  shared/abi/                  ABIs copied from the contracts repo
  shared/deployments/          address book
```

The report payload is `abi.encode(address vault, uint8 score, bytes32 incidentId)`.

## Setup

```bash
cp .env.example .env
bun install --cwd ./sentinel-guard
```

`CRE_ETH_PRIVATE_KEY` is only required for `cre workflow simulate --broadcast`. Do not commit `.env`.

`BSC_RPC` and `BASE_RPC` are full NOWNodes mainnet URLs.

Deploy access is separate from simulation. `cre whoami` shows whether Chainlink has enabled it.

## Simulate

Run these from `sentinel-guard` (`bun run <script>`). They call:

```bash
cre workflow simulate sentinel-guard -T staging-settings --non-interactive --trigger-index 0 --http-payload ./fixtures/<file>.json
```

This installed CLI treats a leading `@` as JSON text, so `@fixtures/<file>.json` and `@./fixtures/<file>.json` are rejected. A real path, `./fixtures/<file>.json`, is loaded.

`-R ..` and `-e ../.env` are included so the CLI finds `project.yaml` and the RPC env file when `bun run` starts in the workflow folder. No script broadcasts unless its name ends in `:broadcast`.

| Script | Payload | Broadcast |
| --- | --- | --- |
| `sim:attack:base` | `fixtures/attack.base.json` | no |
| `sim:attack:bsc` | `fixtures/attack.bsc.json` | no |
| `sim:control` | `fixtures/control.json` | no |
| `sim:below` | `fixtures/below-threshold.json` | no |
| `sim:attack:base:broadcast` | `fixtures/attack.base.json` | yes |
| `sim:attack:bsc:broadcast` | `fixtures/attack.bsc.json` | yes |

`--listen` compiles once, runs the first payload, then stays up. Later payloads are `POST http://localhost:2000/trigger`. A new request does not compile again. Simulation limits allow one HTTP trigger every 30 seconds.
