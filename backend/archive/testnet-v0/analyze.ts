import { toFunctionSelector, type Hex } from "viem";

export interface CallFrame {
  type: string;
  from?: string;
  to?: string;
  input?: string;
  output?: string;
  value?: string;
  error?: string;
  calls?: CallFrame[];
}

export interface StateDiff {
  pre?: Record<string, { balance?: string }>;
  post?: Record<string, { balance?: string }>;
}

export interface TraceFindings {
  reentrancy: boolean;
  flashLoanEntry: boolean;
  vaultBalanceDropBps: number;
  drainWei: bigint;
  testSizedCall: boolean;
}

const FLASH_SELECTORS = new Set(
  [
    "flashLoan(address,address,uint256,bytes)",
    "flashLoan(address,address[],uint256[],uint256[],address,bytes,uint16)",
    "flashLoan(address,uint256,bytes)",
    "onFlashLoan(address,address,uint256,uint256,bytes)",
  ].map((signature) => toFunctionSelector(signature).slice(2).toLowerCase()),
);

export function extractSelectors(bytecode: Hex): Hex[] {
  const hex = bytecode.slice(2).toLowerCase();
  const found = new Set<string>();
  for (let i = 0; i + 10 <= hex.length; i += 2) {
    if (hex.slice(i, i + 2) !== "63") continue;
    const selector = hex.slice(i + 2, i + 10);
    if (/^[0-9a-f]{8}$/.test(selector)) found.add(`0x${selector}`);
  }
  return [...found].slice(0, 12) as Hex[];
}

export function hasReentrancy(frame: CallFrame, vault: string): boolean {
  const target = vault.toLowerCase();
  const walk = (node: CallFrame, stack: string[]): boolean => {
    const to = (node.to ?? "").toLowerCase();
    if (to === target && stack.includes(target)) return true;
    const next = to ? [...stack, to] : stack;
    return (node.calls ?? []).some((child) => walk(child, next));
  };
  return walk(frame, []);
}

export function hasFlashLoan(frame: CallFrame): boolean {
  const selector = frame.input?.replace(/^0x/, "").slice(0, 8).toLowerCase();
  if (selector && FLASH_SELECTORS.has(selector)) return true;
  return (frame.calls ?? []).some((child) => hasFlashLoan(child));
}

export function valueLeftVault(frame: CallFrame, vault: string): bigint {
  const target = vault.toLowerCase();
  let total = 0n;
  if ((frame.from ?? "").toLowerCase() === target && frame.value) {
    total += BigInt(frame.value);
  }
  for (const child of frame.calls ?? []) total += valueLeftVault(child, vault);
  return total;
}

export function analyze(input: {
  trace: CallFrame;
  stateDiff?: StateDiff;
  vault: string;
  vaultBalanceWei: bigint;
  observedWei: bigint;
  maxTestToDrainRatioBps: number;
}): TraceFindings {
  const fromDiff = dropFromDiff(input.stateDiff, input.vault);
  const drainWei = fromDiff ?? valueLeftVault(input.trace, input.vault);
  const vaultBalanceWei = input.vaultBalanceWei > 0n ? input.vaultBalanceWei : drainWei;
  const vaultBalanceDropBps =
    vaultBalanceWei === 0n ? 0 : Number((drainWei * 10_000n) / vaultBalanceWei);
  const testSizedCall =
    drainWei > 0n && input.observedWei * 10_000n <= drainWei * BigInt(input.maxTestToDrainRatioBps);

  return {
    reentrancy: hasReentrancy(input.trace, input.vault),
    flashLoanEntry: hasFlashLoan(input.trace),
    vaultBalanceDropBps,
    drainWei,
    testSizedCall,
  };
}

function dropFromDiff(diff: StateDiff | undefined, vault: string): bigint | null {
  if (!diff?.pre || !diff.post) return null;
  const key = Object.keys(diff.pre).find((candidate) => candidate.toLowerCase() === vault.toLowerCase());
  if (!key) return null;
  const before = diff.pre[key]?.balance;
  const after = diff.post[key]?.balance ?? diff.post[key.toLowerCase()]?.balance;
  if (before === undefined || after === undefined) return null;
  const pre = BigInt(before);
  const post = BigInt(after);
  if (post >= pre) return 0n;
  return pre - post;
}

export function truncateTrace(frame: CallFrame, depth: number): CallFrame {
  if (depth <= 0) {
    const children = frame.calls?.length ?? 0;
    return {
      ...frame,
      calls: children > 0 ? [{ type: "TRUNCATED", from: frame.to, to: "", input: `${children} child calls omitted` }] : [],
    };
  }
  return {
    ...frame,
    calls: (frame.calls ?? []).map((child) => truncateTrace(child, depth - 1)),
  };
}
