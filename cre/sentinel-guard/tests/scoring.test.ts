import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNetwork } from "@chainlink/cre-sdk";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import { parseEvidence } from "../evidence";
import { incidentId } from "../incident";
import { encodeReport } from "../report";
import { scoreEvidence } from "../scoring";
import type { Evidence } from "../types";
import { buildVerdict } from "../verdict";

const root = join(import.meta.dir, "..");
const projectRoot = join(root, "..");

function load(name: string): Evidence {
  return JSON.parse(readFileSync(join(root, "fixtures", name), "utf8")) as Evidence;
}

const attackReasons = [
  { key: "reentrancyDetected", points: 30, detail: "withdrawAll() re-entered in one transaction" },
  { key: "vaultBalanceDeltaBps", points: 30, detail: "Simulated vault loss is 38%" },
  { key: "mixerFunded", points: 20, detail: "First funds came from a known mixer" },
  { key: "walletAgeSeconds", points: 16, detail: "Attacker wallet is 19 minutes old" },
];

describe("scoreEvidence", () => {
  test("attack fixtures score at least 80 and list the same reasons", () => {
    for (const name of ["attack.bsc.json", "attack.base.json"]) {
      const result = scoreEvidence(load(name));
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.score).toBe(96);
      expect(result.reasons).toEqual(attackReasons);
    }
  });

  test("a normal large withdrawal stays under 40", () => {
    const result = scoreEvidence(load("control.json"));
    expect(result.score).toBeLessThan(40);
  });

  test("a partial signal set stays under 80", () => {
    const result = scoreEvidence(load("below-threshold.json"));
    expect(result.score).toBeLessThan(80);
  });

  test("the same input scores the same way 100 times", () => {
    const evidence = load("attack.bsc.json");
    const first = scoreEvidence(evidence);
    for (let i = 0; i < 100; i++) {
      expect(scoreEvidence(evidence)).toEqual(first);
    }
  });
});

describe("parseEvidence", () => {
  test("accepts a fixture", () => {
    const logs: string[] = [];
    const evidence = parseEvidence(load("attack.bsc.json"), (message) => logs.push(message));
    expect(evidence?.chain).toBe("bsc");
    expect(logs).toHaveLength(0);
  });

  test("rejects a malformed payload and does not return evidence", () => {
    const logs: string[] = [];
    const evidence = parseEvidence({ chain: "mainnet", vault: "not-an-address" }, (message) => logs.push(message));
    expect(evidence).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.startsWith("Rejected evidence:")).toBe(true);
    expect(logs[0]).toContain("incidentId");
    expect(logs[0]).toContain("chain");
  });
});

describe("incidentId", () => {
  test("matches the contracts vector for chain 56", () => {
    const txHash = `0x${"11".repeat(32)}` as `0x${string}`;
    expect(incidentId(56, txHash)).toBe(
      "0x9240ffc6acd796b72393694832cc4d0758061fe286eb2435f31124d826f2bfef",
    );
  });
});

describe("SENTINEL_VERDICT", () => {
  test("demo evidence score is the sum of hit points and pauses", () => {
    const verdict = buildVerdict(load("attack.base.json"), 80);
    const hitPoints = verdict.rules.reduce((sum, rule) => sum + (rule.hit ? rule.points : 0), 0);
    expect(verdict.score).toBe(96);
    expect(verdict.score).toBe(hitPoints);
    expect(verdict.action).toBe("pause");
    expect(verdict.threshold).toBe(80);
    expect(JSON.stringify(verdict)).not.toContain("\n");
  });

  test("control withdrawal is rejected", () => {
    const verdict = buildVerdict(load("control.json"), 80);
    const hitPoints = verdict.rules.reduce((sum, rule) => sum + (rule.hit ? rule.points : 0), 0);
    expect(verdict.score).toBeLessThan(40);
    expect(verdict.score).toBe(hitPoints);
    expect(verdict.action).toBe("rejected");
    expect(verdict.guard).toBeUndefined();
  });
});

describe("encodeReport", () => {
  test("matches abi.encode(address, uint8, bytes32)", () => {
    const evidence = load("attack.bsc.json");
    const score = scoreEvidence(evidence).score;
    const encoded = encodeReport(evidence.vault, score, evidence.incidentId);
    const expected = encodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "bytes32" }],
      [evidence.vault, score, evidence.incidentId],
    );
    expect(encoded).toBe(expected);
    const decoded = decodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "bytes32" }],
      encoded,
    );
    expect(decoded[0].toLowerCase()).toBe(evidence.vault.toLowerCase());
    expect(decoded[1]).toBe(96);
    expect(decoded[2]).toBe(evidence.incidentId);
  });
});

describe("staging config", () => {
  test("copies guardian addresses from the deployment files", () => {
    const staging = JSON.parse(readFileSync(join(root, "config.staging.json"), "utf8"));
    const bsc = JSON.parse(readFileSync(join(projectRoot, "shared/deployments/56.json"), "utf8"));
    const base = JSON.parse(readFileSync(join(projectRoot, "shared/deployments/8453.json"), "utf8"));
    expect(staging.pauseThreshold).toBe(80);
    expect(staging.chains.bsc.chainSelectorName).toBe("binance_smart_chain-mainnet");
    expect(staging.chains.bsc.guardian).toBe(bsc.guardian);
    expect(staging.chains.base.chainSelectorName).toBe("ethereum-mainnet-base-1");
    expect(staging.chains.base.guardian).toBe(base.guardian);
  });
});

describe("chain names", () => {
  test("BNB Chain and Base mainnet resolve in the CRE SDK", () => {
    const bsc = getNetwork({
      chainFamily: "evm",
      chainSelectorName: "binance_smart_chain-mainnet",
      isTestnet: false,
    });
    const base = getNetwork({
      chainFamily: "evm",
      chainSelectorName: "ethereum-mainnet-base-1",
      isTestnet: false,
    });
    expect(bsc?.chainId).toBe("56");
    expect(base?.chainId).toBe("8453");
    expect(bsc?.chainSelector.selector).toBe(11344663589394136015n);
    expect(base?.chainSelector.selector).toBe(15971525489660198786n);
  });
});
