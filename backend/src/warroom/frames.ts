import { getAddress, toFunctionSelector, type Abi, type Hex } from "viem";
import type { ChainRuntime } from "../config/chains.js";
import type { CallFrame } from "../detector/trace.js";
import { attackerAbi, guardianAbi, vaultAbi } from "../shared/load-abi.js";

const WITHDRAW = toFunctionSelector("withdrawAll()").toLowerCase();

const fnBySelector = new Map<string, string>();
for (const abi of [vaultAbi, attackerAbi, guardianAbi] as Abi[]) {
  for (const item of abi) {
    if (item.type !== "function") continue;
    const signature = `${item.name}(${(item.inputs ?? []).map((input) => input.type).join(",")})`;
    fnBySelector.set(toFunctionSelector(signature).toLowerCase(), `${item.name}()`);
  }
}

export interface TraceFrame {
  depth: number;
  label: string;
  reentry?: boolean;
}

export function flattenTrace(
  root: CallFrame,
  chain: ChainRuntime,
  attackerContract: string | null,
): { depth: number; reentrancy: boolean; frames: TraceFrame[] } {
  const frames: TraceFrame[] = [];
  let reentrancy = false;
  const walk = (node: CallFrame, depth: number, insideVaultWithdraw: boolean) => {
    if (frames.length >= 8 || depth > 5) return;
    const selector = (node.input ?? "").slice(0, 10).toLowerCase();
    const vaultWithdraw = isVault(chain, node.to) && selector === WITHDRAW;
    const reentry = vaultWithdraw && insideVaultWithdraw;
    if (reentry) reentrancy = true;
    const frame: TraceFrame = {
      depth,
      label: frameLabel(chain, node, attackerContract),
    };
    if (reentry) frame.reentry = true;
    frames.push(frame);
    for (const child of node.calls ?? []) walk(child, depth + 1, insideVaultWithdraw || vaultWithdraw);
  };
  walk(root, 0, false);
  const depth = frames.reduce((max, frame) => Math.max(max, frame.depth), 0);
  return { depth, reentrancy, frames };
}

function frameLabel(chain: ChainRuntime, node: CallFrame, attackerContract: string | null): string {
  const name = contractName(chain, node.to, attackerContract);
  const fn = functionName(node.input, node.value);
  return `${name}.${fn}`;
}

function functionName(input: string | undefined, value: string | undefined): string {
  const raw = input ?? "0x";
  if (raw === "0x" || raw.length < 10) {
    return value && BigInt(value) > 0n ? "receive()" : "fallback()";
  }
  return fnBySelector.get(raw.slice(0, 10).toLowerCase()) ?? `${raw.slice(0, 10)}()`;
}

function contractName(chain: ChainRuntime, to: string | undefined, attackerContract: string | null): string {
  if (!to) return "unknown";
  if (same(to, chain.deployment.vault)) return "Vault";
  if (same(to, chain.deployment.guardian)) return "Guardian";
  if (attackerContract && same(to, attackerContract)) return "Attacker";
  return shortAddress(to);
}

function isVault(chain: ChainRuntime, to: string | undefined): boolean {
  return same(to, chain.deployment.vault);
}

function same(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return left.toLowerCase() === right.toLowerCase();
  }
}

function shortAddress(value: string): string {
  const address = value as Hex;
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
