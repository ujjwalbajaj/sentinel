import { toFunctionSelector, type Hex } from "viem";
import type { CallFrame } from "./trace.js";

const WITHDRAW = new Set([toFunctionSelector("withdrawAll()").slice(2).toLowerCase()]);

export function shouldInvestigate(input: {
  senderIsContract: boolean;
  mixerFunded: boolean;
  withdrawnWei: bigint;
  depositedWei: bigint;
}): boolean {
  if (input.senderIsContract) return true;
  if (input.mixerFunded) return true;
  if (input.withdrawnWei > input.depositedWei) return true;
  return false;
}

function isVaultWithdraw(frame: CallFrame, vault: string): boolean {
  const selector = (frame.input ?? "").replace(/^0x/, "").slice(0, 8).toLowerCase();
  return (frame.to ?? "").toLowerCase() === vault.toLowerCase() && WITHDRAW.has(selector);
}

/** True when a vault withdraw selector sits inside another vault withdraw frame. */
export function reentrancyDetected(frame: CallFrame, vault: string): boolean {
  const walk = (node: CallFrame, inside: boolean): boolean => {
    const here = isVaultWithdraw(node, vault);
    if (here && inside) return true;
    return (node.calls ?? []).some((child) => walk(child, inside || here));
  };
  return walk(frame, false);
}

export function withdrawSenders(frame: CallFrame, vault: string): Hex[] {
  const found: Hex[] = [];
  const walk = (node: CallFrame) => {
    if (isVaultWithdraw(node, vault) && node.from) found.push(node.from as Hex);
    for (const child of node.calls ?? []) walk(child);
  };
  walk(frame);
  return found;
}

export function touchesVaultWithdraw(frame: CallFrame, vault: string): boolean {
  return withdrawSenders(frame, vault).length > 0;
}
