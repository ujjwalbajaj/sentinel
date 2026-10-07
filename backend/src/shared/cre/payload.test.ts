import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../db/client.js";
import { parseCreSimulation, simulateCre } from "../cre-client.js";
import { creEvidenceSchema, crePayload } from "./evidence.js";

const INCIDENT = "0x9990e3c480f2e06d231b3e388f1bb16ac59fbe6313849eee172d1a5d4d4b43c0";

test("parser reads a double-encoded CRE simulation result", () => {
  const log = [
    "✓ Workflow Simulation Result:",
    '"{\\"incidentId\\":\\"0x' + "ab".repeat(32) + '\\",\\"score\\":96,\\"action\\":\\"pause\\",\\"txHash\\":\\"0x' + "11".repeat(32) + '\\"}"',
    "[exit 0]",
  ].join("\n");
  const parsed = parseCreSimulation(log);
  assert.equal(parsed.action, "pause");
  assert.equal(parsed.score, 96);
  assert.equal(parsed.txHash, `0x${"11".repeat(32)}`);
});

test("stored probe payload matches the CRE schema and dry-runs as pause 96", async () => {
  const row = await prisma.incident.findUnique({
    where: { id: INCIDENT },
    include: { protocol: true },
  });
  assert.ok(row, "stored incident missing");
  const stored = row.features as {
    walletAgeSeconds: number;
    mixerFunded: boolean;
    reentrancyDetected: boolean;
    vaultBalanceDeltaBps: number;
    flashLoanEntry: boolean;
    newContractTarget: boolean;
  };
  const payload = crePayload({
    incidentId: row.id,
    chainId: row.chainId,
    vault: row.protocol.vaultAddress,
    suspectTxHash: row.suspectTxHash,
    attacker: row.attacker,
    features: stored,
  });
  assert.equal(payload.features.walletAgeSeconds, 412);
  assert.equal(creEvidenceSchema.safeParse(payload).success, true);
  assert.deepEqual(Object.keys(payload).sort(), ["attacker", "chain", "features", "incidentId", "suspectTxHash", "vault"]);
  console.log(JSON.stringify(payload));

  const run = await simulateCre(payload, { broadcast: false, timeoutMs: 120_000 });
  const parsed = parseCreSimulation(run.log);
  assert.equal(run.exitCode, 0, `exit ${run.exitCode} action ${parsed.action ?? "missing"} score ${parsed.score ?? "missing"}`);
  assert.equal(parsed.score, 96);
  assert.equal(parsed.action, "pause");
  console.log(JSON.stringify({ exitCode: run.exitCode, score: parsed.score, action: parsed.action, txHash: parsed.txHash }));
});

test.after(async () => {
  await prisma.$disconnect();
});
