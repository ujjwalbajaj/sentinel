/**
 * Prints eth_chainId for BSC_RPC and BASE_RPC.
 * Expects 56 (BNB Chain) and 8453 (Base).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const creRoot = resolve(import.meta.dir, "..");

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

const expected: Record<string, number> = {
  BSC_RPC: 56,
  BASE_RPC: 8453,
};

const env = loadEnv(resolve(creRoot, ".env"));
let failed = false;

for (const [name, want] of Object.entries(expected)) {
  const url = env[name];
  if (!url) {
    console.error(`${name} is not set`);
    failed = true;
    continue;
  }
  const host = new URL(url).host;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  if (!response.ok) {
    console.error(`${name} host=${host} FAILED status=${response.status}`);
    failed = true;
    continue;
  }
  const body = (await response.json()) as { result?: string; error?: { message?: string } };
  if (!body.result) {
    console.error(`${name} host=${host} RPC error`);
    failed = true;
    continue;
  }
  const chainId = Number.parseInt(body.result, 16);
  console.log(`${name} host=${host} chainId=${chainId}`);
  if (chainId !== want) {
    console.error(`${name} expected chainId ${want}`);
    failed = true;
  }
}

if (failed) process.exit(1);
