import { formatEther, toFunctionSelector, type Abi } from "viem";
import attackerAbi from "@/shared/abi/Attacker.json";
import vaultAbi from "@/shared/abi/VulnerableVault.json";
import type { TraceNode } from "./types";

type Frame = {
  type?: string;
  from?: string;
  to?: string;
  input?: string;
  value?: string;
  calls?: Array<Frame | null> | null;
};

const selectors = buildSelectors();
const withdraw = toFunctionSelector("withdrawAll()").toLowerCase();

function buildSelectors() {
  const map = new Map<string, string>();
  for (const abi of [vaultAbi, attackerAbi] as Abi[]) {
    for (const item of abi) {
      if (item.type !== "function") continue;
      const types = (item.inputs ?? []).map((input) => input.type);
      const signature = `${item.name}(${types.join(",")})`;
      map.set(toFunctionSelector(signature).toLowerCase(), types.length ? `${item.name}(${types.join(",")})` : `${item.name}()`);
    }
  }
  return map;
}

const ZERO = BigInt(0);

function parseWei(value?: string) {
  if (!value || value === "0x" || value === "0x0" || value === "0") return ZERO;
  try {
    return BigInt(value);
  } catch {
    return ZERO;
  }
}

function trimEther(value: string) {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

export function flattenTrace(root: unknown, symbol: string): TraceNode[] {
  if (!root || typeof root !== "object") return [];
  const frame = root as Frame;
  if (!("calls" in frame) && !frame.input && !frame.to) return [];
  return walk(frame, 0, false, "0", symbol);
}

function walk(frame: Frame, depth: number, ancestorWithdraw: boolean, path: string, symbol: string): TraceNode[] {
  if (frame.type === "TRUNCATED") return [{ id: path, call: "truncated", depth }];
  const selector = (frame.input ?? "").slice(0, 10).toLowerCase();
  const isWithdraw = selector === withdraw;
  const name = selectors.get(selector) ?? (selector.length >= 10 ? selector : "receive");
  const wei = parseWei(frame.value);
  const call = wei > ZERO ? `${name} ${trimEther(formatEther(wei))} ${symbol}` : name;
  const node: TraceNode = {
    id: path,
    call,
    depth,
    flag: isWithdraw && ancestorWithdraw ? "reentry" : undefined,
  };
  const children = (frame.calls ?? []).flatMap((child, index) =>
    child ? walk(child, depth + 1, ancestorWithdraw || isWithdraw, `${path}.${index}`, symbol) : [],
  );
  return [node, ...children];
}

/** Net value that left the vault during a call, matching the backend probe loss. */
export function probeNetLossWei(root: unknown, vault: string) {
  if (!root || typeof root !== "object" || !vault) return "0";
  let withdrawn = ZERO;
  let deposited = ZERO;
  const target = vault.toLowerCase();
  const visit = (node: Frame) => {
    const value = parseWei(node.value);
    if (value > ZERO && (node.from ?? "").toLowerCase() === target) withdrawn += value;
    if (value > ZERO && (node.to ?? "").toLowerCase() === target) deposited += value;
    for (const child of node.calls ?? []) if (child) visit(child);
  };
  visit(root as Frame);
  const net = withdrawn - deposited;
  return (net > ZERO ? net : ZERO).toString();
}
