# SENTINEL — Smart Contracts repo: Cursor prompts

Paste **one prompt at a time** into Cursor (Agent mode). Run the check at the end of each step before moving on.
Save this file in the repo as `docs/CURSOR_PROMPTS.md`, so you can reference it with `@CURSOR_PROMPTS.md`.

---

## The demo this repo must support (context for every prompt)

> Paste this block as the FIRST message in the Cursor chat, and keep it pinned.

```
PROJECT CONTEXT — SENTINEL (hackathon, 36h)
SENTINEL is a real-time exploit shield. A watcher backend spots an attacker's small "test" call,
simulates it with debug_traceCall, sends evidence to a Chainlink CRE workflow, and the workflow
writes a signed report on-chain to our Guardian contract, which pauses the victim vault BEFORE the
attacker's real strike. The strike then reverts.

This repo = Foundry project with the Solidity contracts only.
Chains: BNB Chain Testnet (chainId 97) and Base Sepolia (chainId 84532).

DEMO STORY (one scenario, must work end to end):
1. A protocol team signs up on our frontend and connects their admin wallet.
2. Onboarding: they register VaultX with SENTINEL -> admin calls vault.grantRole(PAUSER_ROLE, guardian)
   and guardian.registerVault(vault). Now SENTINEL can pause VaultX (pause only, never unpause).
3. Normal users deposit into VaultX.
4. Attacker: gets gas from MockMixer into a fresh wallet -> deploys Attacker.sol -> calls probe()
   (small re-entrant test).
5. Backend + CRE detect it -> Guardian.pause(VaultX) via CRE report.
6. Attacker calls strike() -> reverts with EnforcedPause(). Vault balance unchanged.
7. Control case: a normal user's large withdrawAll() is NOT paused.
8. Team unpauses via admin wallet (UNPAUSER_ROLE) to reset the demo.

RULES
- Solidity ^0.8.26, Foundry, OpenZeppelin Contracts v5.
- Guardian must NEVER be able to unpause, move funds, or upgrade anything.
- Every contract has NatSpec, custom errors, and events the backend can index.
- VulnerableVault is deliberately vulnerable (reentrancy). Mark it clearly: "// DEMO ONLY — INTENTIONALLY VULNERABLE".
- No private keys in code. Read from .env via vm.envUint / vm.envAddress.
```

---

## Step 1 — Boilerplate

```
Set up this folder as a Foundry project for SENTINEL.

1. forge init --no-commit (keep the folder, remove the default Counter files).
2. Install deps:
   - forge install OpenZeppelin/openzeppelin-contracts --no-commit
   - forge install foundry-rs/forge-std --no-commit
3. remappings.txt:
   @openzeppelin/=lib/openzeppelin-contracts/
   forge-std/=lib/forge-std/src/
4. foundry.toml:
   - solc = "0.8.26", optimizer = true, optimizer_runs = 200, via_ir = false
   - [rpc_endpoints] bsc_testnet = "${BSC_TESTNET_RPC}", base_sepolia = "${BASE_SEPOLIA_RPC}"
   - [etherscan] bsc_testnet = { key = "${BSCSCAN_API_KEY}", chain = 97 },
                 base_sepolia = { key = "${BASESCAN_API_KEY}", chain = 84532 }
   - fs_permissions = [{ access = "read-write", path = "./deployments" }, { access = "read", path = "./" }]
5. Folder layout:
   src/            VulnerableVault.sol, Guardian.sol, Attacker.sol, MockMixer.sol, chainlink/ReceiverTemplate.sol (placeholder for step 3)
   src/interfaces/ IGuardedVault.sol
   test/
   script/
   deployments/    (JSON output per chain, committed)
   abi/            (exported ABIs, committed)
6. .env.example with: DEPLOYER_PRIVATE_KEY, VAULT_ADMIN_PRIVATE_KEY, ATTACKER_PRIVATE_KEY,
   USER_PRIVATE_KEY, BSC_TESTNET_RPC, BASE_SEPOLIA_RPC, BSCSCAN_API_KEY, BASESCAN_API_KEY,
   CRE_FORWARDER_BSC_TESTNET, CRE_FORWARDER_BASE_SEPOLIA, PAUSE_THRESHOLD=80
7. .gitignore: .env, out/, cache/, broadcast/*/dry-run
8. README.md skeleton with sections: What this is, Contracts, Deploy, Deployed addresses, Demo script.

Run forge build and make sure it compiles (empty contracts are fine for now).
```

**Check:** `forge build` passes.

---

## Step 2 — VulnerableVault.sol (the victim)

```
Write src/VulnerableVault.sol and src/interfaces/IGuardedVault.sol.

IGuardedVault: function pause() external; function paused() external view returns (bool);
               function PAUSER_ROLE() external view returns (bytes32);

VulnerableVault — DEMO ONLY, INTENTIONALLY VULNERABLE:
- Inherits OZ AccessControl and Pausable (OZ v5: @openzeppelin/contracts/utils/Pausable.sol).
- Roles: DEFAULT_ADMIN_ROLE (vault admin), PAUSER_ROLE (will be granted to Guardian),
  UNPAUSER_ROLE (vault admin only). Constructor(address admin) grants admin DEFAULT_ADMIN_ROLE + UNPAUSER_ROLE.
- mapping(address => uint256) public balances; uint256 public totalDeposits;
- deposit() external payable whenNotPaused — adds to balances and totalDeposits. Emits Deposited(user, amount).
- withdrawAll() external whenNotPaused — THE BUG:
      uint256 bal = balances[msg.sender];
      if (bal == 0) revert NothingToWithdraw();
      (bool ok, ) = msg.sender.call{value: bal}("");   // external call BEFORE state update
      if (!ok) revert TransferFailed();
      balances[msg.sender] = 0;                         // state update AFTER (reentrancy)
      totalDeposits -= bal;  <-- DO NOT do this (would underflow on re-entry and revert the whole attack).
      Instead: track totalDeposits only on deposit, and expose vaultBalance() = address(this).balance.
  IMPORTANT: use "set to 0" (not "-= bal"), otherwise Solidity 0.8 checked math underflows and the
  exploit reverts by itself, which ruins the demo.
  Emits Withdrawn(user, amount).
- pause() external onlyRole(PAUSER_ROLE) -> _pause(); emits PausedBy(msg.sender) in addition to OZ Paused.
- unpause() external onlyRole(UNPAUSER_ROLE) -> _unpause().
- vaultBalance() view returns address(this).balance.
- receive() reverts (only deposit() adds funds) — EXCEPT allow the admin to seed via deposit().

Add NatSpec on every function explaining the bug in plain English.
```

---

## Step 3 — Chainlink ReceiverTemplate + Guardian.sol (the shield)

```
Part A — ReceiverTemplate
Chainlink CRE consumer contracts inherit ReceiverTemplate. Get the OFFICIAL file:
- Docs: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts
- Copy ReceiverTemplate.sol (and IReceiver / any interfaces it imports) VERBATIM from the official
  Chainlink source linked on that page into src/chainlink/. Keep the license header.
- Do NOT invent or rewrite this file. If you cannot access it, STOP and tell me; I will paste it.
Known shape (verify against the real file):
  constructor(address _forwarderAddress)
  function _processReport(bytes calldata report) internal virtual;   // we override this
  setExpectedWorkflowId(bytes32), setExpectedAuthor(address), setExpectedWorkflowName(string) — owner only

Part B — Guardian.sol
contract Guardian is ReceiverTemplate
- State:
    mapping(address => bool) public protectedVault;
    mapping(address => address) public vaultAdmin;         // who registered it
    uint8 public pauseThreshold;                            // default 80, set in constructor
    mapping(bytes32 => bool) public incidentHandled;        // replay protection
- constructor(address forwarder, uint8 threshold) ReceiverTemplate(forwarder)
- registerVault(address vault) external:
    require IAccessControl(vault).hasRole(DEFAULT_ADMIN_ROLE, msg.sender)  -> else revert NotVaultAdmin()
    require IAccessControl(vault).hasRole(IGuardedVault(vault).PAUSER_ROLE(), address(this)) -> else revert PauserRoleMissing()
    protectedVault[vault] = true; vaultAdmin[vault] = msg.sender; emit VaultRegistered(vault, msg.sender)
  (This is what the frontend onboarding calls after the grantRole tx.)
- unregisterVault(address vault) external — only vaultAdmin[vault]. emit VaultUnregistered.
- _processReport(bytes calldata report) internal override:
    (address vault, uint8 score, bytes32 incidentId) = abi.decode(report, (address, uint8, bytes32));
    if (!protectedVault[vault]) revert VaultNotProtected(vault);
    if (incidentHandled[incidentId]) revert IncidentAlreadyHandled(incidentId);
    if (score < pauseThreshold) revert ScoreBelowThreshold(score, pauseThreshold);
    incidentHandled[incidentId] = true;
    if (!IGuardedVault(vault).paused()) IGuardedVault(vault).pause();
    emit ExploitBlocked(vault, score, incidentId, block.timestamp);
- setPauseThreshold(uint8) — owner only, must be 50..100.
- NO unpause function. NO function that sends ETH/tokens. Add a comment block at the top stating this.

REPORT ENCODING IS A SHARED CONTRACT WITH THE CRE WORKFLOW:
  abi.encode(address vault, uint8 score, bytes32 incidentId)
Write it into docs/REPORT_FORMAT.md too.
```

---

## Step 4 — Attacker.sol + MockMixer.sol (the villain)

```
Write src/MockMixer.sol:
- Fixed denomination DENOM = 0.05 ether (constructor param, so tBNB and Base ETH can differ).
- deposit(bytes32 commitment) payable — requires msg.value == DENOM, stores commitment. Emits Deposit(commitment).
- withdraw(bytes32 secret, address payable to) — requires keccak256(abi.encode(secret)) is a stored,
  unspent commitment; marks spent; sends DENOM to `to`. Emits Withdrawal(to).
- It is a DEMO mock: no zk, just "link broken between depositor and receiver" for the story.
  The backend's "mixer-sourced gas" signal = fresh wallet whose first incoming funds came from this contract.

Write src/Attacker.sol:
- constructor(address vault) stores target; owner = msg.sender.
- uint256 public reentriesLeft;
- probe() external payable onlyOwner:
    requires msg.value small (e.g. <= 0.01 ether).
    reentriesLeft = 1; vault.deposit{value: msg.value}(); vault.withdrawAll();
    -> takes 2x its deposit. This is the "test call" SENTINEL catches. Emits Probed(gained).
- strike(uint256 maxReentries) external payable onlyOwner:
    reentriesLeft = maxReentries; deposit; withdrawAll(); emits Struck(gained).
- receive() external payable:
    if (reentriesLeft > 0 && address(vault).balance >= lastDeposit) { reentriesLeft--; vault.withdrawAll(); }
- sweep() onlyOwner sends all ETH back to owner.
Keep it readable: judges will open this file.
```

---

## Step 5 — Tests (prove the story in code)

```
Write Foundry tests in test/Sentinel.t.sol. Use a MockForwarder in test/mocks/ that simply calls
guardian.onReport(metadata, report) so we can simulate CRE delivery (check the real IReceiver
signature in src/chainlink and match it). Set up: admin, user1, user2, attacker, forwarder.

Tests (each with a clear name):
1. test_Deposit_And_WithdrawAll_Work_ForNormalUser
2. test_Exploit_Drains_Vault_WhenNotPaused      — strike(10) takes much more than deposited
3. test_Probe_Takes_Twice_Deposit                 — shows the small test pattern
4. test_Onboarding_RegisterVault_RequiresAdmin_And_PauserRole
5. test_Guardian_Pauses_On_HighScore_Report
6. test_Strike_Reverts_After_Pause                — expectRevert(Pausable.EnforcedPause.selector); vault balance unchanged
7. test_LowScore_Report_Reverts_NoPause
8. test_Report_For_Unregistered_Vault_Reverts
9. test_Replay_Same_IncidentId_Reverts
10. test_Only_Forwarder_Can_Call_OnReport          — random caller reverts
11. test_Guardian_Cannot_Unpause                   — Guardian has no unpause path; admin can unpause
12. test_Control_Case_Normal_LargeWithdraw_Not_Affected
13. test_Full_Demo_Story                           — probe -> report -> pause -> strike reverts -> admin unpause

Run forge test -vvv and fix until all pass. Also add forge coverage to README.
```

**Check:** `forge test -vvv` all green.

---

## Step 6 — Deploy scripts + address export

```
Write script/Deploy.s.sol:
- Reads DEPLOYER_PRIVATE_KEY, VAULT_ADMIN_PRIVATE_KEY, forwarder address for the current chain
  (CRE_FORWARDER_BSC_TESTNET if block.chainid == 97, CRE_FORWARDER_BASE_SEPOLIA if 84532), PAUSE_THRESHOLD.
- Deploys: VulnerableVault(admin), Guardian(forwarder, threshold), MockMixer(denom).
- Does NOT grant roles or register — that's the onboarding step the frontend demos.
- Writes deployments/<chainId>.json:
  { "chainId", "chainName", "vault", "guardian", "mixer", "forwarder", "vaultAdmin", "deployBlock", "timestamp" }
  using vm.serializeAddress / vm.writeJson.

Write script/Onboard.s.sol (fallback if the frontend onboarding fails on stage):
- As vault admin: vault.grantRole(PAUSER_ROLE, guardian); guardian.registerVault(vault).

Write script/SeedVault.s.sol: admin + user wallet deposit so the vault has visible TVL.

Write script/Reset.s.sol: admin unpauses; re-seed if needed.

Write a Makefile / package.json scripts:
  deploy-bsc, deploy-base, onboard-bsc, onboard-base, seed-bsc, seed-base, reset-bsc, reset-base,
  verify-bsc, verify-base, export-abi
export-abi: for each of VulnerableVault, Guardian, Attacker, MockMixer, write abi/<Name>.json
  (jq '.abi' out/<Name>.sol/<Name>.json).
Deploy commands use: forge script ... --rpc-url bsc_testnet --broadcast --verify
```

**Check:** deploy to both testnets, open the verified contracts on BscScan / BaseScan.

---

## Step 7 — Forwarder addresses (do not skip)

```
Add docs/FORWARDERS.md explaining:
- For `cre workflow simulate --broadcast`, the Guardian must use the MOCK forwarder for that chain.
- For a deployed CRE workflow, the Guardian must use the REAL KeystoneForwarder.
- Source of truth: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
  (copy the current addresses for "BNB Chain Testnet" and "Base Sepolia", both mock and real).
- Because the forwarder is fixed in the constructor, switching = redeploy Guardian + re-run Onboard.
  Add script/RedeployGuardian.s.sol that deploys a new Guardian with a given forwarder and updates
  deployments/<chainId>.json.
- After the CRE workflow is deployed, call guardian.setExpectedWorkflowId(<id>) (and author) so only
  OUR workflow can pause. Add script/LockWorkflow.s.sol for that.
```

---

## Step 8 — Hand-off to other repos

```
1. Copy abi/*.json and deployments/*.json into the backend, frontend and CRE repos
   (add a script: `make sync` that copies to ../sentinel-backend/src/shared, ../sentinel-frontend/src/shared,
   ../sentinel-cre/shared — paths configurable in .env).
2. Finish README: architecture diagram (ASCII), contract table with explorer links for both chains,
   "Guardian can only pause" security notes, test results, how to run the demo scripts.
```

---

## Demo-day order for this repo

1. `make deploy-bsc deploy-base` → `make seed-bsc seed-base`
2. Frontend onboarding does grantRole + registerVault (fallback: `make onboard-bsc`)
3. Backend demo console runs mixer → deploy Attacker → probe → (CRE pauses) → strike reverts
4. `make reset-bsc` between runs
