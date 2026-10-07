# SENTINEL: Chainlink CRE evidence

A CRE CLI simulation with on-chain broadcast paused a real vault on **BNB Chain mainnet** on 6 Oct 2026.

## 1. What ran
- **Workflow:** `sentinel-guard` (TypeScript → WASM, HTTP trigger). Code: [`cre/`](../cre)
- **Command (live run):**
  ```
  cre workflow simulate sentinel-guard -T staging-settings --non-interactive --trigger-index 0 \
    --http-payload sentinel-guard/fixtures/control.json --broadcast --listen
  ```
- **Flow:**
  1. Our backend sends on-chain evidence (probe trace + strike simulation via NOWNodes).
  2. CRE scores it with deterministic rules.
  3. CRE ABI-encodes the report `(vault, score, incidentId)`, signs it, and writes it through the forwarder.
  4. `Guardian.onReport` calls `vault.pause()`.

## 2. CRE execution log (`cre-listen.log`, lines 50–52, unedited)
```
[USER LOG] SENTINEL_VERDICT {"incidentId":"0x1e3daab09cf3c5d94da6aa6595456ed8e62ef0f8ce952ee79c7498324428e101","score":96,"threshold":80,"action":"pause","rules":[{"id":"reentrancy","label":"Re-entry in the probe trace","points":30,"hit":true},{"id":"loss20","label":"Simulated vault loss ≥ 20%","points":30,"hit":true},{"id":"loss5","label":"Simulated vault loss ≥ 5%","points":15,"hit":false},{"id":"mixer","label":"Gas funded via a mixer","points":20,"hit":true},{"id":"fresh","label":"Wallet under 1 hour old","points":16,"hit":true},{"id":"dayold","label":"Wallet under 1 day old","points":8,"hit":false},{"id":"flash","label":"Flash-loan entry","points":20,"hit":false},{"id":"newc","label":"Target contract < 1 h old","points":10,"hit":false}]}
[USER LOG] SENTINEL_REPORT {"reportHex":"0x00000000000000000000000082979c777506d979b365ce597c1f595251b609b300000000000000000000000000000000000000000000000000000000000000601e3daab09cf3c5d94da6aa6595456ed8e62ef0f8ce952ee79c7498324428e101"}
[USER LOG] Transaction successful: 0x4121c62ed7b0d2190b425c22c836ba9eca51d6167196c8dbc851682843abb84a
```
Reading it:
- **Verdict:** 30 + 30 + 20 + 16 = **96**, above the threshold of 80, so the action is **pause**.
- **Report:** decodes to vault `0x82979c77…609b3`, score `0x60` (96), and the same incidentId as the verdict.
- **Transaction:** the hash in the last line is the on-chain pause below.

The log stamps times as `19:35Z`, but they are really India local time (UTC+5:30), so `19:35` is **14:05 UTC**. That matches the block time of the pause transaction.

## 3. On-chain result (BNB Chain, chain ID 56)
| Step | Block | Transaction |
|---|---|---|
| Attacker probe (re-entrant test, 0.0005 BNB) | 126,072,959 | [block](https://bscscan.com/block/126072959) |
| CRE report → `Guardian.onReport` → `vault.pause()` | 126,073,004 | [0x4121c62e…bb84a](https://bscscan.com/tx/0x4121c62ed7b0d2190b425c22c836ba9eca51d6167196c8dbc851682843abb84a) (events: `Paused`, `ExploitBlocked`, score 96) |
| Attacker's real strike: **reverted, `EnforcedPause()`** | 126,073,064 | [0x7a38402d…07e92](https://bscscan.com/tx/0x7a38402d4c9a12315b7a378d200b9ed619d655f90eedef452ae4833d73c07e92) |

**Timing**, counted from the probe:

| Stage | Time after the probe |
|---|---|
| Traced | +4.2 s |
| Strike simulated | +6.2 s |
| CRE verdict | +10.6 s |
| Report signed | +12.2 s |
| **Paused on-chain** | **20.0 s** (from block timestamps) |
| Attacker's strike | 27 s after the pause |

**Simulated loss avoided:** 89% of the vault. **Lost:** 0 BNB.

## 4. Contracts (BNB Chain)
- Guardian (Chainlink `ReceiverTemplate`): `0x4Ab9F9cD8B5394Bece5b448dbebdC00E52C45748`
- Protected vault: `0x82979c777506D979B365Ce597c1F595251B609b3`
- Forwarder (mock, hackathon): `0x6f3239bbB26e98961e1115aBa83f8a282e5508C8`
- Also deployed on Base (chain ID 8453); see `contracts/deployments/8453.json`.

## 5. Reproduce it
```
cd cre && npm run sim:attack:bsc   # attack fixture → score 96 → PAUSE
cd cre && npm run sim:control      # normal withdrawal → rejected (no pause)
```

## 6. Video and live site
- Demo, recorded live, showing the CRE terminal, War Room and BscScan: https://drive.google.com/file/d/1MaewP4XTpBDA78kOE4kt85nXGQ5llXms/view?usp=sharing
- Live site: https://www.sentinel-defi.xyz

## 7. Scope
- **Today:** CRE CLI simulation (single node) with `--broadcast`, through a **mock forwarder**.
- **Production:** the same workflow deployed to a Chainlink **DON**, with the KeystoneForwarder and `setExpectedWorkflowId`.
- The contracts and workflow code stay the same; only configuration changes.
