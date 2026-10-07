import { decodeErrorResult, type Abi, type Hex } from "viem";
import type { ChainRuntime } from "../config/chains.js";
import { attackerAbi, guardianAbi, mixerAbi, vaultAbi } from "../shared/load-abi.js";

const errorAbi = [vaultAbi, attackerAbi, guardianAbi, mixerAbi].flatMap((abi) => abi.filter((item) => item.type === "error")) as Abi;

const stringError = [
  { type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] },
] as const satisfies Abi;

const notes: Record<string, string> = {
  EnforcedPause: "EnforcedPause (vault paused by SENTINEL)",
};

const traced = new Map<string, { name: string; described: string }>();

type Frame = {
  output?: string;
  error?: string;
  calls?: Frame[];
};

export function describeRevert(name: string): string {
  return notes[name] ?? name;
}

export function isOpaqueRevert(reason: string | null | undefined): boolean {
  if (!reason) return true;
  const text = reason.trim();
  return text.length === 0 || /unknown reason|^reverted$|^execution reverted\.?$/i.test(text);
}

export function decodeRevertData(data: string | undefined): string | null {
  if (!data || !data.startsWith("0x") || data.length < 10) return null;
  try {
    return decodeErrorResult({ abi: errorAbi, data: data as Hex }).errorName;
  } catch {
    // not one of our custom errors
  }
  if (data.startsWith("0x08c379a0")) {
    try {
      const decoded = decodeErrorResult({ abi: stringError, data: data as Hex });
      const message = decoded.args?.[0];
      return typeof message === "string" && message.length > 0 ? message : null;
    } catch {
      return null;
    }
  }
  return null;
}

function deepestRevert(frame: Frame, depth = 0): { depth: number; name: string } | null {
  let best: { depth: number; name: string } | null = null;
  const name = decodeRevertData(frame.output);
  if (name) best = { depth, name };
  for (const child of frame.calls ?? []) {
    const nested = deepestRevert(child, depth + 1);
    if (nested && (!best || nested.depth >= best.depth)) best = nested;
  }
  return best;
}

async function tracedRevert(chain: ChainRuntime, hash: Hex): Promise<{ name: string; described: string } | null> {
  const key = `${chain.id}:${hash.toLowerCase()}`;
  const cached = traced.get(key);
  if (cached) return cached;
  try {
    const trace = (await chain.http().request({
      method: "debug_traceTransaction",
      params: [hash, { tracer: "callTracer" }],
    })) as Frame;
    const found = deepestRevert(trace);
    if (!found) return null;
    const stored = { name: found.name, described: describeRevert(found.name) };
    traced.set(key, stored);
    return stored;
  } catch {
    return null;
  }
}

export async function revertFromTrace(chain: ChainRuntime, hash: Hex): Promise<string | null> {
  return (await tracedRevert(chain, hash))?.described ?? null;
}

export async function revertSignature(chain: ChainRuntime, hash: Hex): Promise<string | null> {
  const found = await tracedRevert(chain, hash);
  if (!found) return null;
  return found.name.endsWith("()") ? found.name : `${found.name}()`;
}
