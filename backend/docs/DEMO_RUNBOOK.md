# SENTINEL mainnet demo runbook

The backend watches. Chainlink CRE decides and pauses. Pause confirmation is the Guardian `ExploitBlocked` event. This process never calls `VulnerableVault.pause()`.

One full run spends real gas on the chain you pick. Read the floors in `.env` before the first action. A refused action means the paying wallet would end under its `*_FLOOR_WEI`.

## Before either chain

1. `npm install`
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` (Neon, `sslmode=require`), `NOWNODES_API_KEY`, `DEMO_TOKEN`, `JWT_SECRET`, `CRE_BIN`, and the three demo private keys. Do not commit `.env`.
3. Put the deployed `vault`, `guardian`, and `mixer` into `src/shared/deployments/8453.json` or `56.json`. ABIs must already be in `src/shared/abi/`. Attacker deploy also needs `src/shared/bytecode/Attacker.json` from the contracts repo sync.
4. `npm run check:nownodes` must print PASS for chain id, block number, three websocket heads, `debug_traceTransaction`, and both `debug_traceCall` tracers.
5. `npm run check:cre` must print the CRE version and confirm `CRE_REPO_PATH` exists.
6. `npm run db:migrate`
7. `npm run dev`

Health: `GET http://127.0.0.1:8787/health`

Until addresses are filled, `watchers` is `idle`. The socket namespace is `/live`.

The watcher subscribes to logs from the JSON ABIs only:

- `MockMixer.Withdrawal(to, timestamp)` marks the recipient `fundingSource=mixer`
- `VulnerableVault.Deposited` / `Withdrawn` / `PausedBy` become activity
- `Withdrawn` is what starts an investigation
- `Guardian.VaultRegistered` sets the protocol to `protected`
- `Guardian.ExploitBlocked` sets the incident to `paused`

`PausedBy` is activity. It is not pause confirmation.

Reentrancy evidence is the OR of two traces. Both must run:

- `debug_traceTransaction` on the on-chain `probe` (probe re-enters once)
- `debug_traceCall` of `strike(10)` with the same value as the probe

A reverted strike is matched from new heads only while an incident is `sent_to_cre` or `paused`, and only for `strike(uint256)` from the recorded attacker. Idle chains are not full-block scanned.

`allowlist-fresh-wallet` sends `setAllowlist([fresh], true)` from `VAULT_ADMIN_PRIVATE_KEY`. It is not skipped.

`deploy-attacker` reads bytecode from `src/shared/bytecode/Attacker.json`. If that file is missing, the action fails and does not compile or guess bytecode.

The mixer demo draws a random `bytes32` secret and uses `commitment = keccak256(abi.encode(secret))`. The deposit value is the mixer's on-chain `denom()`. The fresh wallet's only incoming value is `MockMixer.withdraw`. Never direct-transfer that wallet. Keys are not returned.

Probe sends `DEMO_PROBE_WEI_<chainId>`. Strike sends `DEMO_STRIKE_WEI_<chainId>` and calls `strike(DEMO_STRIKE_REENTRIES)`. On Base those are 0.0002 ETH, 0.00015 ETH, and 10. Mixer deposits use on-chain `MockMixer.denom()`.

`control-withdraw` is a user `deposit` of that same 10%, then `withdrawAll()`. It must not create an incident.

`reset` calls `unpause()` on the vault from the vault admin, then sets the local protocol status to `protected`. This spec has no `Unpaused` event, so the receipt is what updates the row.

## Order, Base then BNB

Repeat the same list with `8453` and then `56`. Send header `x-demo-token: $DEMO_TOKEN`.

1. `POST /demo/8453/status`  
   Log: balances and `paused: false`. No socket event.
2. `POST /demo/8453/fund-fresh-wallet`  
   Two transactions: mixer `deposit(commitment)` then `withdraw(secret, fresh)`. Log: `mixer withdrawal recorded`. Socket: `activity:new` type `mixer_funded`. The response address is the fresh wallet. The key and the secret are not in the response.
3. `POST /demo/8453/allowlist-fresh-wallet`  
   Real `setAllowlist` transaction. Socket may show `AllowlistUpdated` only as a chain log; the watcher does not treat it as an incident.
4. `POST /demo/8453/deploy-attacker`  
   Fails with a clear error until `src/shared/bytecode/Attacker.json` exists. On success the response includes the contract address. No incident.
5. `POST /demo/8453/probe`  
   Payable `probe()`. Log: `incident detected`, then `evidence handed to CRE`. Sockets, in order when CRE is up: `incident:detected`, `incident:sent_to_cre`, then `incident:paused` after `ExploitBlocked`. The pause log includes `probeToPausedSec`.
6. Wait for `incident:paused`. If 90 seconds pass with no `ExploitBlocked`, the status stays `sent_to_cre` and the socket emits `incident:cre_timeout`.
7. `POST /demo/8453/strike`  
   Payable `strike(10)`. The receipt is reverted. Log: `strike reverted`. Socket: `incident:strike_reverted`.
8. `POST /demo/8453/control-withdraw`  
   User deposit, then `withdrawAll()`. Log must not contain `incident detected`.
9. `POST /demo/8453/reset`  
   Vault admin `unpause()`. Socket: `protocol:updated` status `protected`.
10. `POST /demo/8453/status`  
    Vault `paused: false`.

`CRE_MODE=simulate` runs `<CRE_BIN> workflow simulate <CRE_WORKFLOW_NAME> -R <CRE_REPO_PATH> -e <CRE_REPO_PATH>/.env -T <CRE_TARGET> --non-interactive --trigger-index 0 --http-payload <file> --broadcast` with `shell: false` and `cwd` set to `CRE_REPO_PATH`, with a 60 second kill. The payload flag is a plain file path. CLI text and the process exit are stored on the incident and are not success. Success is only Guardian `ExploitBlocked`. The incident records spawn start, process exit, and when that event is seen. `CRE_MODE=http` signs the same JSON to `CRE_HTTP_URL` or `CRE_GATEWAY_URL`.

## What a run costs

Each action returns `gasCostNative`. Expect, on top of gas:

- fund: the mixer's `denom()` leaves the funder through the mixer
- probe: `DEMO_PROBE_WEI_<chainId>` from the fresh wallet. Strike: `DEMO_STRIKE_WEI_<chainId>` and `strike(DEMO_STRIKE_REENTRIES)`
- control-withdraw: one tenth of on-chain `MockMixer.denom()` from the user, then `withdrawAll` back
- allowlist, deploy, reset: gas only, unless deploy's constructor does more than the spec says

`GET /stats` reads `vaultBalance()` and Chainlink BNB/USD (`0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE`) and ETH/USD (`0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`), cached for 60 seconds.

## Recovery

CRE timeout. Read `creRunLog` on the incident. `npm run check:cre` must pass: `CRE_BIN` is a full path, and `CRE_REPO_PATH` contains the workflow. The vault is still unpaused. Do not pause from this process.

Websocket drop. The log says `watcher reconnecting`. The cursor is the last finished block. A gap larger than 5000 blocks jumps to head. Contract logs inside a short gap are replayed with `getLogs`.

Vault left paused. `POST /demo/<chainId>/reset` from `VAULT_ADMIN_PRIVATE_KEY`. Withdrawals stay closed until that `unpause` receipt succeeds.

Fresh wallet out of gas. Do not send it a direct transfer. Fund a new wallet with `fund-fresh-wallet`, then allowlist, deploy, and probe again.

## Contract facts

Taken from the contracts repo. This process does not call `pause()` or `_processReport`.

- Guardian pause entry is `onReport`. `ReceiverTemplate` accepts that only from the forwarder, then calls `_processReport(bytes report)`. Any other caller reverts `InvalidSender`.
- The report body is `abi.encode(address vault, uint8 score, bytes32 incidentId)`.
- Pause confirmation is `ExploitBlocked(address indexed vault, uint8 score, bytes32 indexed incidentId, uint256 timestamp)`.
- `protectedVault(address)` returns `bool`. `vaultAdmin(address)` returns the registering admin. `registerVault` reverts unless the caller holds the vault's default admin role and this Guardian already holds `PAUSER_ROLE`.
- `MockMixer.deposit(bytes32 commitment)` is payable and must send `denom()`. `withdraw(bytes32 secret, address to)` pays that note. `Withdrawal(address indexed to, uint256 timestamp)` marks the fresh wallet. The commitment is `keccak256(abi.encode(secret))`.
- `Attacker.probe()` is payable and re-enters once. `strike(uint256 maxReentries)` is payable.
- `AllowlistUpdated(address indexed account, bool allowed)` is emitted once per account. `PausedBy(address indexed account)` is activity, not pause confirmation. There is no `Unpaused` event, so reset sets the local status from the `unpause` receipt.
- `vaultBalance()` is `address(this).balance`.

`deploy-attacker` still fails until `src/shared/bytecode/Attacker.json` is synced. Live `probe` sends `DEMO_PROBE_WEI_<chainId>`. Live `strike` sends `DEMO_STRIKE_WEI_<chainId>` with `DEMO_STRIKE_REENTRIES`. The mixer deposit sends on-chain `denom()`.
