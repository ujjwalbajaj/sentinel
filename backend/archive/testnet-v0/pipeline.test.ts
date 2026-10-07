import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decodeAbiParameters, encodeFunctionResult, recoverMessageAddress, toFunctionSelector, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { extractSelectors, hasFlashLoan, type CallFrame } from "./analyze.js";
import { CHAINS } from "./chains.js";
import { canonicalJson } from "./canonical.js";
import { signWorkflowRequest } from "./creTrigger.js";
import { Desk } from "./desk.js";
import { playIncident } from "./demo.js";
import { buildHeroObservation } from "./hero.js";
import { encodePauseReport, pauseReportTypes } from "./pause.js";
import { loadRulebook } from "./rulebook.js";
import { start } from "./server.js";
import { assess } from "../cre/sentinel-workflow/score.js";
import { coveredAbi, decodeCovered } from "./subscription.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rulebook = loadRulebook();

test("the VaultX test call scores 96 and asks for a pause", () => {
  const observation = buildHeroObservation(CHAINS[0], rulebook);
  assert.equal(observation.reentrancy, true);
  assert.equal(observation.vaultBalanceDropBps, 3800);
  assert.equal(observation.fundedByMixer, true);
  assert.equal(observation.testSizedCall, true);

  const verdict = assess(observation, rulebook);
  assert.equal(verdict.probability, 96);
  assert.equal(verdict.pause, true);
  assert.match(
    verdict.explanation,
    /^This contract can drain 38% of the vault \(\$14\.2M\) in one transaction\. Attack probability: 96%\./,
  );
  assert.match(verdict.explanation, /19 minutes ago/);
  assert.match(verdict.explanation, /mixer/);
});

test("a normal withdrawal and a large honest withdrawal stay under the pause line", () => {
  const calm = assess(
    {
      protocolName: "VaultX",
      vaultTvlUsd: 1_000_000,
      walletAgeSeconds: 86_400 * 400,
      deployerNonce: 900,
      fundedByMixer: false,
      flashLoanEntry: false,
      reentrancy: false,
      vaultBalanceDropBps: 50,
      testSizedCall: false,
    },
    rulebook,
  );
  assert.equal(calm.probability, 0);
  assert.equal(calm.pause, false);

  const whale = assess(
    {
      protocolName: "VaultX",
      vaultTvlUsd: 1_000_000,
      walletAgeSeconds: 86_400 * 400,
      deployerNonce: 900,
      fundedByMixer: false,
      flashLoanEntry: false,
      reentrancy: false,
      vaultBalanceDropBps: 1500,
      testSizedCall: false,
    },
    rulebook,
  );
  assert.equal(whale.probability, 21);
  assert.equal(whale.pause, false);
});

test("flash-loan entry is visible in a call trace", () => {
  const selector = toFunctionSelector("flashLoan(address,address,uint256,bytes)");
  const trace: CallFrame = {
    type: "CALL",
    from: "0x3333333333333333333333333333333333333333",
    to: "0x2222222222222222222222222222222222222222",
    input: selector,
  };
  assert.equal(hasFlashLoan(trace), true);
  assert.deepEqual(extractSelectors(`0x63${selector.slice(2)}1463${selector.slice(2)}` as Hex)[0], selector);
});

test("pause calldata matches the guardian report layout", () => {
  const observation = buildHeroObservation(CHAINS[1], rulebook);
  const encoded = encodePauseReport(observation.vault, 96, observation.alertId);
  const decoded = decodeAbiParameters(pauseReportTypes, encoded);
  assert.equal(decoded[0].toLowerCase(), observation.vault);
  assert.equal(decoded[1], 96);
  assert.equal(decoded[2], observation.alertId);
});

test("CRE trigger JWTs are signed by the authorized key", async () => {
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
  const signed = await signWorkflowRequest(privateKey, { vault: "0x1111111111111111111111111111111111111111" }, "abc123");
  assert.equal(canonicalJson({ b: 1, a: { d: true, c: [1, 2] } }), '{"a":{"c":[1,2],"d":true},"b":1}');
  const recovered = await recoverMessageAddress({ message: signed.message, signature: signed.signature });
  assert.equal(recovered, privateKeyToAccount(privateKey).address);
  assert.equal(signed.token.split(".").length, 3);
  const payload = JSON.parse(Buffer.from(signed.token.split(".")[1], "base64url").toString());
  assert.equal(payload.digest, signed.digest);
  assert.equal(payload.iss.toLowerCase(), recovered.toLowerCase());
});

test("the production workflow does not bundle the scoring document", () => {
  const main = readFileSync(join(root, "cre/sentinel-workflow/main.ts"), "utf8");
  const submit = readFileSync(join(root, "cre/sentinel-workflow/submitPause.ts"), "utf8");
  const bundled = `${main}\n${submit}`;
  assert.equal(bundled.includes("score.js"), false);
  assert.equal(bundled.includes("pauseThreshold"), false);
  assert.equal(bundled.includes("reentrancy"), false);
  assert.equal(bundled.includes("3800"), false);
  assert.match(main, /ConfidentialHTTPClient/);
  assert.match(main, /scoringDocument/);
});

test("staging config carries the same rulebook the engine runs", () => {
  const staging = JSON.parse(readFileSync(join(root, "cre/sentinel-workflow/config.staging.json"), "utf8"));
  const book = JSON.parse(readFileSync(join(root, "cre/sentinel-workflow/rulebook.json"), "utf8"));
  assert.deepEqual(staging.rulebook, book);
});

test("the tabletop incident pauses BNB Chain and Base before the strike", async () => {
  const desk = new Desk();
  await playIncident(desk, rulebook, 0);
  const events = desk.snapshot().events;
  assert.equal(events.length, 6);
  assert.equal(events[0].chainLabel, "BNB Chain");
  assert.equal(events[0].kind, "simulation");
  assert.match(events[0].body, /Attack probability: 96%/);
  assert.equal(events[1].clock, "11:38:41 PM");
  assert.equal(events[1].kind, "pause");
  assert.match(events[1].calldata ?? "", /^0x/);
  assert.equal(events[2].clock, "11:42:15 PM");
  assert.match(events[2].body, /Nothing left the vault/);
  assert.equal(events[3].chainLabel, "Base");
  assert.equal(events[5].kind, "reverted");
});

test("the desk serves the incident over HTTP", async () => {
  process.env.PORT = "0";
  process.env.DEMO_SPEED_MS = "0";
  const server = await start("demo");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal((await health.json()).ok, true);
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/state`);
      const state = (await response.json()) as { events: Array<{ explanation?: string; chainLabel: string }> };
      return state.events.filter((event) => event.explanation?.includes("96%")).length >= 2;
    });
    const missing = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(missing.status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a coverage word decodes to the registry's boolean", () => {
  const yes = encodeFunctionResult({ abi: coveredAbi, functionName: "covered", result: true });
  const no = encodeFunctionResult({ abi: coveredAbi, functionName: "covered", result: false });
  assert.equal(decodeCovered(yes), true);
  assert.equal(decodeCovered(no), false);
  assert.equal(decodeCovered("0x"), false);
});

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the desk");
}
