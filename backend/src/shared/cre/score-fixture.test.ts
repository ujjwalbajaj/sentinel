import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { env } from "../../config/env.js";
import { scoreEvidence } from "./scoring.js";
import type { Evidence } from "./types.js";

function fixturePath(): string {
  const candidates = [
    join(env.CRE_REPO_PATH, "fixtures", "attack.base.json"),
    join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME, "fixtures", "attack.base.json"),
  ];
  const found = candidates.find((file) => existsSync(file));
  if (!found) {
    throw new Error(`attack.base.json was not found.\n${candidates.join("\n")}`);
  }
  return found;
}

function bunBin(): string {
  const installed = join(homedir(), ".bun", "bin", "bun.exe");
  if (existsSync(installed)) return installed;
  return "bun";
}

function runBunTest(cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bunBin(), ["test", "tests/scoring.test.ts"], {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`bun test timed out\n${output}`));
    }, 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

test("65% simulated loss with reentrancy, mixer funding, and a young wallet scores 96", () => {
  const loss = 1_500_000_000_000_000n;
  const vault = 2_300_000_000_000_000n;
  const deltaBps = Number((loss * 10_000n) / vault);
  const scored = scoreEvidence({
    incidentId: `0x${"ab".repeat(32)}`,
    chain: "base",
    vault: `0x${"11".repeat(20)}`,
    suspectTxHash: `0x${"22".repeat(32)}`,
    attacker: `0x${"33".repeat(20)}`,
    features: {
      walletAgeSeconds: 19 * 60,
      mixerFunded: true,
      reentrancyDetected: true,
      vaultBalanceDeltaBps: deltaBps,
      flashLoanEntry: false,
      newContractTarget: false,
    },
  }).score;
  assert.equal(deltaBps, 6521);
  assert.equal(scored, 96);
});

test("attack.base.json scores 96 in the backend and in bun test", async () => {
  const file = fixturePath();
  const evidence = JSON.parse(readFileSync(file, "utf8")) as Evidence;
  const backend = scoreEvidence(evidence).score;
  assert.equal(backend, 96);

  const workflow = join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME);
  const bun = await runBunTest(workflow);
  assert.equal(bun.code, 0, bun.output);
  assert.match(bun.output, /\(pass\) scoreEvidence > attack fixtures score at least 80 and list the same reasons/);
});
