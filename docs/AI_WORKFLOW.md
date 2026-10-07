# How SENTINEL was built: human work, AI assistance, and verification

We used AI tools (Claude and Cursor) during this hackathon. This page records **what Ujjwal decided and built, where AI tools helped, and how every claim was checked**, so judges can tell the two apart.

**Team USquare:** Ujjwal Bajaj (CEO, USquare Newtech Pvt Ltd.)

---

## 1. Human decisions

Ujjwal Bajaj

- **The problem and the idea.** Big DeFi exploits are rehearsed: fund a fresh wallet, deploy, *test with a small probe*, then strike. That gap between test and strike is the window to act in. This comes from USquare's experience building and auditing ~100 dApps.
- **The architecture: Eyes, Brain, Hand.**
  - NOWNodes watches the chains.
  - A Chainlink CRE workflow makes the decision, so no single server holds the trigger.
  - The on-chain Guardian can **only pause**.
- **The safety model.**
  - The Guardian cannot unpause, move funds or upgrade.
  - Pausing needs a hard signal **and** at least 5% simulated loss, so a score alone can never pause.
  - Onboarding a protocol takes two transactions.
- **The scoring rules and weights:** re-entry +30, loss ≥20% +30, mixer-funded gas +20, wallet <1 h old +16, threshold 80.
- **Running it on mainnet** (BNB Chain + Base, because NOWNodes has no testnets for them), with a hard budget of about $100 for all on-chain costs.
- **The demo plan:** a live probe → pause → reverted strike on BNB Chain mainnet, plus the onboarding of a second vault ("Orivane Finance").
- **Scope and honesty calls:**
  - Hackathon mode is the CRE CLI simulation (single node) through a mock forwarder, and we say so everywhere.
  - Single-transaction drains are out of scope.
- **Every public deployment and key-handling decision:**
  - No private keys on any hosted service.
  - The public site is read-only.

## 2. Who built what

**Ujjwal built SENTINEL himself, using Claude and Cursor as assistants.** They helped with boilerplate, refactors, debugging and documentation. The design, the integration and the final code are his.

| Area | Built by | AI assistance (Claude, Cursor) | Human role |
|---|---|---|---|
| `contracts/` | **Ujjwal** | Test scaffolding, review, deploy-script help | Wrote the Guardian (`ReceiverTemplate`), VulnerableVault, Attacker and MockMixer; ran the tests; deployed to mainnet with his own keys |
| `cre/` | **Ujjwal** | Workflow boilerplate, fixtures, simulation scripts | Defined the rules and the hard guard; ran every simulation |
| `backend/` | **Ujjwal** (integration) | Module code for the watchers, detector and API; the public read-only mode; the Linux deploy fix | Integrated NOWNodes, CRE and the contracts end to end; ran it against mainnet |
| `frontend/` | **Ujjwal** | Component code, the public homepage sections | Built the dashboard, onboarding, War Room and simulator; set the UX and copy; reviewed every screen |
| Pitch | Ujjwal + Claude | Video edit (cards, subtitles, music mix), deck build script, README, narration | Recorded all screen captures; wrote and approved the script; approved every cut |
| Voice-over | ElevenLabs ("Rachel") | Narration audio from our script | Wrote the script |

**Rules we kept for the AI tools:**
- Each Cursor session edited only its own repo.
- Agents never started servers or touched `next.config.mjs`.
- Agents never saw or printed private keys.
- Every AI change came with its diff plus a typecheck or build result, and Ujjwal reviewed it before it was kept.

## 3. How we verified it (not "the AI said it works")

- **Contracts:** `forge build && forge test`. Deployed addresses and deploy transactions are in `contracts/deployments/*.json`, and you can check them on BscScan.
- **CRE:** `npm run sim:attack:bsc` scores the attack fixture **96 → PAUSE**, and `npm run sim:control` **rejects** a normal withdrawal. The live run used `cre workflow simulate … --broadcast --listen`.
- **NOWNodes:** `npm run check:nownodes` checks RPC and WSS access on both chains. `/health` on the hosted backend reports `rpc: up` for chains 56 and 8453.
- **End to end on mainnet (6 Oct 2026):**
  - Probe in block 126,072,959.
  - Pause in tx [`0x4121c62e…bb84a`](https://bscscan.com/tx/0x4121c62ed7b0d2190b425c22c836ba9eca51d6167196c8dbc851682843abb84a), block 126,073,004.
  - Strike reverted with `EnforcedPause` in tx [`0x7a38402d…07e92`](https://bscscan.com/tx/0x7a38402d4c9a12315b7a378d200b9ed619d655f90eedef452ae4833d73c07e92).
  - Probe to pause took 20.0 s, measured from block timestamps rather than our logs.
- **Claims checked against the code:** an AI-written draft of our pitch said SENTINEL used NOWNodes Blockbook and a market-data API. We checked the code, found it doesn't, and corrected the deck, video, README and submission text to what the code really does: `eth_getLogs` wallet forensics and Chainlink price feeds read through NOWNodes RPC.
- **Secret hygiene:**
  - We scanned the repo before the first push; only `.env.example` files are committed.
  - The hosted backend runs with `PUBLIC_MODE=true`, which deletes private keys from its environment at startup and returns 403 on all write and demo endpoints.

## 4. Why the Git history is short

The four parts were built in separate local folders (contracts, CRE, backend, frontend) and merged into this monorepo near submission. Every change since the merge is its own commit, with a message describing it.
