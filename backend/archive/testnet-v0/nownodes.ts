import { WebSocket } from "ws";
import type { Hex } from "viem";
import type { ChainConfig } from "./chains.js";
import type { CallFrame, StateDiff } from "./analyze.js";

export interface RpcTx {
  hash: Hex;
  from: Hex;
  to: Hex | null;
  input: Hex;
  value: bigint;
  nonce: number;
  blockNumber: bigint;
}

interface RpcBlock {
  timestamp: bigint;
  transactions: RpcTx[];
}

export interface RpcClient {
  call<T>(method: string, params: unknown[]): Promise<T>;
}

export function chainRpc(chain: ChainConfig, apiKey: string | undefined): { url: string; headers: Record<string, string> } {
  const override = process.env[chain.rpcEnv];
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;
  if (override) return { url: override, headers };
  if (!apiKey) {
    throw new Error(`Set NOWNODES_API_KEY or ${chain.rpcEnv} to watch ${chain.label}`);
  }
  return { url: `https://${chain.host}`, headers };
}

export function chainWs(chain: ChainConfig, apiKey: string | undefined): string {
  const override = process.env[chain.wsEnv];
  if (override) return override;
  if (!apiKey) throw new Error(`Set NOWNODES_API_KEY or ${chain.wsEnv} to watch ${chain.label}`);
  return `wss://${chain.host}/wss/${apiKey}`;
}

export function createRpc(chain: ChainConfig, apiKey: string | undefined): RpcClient {
  const target = chainRpc(chain, apiKey);
  return {
    async call<T>(method: string, params: unknown[]): Promise<T> {
      const response = await fetch(target.url, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const payload = (await response.json()) as { result?: T; error?: { message?: string } };
      if (payload.error) {
        throw new Error(`${chain.label} ${method}: ${payload.error.message ?? "RPC error"}`);
      }
      return payload.result as T;
    },
  };
}

export async function getBlock(rpc: RpcClient, blockNumber: bigint): Promise<RpcBlock> {
  const raw = await rpc.call<{ timestamp: string; transactions: RawTx[] }>("eth_getBlockByNumber", [
    `0x${blockNumber.toString(16)}`,
    true,
  ]);
  return {
    timestamp: BigInt(raw.timestamp),
    transactions: (raw.transactions ?? []).map((tx) => normalizeTx(tx, blockNumber)),
  };
}

export async function getCode(rpc: RpcClient, address: Hex): Promise<Hex> {
  const code = await rpc.call<string>("eth_getCode", [address, "latest"]);
  return (code || "0x") as Hex;
}

export async function getBalance(rpc: RpcClient, address: Hex): Promise<bigint> {
  const balance = await rpc.call<string>("eth_getBalance", [address, "latest"]);
  return BigInt(balance);
}

export async function traceCall(
  rpc: RpcClient,
  tx: { from: Hex; to: Hex; input: Hex; value?: bigint },
  tracer: "callTracer" | "prestateTracer",
): Promise<CallFrame | StateDiff> {
  const config =
    tracer === "callTracer"
      ? { tracer: "callTracer", tracerConfig: { onlyTopCall: false } }
      : { tracer: "prestateTracer", tracerConfig: { diffMode: true } };
  return rpc.call("debug_traceCall", [
    {
      from: tx.from,
      to: tx.to,
      data: tx.input,
      value: `0x${(tx.value ?? 0n).toString(16)}`,
      gas: "0x1e8480",
    },
    "latest",
    config,
  ]);
}

export function watchBlocks(
  chain: ChainConfig,
  apiKey: string | undefined,
  onBlock: (blockNumber: bigint) => void,
  onError: (error: Error) => void,
): () => void {
  let closed = false;
  let socket: WebSocket | undefined;
  let retryMs = 1_000;

  const connect = () => {
    if (closed) return;
    let url: string;
    try {
      url = chainWs(chain, apiKey);
    } catch (error) {
      onError(error as Error);
      return;
    }
    socket = new WebSocket(url);
    socket.on("open", () => {
      retryMs = 1_000;
      socket?.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
    });
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          params?: { result?: { number?: string } };
          error?: { message?: string };
        };
        if (message.error) {
          onError(new Error(`${chain.label} websocket: ${message.error.message}`));
          return;
        }
        const number = message.params?.result?.number;
        if (number) onBlock(BigInt(number));
      } catch (error) {
        onError(error as Error);
      }
    });
    socket.on("error", (error) => onError(error));
    socket.on("close", () => {
      if (closed) return;
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 15_000);
    });
  };

  connect();
  return () => {
    closed = true;
    socket?.close();
  };
}

interface RawTx {
  hash: Hex;
  from: Hex;
  to?: Hex | null;
  input?: Hex;
  value?: string;
  nonce?: string;
}

function normalizeTx(tx: RawTx, blockNumber: bigint): RpcTx {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to ?? null,
    input: tx.input ?? "0x",
    value: BigInt(tx.value ?? "0x0"),
    nonce: Number(BigInt(tx.nonce ?? "0x0")),
    blockNumber,
  };
}
