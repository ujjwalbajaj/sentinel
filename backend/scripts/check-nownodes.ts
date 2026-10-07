/**
 * NOWNodes mainnet gate. Reads BSC_RPC/BSC_WSS and BASE_RPC/BASE_WSS.
 * The API key stays in NOWNODES_API_KEY (header, and WSS path when the URL has no key).
 * Exits 1 if any debug_* call fails.
 */
import { config as loadEnv } from "dotenv";
import WebSocket from "ws";

const parsed = loadEnv().parsed ?? {};
if (!process.env.NOWNODES_API_KEY?.trim() && parsed.NOWNODES_API_KEY) {
  process.env.NOWNODES_API_KEY = parsed.NOWNODES_API_KEY;
}

type Row = { chain: string; check: string; result: "PASS" | "FAIL"; detail: string };

const rows: Row[] = [];
const key = process.env.NOWNODES_API_KEY?.trim();
if (!key) {
  console.error("NOWNODES_API_KEY is empty.");
  process.exit(1);
}

const chains = [
  {
    name: "BSC",
    expectId: 56,
    rpc: process.env.BSC_RPC?.trim() || "https://bsc.nownodes.io",
    wss: process.env.BSC_WSS?.trim() || "wss://bsc.nownodes.io/wss",
    token: "0x55d398326f99059fF775485246999027B3197955",
    holder: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
  },
  {
    name: "BASE",
    expectId: 8453,
    rpc: process.env.BASE_RPC?.trim() || "https://base.nownodes.io",
    wss: process.env.BASE_WSS?.trim() || "wss://base.nownodes.io/wss",
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    holder: "0x4200000000000000000000000000000000000006",
  },
] as const;

function withKey(url: string): string {
  if (url.includes(key!)) return url;
  return url.endsWith("/") ? `${url}${key}` : `${url}/${key}`;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": key! },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  let payload: { result?: T; error?: { code?: number; message?: string; data?: unknown } };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new Error(`${method} HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  if (payload.error) {
    const data = payload.error.data ? ` data=${JSON.stringify(payload.error.data).slice(0, 500)}` : "";
    throw new Error(`${method} [${payload.error.code ?? "?"}] ${payload.error.message ?? "RPC error"}${data}`);
  }
  if (!response.ok) {
    throw new Error(`${method} HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return payload.result as T;
}

function record(chain: string, check: string, ok: boolean, detail: string): void {
  rows.push({ chain, check, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${chain}  ${check}  ${detail}`);
}

function selectorOf(input: string | undefined): string {
  if (!input || input === "0x") return "0x";
  return input.slice(0, 10);
}

function walkDepth(node: { calls?: unknown[] } | undefined, depth = 1): number {
  if (!node) return 0;
  const children = Array.isArray(node.calls) ? node.calls : [];
  let max = depth;
  for (const child of children) {
    max = Math.max(max, walkDepth(child as { calls?: unknown[] }, depth + 1));
  }
  return max;
}

async function subscribeHeads(wss: string, count: number): Promise<string[]> {
  const url = withKey(wss);
  const heads: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { "api-key": key! } });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`websocket timed out after 40s with ${heads.length}/${count} heads`));
    }, 40_000);
    let subId = "";
    socket.on("open", () => {
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
    });
    socket.on("message", (data) => {
      let message: {
        id?: number;
        result?: string;
        error?: { message?: string };
        params?: { subscription?: string; result?: { number?: string } };
      };
      try {
        message = JSON.parse(data.toString()) as typeof message;
      } catch (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
        return;
      }
      if (message.error) {
        clearTimeout(timer);
        socket.close();
        reject(new Error(message.error.message ?? "websocket error"));
        return;
      }
      if (message.id === 1 && typeof message.result === "string") {
        subId = message.result;
        return;
      }
      const number = message.params?.result?.number;
      if (!number) return;
      heads.push(number);
      console.log(`  head ${heads.length}/${count}  ${number} (${BigInt(number)})`);
      if (heads.length >= count) {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_unsubscribe", params: [subId] }));
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("close", () => {
      if (heads.length < count) {
        clearTimeout(timer);
        reject(new Error(`websocket closed after ${heads.length}/${count} heads`));
      }
    });
  });
  return heads;
}

function balanceOfData(holder: string): string {
  return `0x70a08231${holder.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

async function checkChain(chain: (typeof chains)[number]): Promise<boolean> {
  const rpcUrl = chain.rpc;
  console.log(`\n== ${chain.name} ${rpcUrl} ==`);
  let debugFailed = false;

  try {
    const chainId = await rpc<string>(rpcUrl, "eth_chainId", []);
    const id = Number(BigInt(chainId));
    record(chain.name, "eth_chainId", id === chain.expectId, `got ${id}, expect ${chain.expectId}`);
  } catch (error) {
    record(chain.name, "eth_chainId", false, error instanceof Error ? error.message : String(error));
  }

  let blockNumber = 0n;
  try {
    const hex = await rpc<string>(rpcUrl, "eth_blockNumber", []);
    blockNumber = BigInt(hex);
    record(chain.name, "eth_blockNumber", blockNumber > 0n, hex);
  } catch (error) {
    record(chain.name, "eth_blockNumber", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const heads = await subscribeHeads(chain.wss, 3);
    record(chain.name, "wss newHeads x3", heads.length === 3, heads.join(", "));
  } catch (error) {
    record(chain.name, "wss newHeads x3", false, error instanceof Error ? error.message : String(error));
  }

  let txHash = "";
  try {
    for (let back = 0n; back < 8n && !txHash; back++) {
      const block = await rpc<{ transactions?: Array<{ hash: string; to: string | null; input?: string }> }>(
        rpcUrl,
        "eth_getBlockByNumber",
        [`0x${(blockNumber - back).toString(16)}`, true],
      );
      const tx = (block.transactions ?? []).find((item) => item.to && item.input && item.input !== "0x");
      if (tx) txHash = tx.hash;
    }
    if (!txHash) throw new Error("no recent contract call in the last 8 blocks");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(chain.name, "debug_traceTransaction", false, message);
    console.error(`\nSTOP ${chain.name} debug_traceTransaction: ${message}`);
    return true;
  }

  try {
    const trace = await rpc<{ type?: string; from?: string; to?: string; input?: string; calls?: unknown[] }>(
      rpcUrl,
      "debug_traceTransaction",
      [txHash, { tracer: "callTracer" }],
    );
    const depth = walkDepth(trace);
    record(
      chain.name,
      "debug_traceTransaction",
      Boolean(trace && (trace.to || trace.type)),
      `tx ${txHash} top ${trace.type ?? "?"} ${trace.from ?? "?"} -> ${trace.to ?? "?"} ${selectorOf(trace.input)} depth ${depth}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(chain.name, "debug_traceTransaction", false, message);
    console.error(`\nSTOP ${chain.name} debug_traceTransaction: ${message}`);
    debugFailed = true;
    return true;
  }

  const call = {
    from: "0x0000000000000000000000000000000000000001",
    to: chain.token,
    data: balanceOfData(chain.holder),
    gas: "0x1e8480",
  };

  try {
    const trace = await rpc<{ type?: string; from?: string; to?: string; input?: string; calls?: unknown[]; error?: string }>(
      rpcUrl,
      "debug_traceCall",
      [call, "latest", { tracer: "callTracer" }],
    );
    record(
      chain.name,
      "debug_traceCall callTracer",
      Boolean(trace?.to || trace?.type),
      `top ${trace.type ?? "?"} -> ${trace.to ?? "?"} ${selectorOf(trace.input)} depth ${walkDepth(trace)}${trace.error ? ` error=${trace.error}` : ""}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(chain.name, "debug_traceCall callTracer", false, message);
    console.error(`\nSTOP ${chain.name} debug_traceCall callTracer: ${message}`);
    debugFailed = true;
    return true;
  }

  try {
    const diff = await rpc<Record<string, unknown>>(rpcUrl, "debug_traceCall", [
      call,
      "latest",
      { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
    ]);
    const keys = diff && typeof diff === "object" ? Object.keys(diff).slice(0, 6).join(", ") : typeof diff;
    record(chain.name, "debug_traceCall prestateTracer", diff !== undefined && diff !== null, `keys: ${keys || "(empty object)"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(chain.name, "debug_traceCall prestateTracer", false, message);
    console.error(`\nSTOP ${chain.name} debug_traceCall prestateTracer: ${message}`);
    debugFailed = true;
    return true;
  }

  return debugFailed;
}

let failed = false;
for (const chain of chains) {
  const debugFailed = await checkChain(chain);
  if (debugFailed) {
    failed = true;
    break;
  }
}

console.log("\nPASS/FAIL");
console.log("chain  check  result  detail");
for (const row of rows) {
  console.log(`${row.result}\t${row.chain}\t${row.check}\t${row.detail}`);
}

if (failed || rows.some((row) => row.result === "FAIL" && row.check.startsWith("debug_"))) {
  console.error("\nA debug_* call failed. Confirm the NOWNodes plan includes Trace/Debug on mainnet before continuing.");
  process.exit(1);
}

const otherFail = rows.some((row) => row.result === "FAIL");
process.exit(otherFail ? 1 : 0);
