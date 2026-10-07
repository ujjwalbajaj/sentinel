import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { env } from "../config/env.js";
import { simulateArgs, spawnCre } from "./cre-client.js";

test("cre version exits 0 when cwd contains spaces", async () => {
  const cwd = join(tmpdir(), "sentinel cre cwd");
  await mkdir(cwd, { recursive: true });
  try {
    const result = await spawnCre(["version"], { cwd, timeoutMs: 20_000 });
    assert.equal(result.code, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("control fixture dry-run exits 0 with score under 40", async () => {
  const candidates = [
    join(env.CRE_REPO_PATH, "fixtures", "control.json"),
    join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME, "fixtures", "control.json"),
  ];
  const fixture = candidates.find((file) => existsSync(file));
  assert.ok(fixture, "control.json was not found");
  const live = simulateArgs(fixture, true);
  assert.deepEqual(live, [
    "workflow",
    "simulate",
    env.CRE_WORKFLOW_NAME,
    "-R",
    env.CRE_REPO_PATH,
    "-e",
    join(env.CRE_REPO_PATH, ".env"),
    "-T",
    env.CRE_TARGET,
    "--non-interactive",
    "--trigger-index",
    "0",
    "--http-payload",
    fixture,
    "--broadcast",
  ]);
  assert.equal(live.some((arg) => arg.startsWith("@")), false);
  const result = await spawnCre(simulateArgs(fixture, false), { cwd: env.CRE_REPO_PATH, timeoutMs: 180_000 });
  const scores = [...result.output.matchAll(/score[=: ]+(\d+)/gi)].map((match) => Number(match[1]));
  const score = scores.at(-1);
  assert.equal(result.code, 0, `exit ${result.code}, score ${score ?? "missing"}`);
  assert.ok(score !== undefined && score < 40, `score ${score ?? "missing"}`);
});
