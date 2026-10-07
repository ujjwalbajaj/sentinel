import { describe, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { initWorkflow, onHttpTrigger } from "./main";
import type { Config } from "./types";

const root = import.meta.dir;

function stagingConfig(requireAuth: boolean): Config {
  const config = JSON.parse(readFileSync(join(root, "config.staging.json"), "utf8")) as Config;
  config.requireAuth = requireAuth;
  config.authorizedEVMAddress = "0xb08E004bd2b5aFf1F5F950d141f449B1c05800eb";
  return config;
}

describe("onHttpTrigger", () => {
  test("logs NO_PAUSE and does not write when the score is under the threshold", () => {
    const config = stagingConfig(false);
    const runtime = newTestRuntime<Config>();
    runtime.config = config;
    const body = readFileSync(join(root, "fixtures/below-threshold.json"));
    const payload = { input: new Uint8Array(body) };

    const result = onHttpTrigger(runtime, payload);
    const parsed = JSON.parse(result) as { action: string; score: number };

    expect(parsed.action).toBe("none");
    expect(parsed.score).toBeLessThan(config.pauseThreshold);
    const logs = runtime.getLogs();
    expect(logs.some((line) => line.startsWith("SENTINEL_VERDICT "))).toBe(true);
    expect(logs).toContain("NO_PAUSE");
  });
});

describe("initWorkflow", () => {
  test("uses an open HTTP trigger when requireAuth is false", () => {
    const handlers = initWorkflow(stagingConfig(false));
    expect(handlers).toHaveLength(1);
    expect(handlers[0].trigger.config.authorizedKeys).toEqual([]);
  });

  test("requires the backend signer when requireAuth is true", () => {
    const config = stagingConfig(true);
    const handlers = initWorkflow(config);
    const keys = handlers[0].trigger.config.authorizedKeys;
    expect(keys).toHaveLength(1);
    expect(keys[0]?.publicKey).toBe(config.authorizedEVMAddress);
  });
});
