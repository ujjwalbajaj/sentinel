import { mainnetChains, resetSocket, type ChainRuntime } from "../config/chains.js";
import { env } from "../config/env.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { socketBackoffMs } from "../shared/watcher-guard.js";
import { onVaultHead, resubscribeWatchers } from "../watchers/index.js";
import { isChainId } from "./contract.js";

const rttMs = new Map<number, number>();
const blocks = new Map<number, number>();
const emitted = new Map<number, number>();
const wsUp = new Map<number, boolean>();
const lastBlockAt = new Map<number, number>();
const armedAt = new Map<number, number>();
const attempts = new Map<number, number>();
const generation = new Map<number, number>();
const unsubscribe = new Map<number, () => void>();
const retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
let started = false;

export function latestRttMs(chainId: number): number {
  return rttMs.get(chainId) ?? 0;
}

export function headsStatusLine(): string {
  const part = (chainId: number) => {
    const block = blocks.get(chainId);
    const rtt = rttMs.get(chainId);
    const socket = wsUp.get(chainId) ? "up" : "down";
    return `${chainId} block=${block ?? "—"} rtt=${rtt ?? "—"}ms ws=${socket}`;
  };
  return `[heads] ${part(56)} | ${part(8453)}`;
}

export function startChainHeads(): void {
  if (started) return;
  started = true;
  for (const chain of mainnetChains()) {
    if (!isChainId(chain.id)) continue;
    wsUp.set(chain.id, false);
    const openedAt = Date.now();
    void sampleRtt(chain);
    setInterval(() => {
      void sampleRtt(chain);
    }, 5_000);
    setInterval(() => {
      void pollHead(chain);
    }, 1_000);
    setInterval(() => {
      const at = lastBlockAt.get(chain.id);
      const limit = at == null ? 8_000 : chain.id === 56 ? 4_000 : 8_000;
      if (Date.now() - (at ?? armedAt.get(chain.id) ?? openedAt) <= limit) return;
      markDown(chain, at == null ? "newHeads never delivered a block" : `no newHeads for ${limit}ms`);
    }, 1_000);
    subscribeHeads(chain);
  }
  setInterval(() => {
    log.info(headsStatusLine());
  }, 30_000);
}

async function sampleRtt(chain: ChainRuntime): Promise<void> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(chain.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.NOWNODES_API_KEY ? { "api-key": env.NOWNODES_API_KEY } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      log.warn(
        { chainId: chain.id, status: response.status, body: redact(text).slice(0, 180) },
        "block number RTT failed",
      );
      return;
    }
    const parsed = JSON.parse(text) as { result?: string; error?: { code?: number; message?: string } };
    if (!parsed.result || parsed.error) {
      log.warn(
        {
          chainId: chain.id,
          status: response.status,
          code: parsed.error?.code ?? null,
          err: redact(parsed.error?.message ?? "no block result"),
        },
        "block number RTT failed",
      );
      return;
    }
    const ms = Math.max(1, Date.now() - startedAt);
    rttMs.set(chain.id, ms);
    const number = Number(BigInt(parsed.result));
    const known = blocks.get(chain.id) ?? 0;
    if (number > known) blocks.set(chain.id, number);
    const latest = blocks.get(chain.id);
    if (latest != null) emitHead(chain, BigInt(latest), ms);
  } catch (error) {
    log.warn({ chainId: chain.id, err: redact(errorText(error)) }, "block number RTT failed");
  } finally {
    clearTimeout(timer);
  }
}

async function pollHead(chain: ChainRuntime): Promise<void> {
  if (wsUp.get(chain.id) === true) return;
  try {
    const blockNumber = await chain.http().getBlockNumber();
    emitHead(chain, blockNumber, rttMs.get(chain.id));
  } catch (error) {
    log.warn({ chainId: chain.id, err: redact(errorText(error)) }, "head poll failed");
  }
}

function emitHead(chain: ChainRuntime, blockNumber: bigint, latency: number | undefined): void {
  if (latency == null || latency <= 0 || !isChainId(chain.id)) return;
  const number = Number(blockNumber);
  const known = blocks.get(chain.id) ?? 0;
  if (number > known) blocks.set(chain.id, number);
  const already = emitted.get(chain.id) ?? 0;
  if (number <= already) return;
  emitted.set(chain.id, number);
  live("chain:head", {
    chainId: chain.id,
    blockNumber: number,
    latencyMs: latency,
    at: new Date().toISOString(),
  });
  onVaultHead(chain, blockNumber);
}

function subscribeHeads(chain: ChainRuntime): void {
  const token = (generation.get(chain.id) ?? 0) + 1;
  generation.set(chain.id, token);
  armedAt.set(chain.id, Date.now());
  try {
    stopSubscription(chain.id);
    const socket = chain.socket();
    const stop = socket.watchBlocks({
      onBlock(block: { number?: bigint | null } | undefined) {
        if (generation.get(chain.id) !== token) return;
        if (!block || block.number == null) return;
        const pending = retryTimers.get(chain.id);
        if (pending) {
          clearTimeout(pending);
          retryTimers.delete(chain.id);
        }
        attempts.set(chain.id, 0);
        wsUp.set(chain.id, true);
        lastBlockAt.set(chain.id, Date.now());
        const number = Number(block.number);
        const known = blocks.get(chain.id) ?? 0;
        if (number > known) blocks.set(chain.id, number);
        emitHead(chain, block.number, rttMs.get(chain.id));
      },
      onError(error: Error) {
        if (generation.get(chain.id) !== token) return;
        const reason = redact(error?.message ?? errorText(error));
        log.warn({ chainId: chain.id, err: reason }, "newHeads subscription error");
        markDown(chain, reason);
      },
    });
    unsubscribe.set(chain.id, stop);
    void watchClose(chain, token);
  } catch (error) {
    markDown(chain, errorText(error));
  }
}

async function watchClose(chain: ChainRuntime, token: number): Promise<void> {
  try {
    const rpc = await chain.socket().transport.getRpcClient();
    const socket = rpc.socket as
      | {
          addEventListener?: (type: string, listener: (event: { code?: number; reason?: string; wasClean?: boolean }) => void) => void;
        }
      | undefined;
    socket?.addEventListener?.("close", (event) => {
      if (generation.get(chain.id) !== token) return;
      const reason = String(event.reason ?? "").trim() || `code ${event.code ?? "unknown"}`;
      log.warn(
        { chainId: chain.id, code: event.code ?? null, reason: redact(reason), wasClean: event.wasClean ?? null },
        "newHeads socket closed",
      );
      markDown(chain, `close ${event.code ?? "?"} ${redact(reason)}`);
    });
  } catch (error) {
    if (generation.get(chain.id) !== token) return;
    log.warn({ chainId: chain.id, err: redact(errorText(error)) }, "newHeads socket closed");
    markDown(chain, errorText(error));
  }
}

function markDown(chain: ChainRuntime, reason: string): void {
  const waiting = wsUp.get(chain.id) === false && retryTimers.has(chain.id);
  wsUp.set(chain.id, false);
  if (waiting) return;
  log.warn({ chainId: chain.id, reason: redact(reason) }, "newHeads socket down");
  if (retryTimers.has(chain.id)) return;
  const attempt = attempts.get(chain.id) ?? 0;
  const delay = socketBackoffMs(attempt);
  attempts.set(chain.id, attempt + 1);
  const timer = setTimeout(() => {
    retryTimers.delete(chain.id);
    void reconnect(chain);
  }, delay);
  retryTimers.set(chain.id, timer);
}

async function reconnect(chain: ChainRuntime): Promise<void> {
  const token = (generation.get(chain.id) ?? 0) + 1;
  generation.set(chain.id, token);
  stopSubscription(chain.id);
  try {
    await resetSocket(chain);
    if (generation.get(chain.id) !== token) return;
    resubscribeWatchers(chain);
    subscribeHeads(chain);
    log.info({ chainId: chain.id }, "newHeads resubscribed");
  } catch (error) {
    log.warn({ chainId: chain.id, err: redact(errorText(error)) }, "newHeads resubscribe failed");
    markDown(chain, errorText(error));
  }
}

function stopSubscription(chainId: number): void {
  const stop = unsubscribe.get(chainId);
  unsubscribe.delete(chainId);
  if (!stop) return;
  try {
    stop();
  } catch {
    return;
  }
}

function redact(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[http]")
    .replace(/wss?:\/\/\S+/gi, "[wss]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
}

function errorText(error: unknown): string {
  const named = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  const message = error instanceof Error ? error.message : String(error);
  return redact(`${named} ${message}`.trim());
}
