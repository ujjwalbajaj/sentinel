import { getAddress, toFunctionSelector, type Hex } from "viem";
import type { ChainRuntime } from "../config/chains.js";
import { vaultAbi } from "../shared/load-abi.js";

const STRIKE = toFunctionSelector("strike(uint256)");
const balances = new Map<string, bigint>();

export interface IncidentBalanceLoss {
  strikeLossWei: string;
  probeCostWei: string;
  strikeBalanceBeforeWei: string | null;
  strikeBalanceAfterWei: string | null;
  probeBalanceBeforeWei: string | null;
  probeBalanceAfterWei: string | null;
}

const NONE: IncidentBalanceLoss = {
  strikeLossWei: "0",
  probeCostWei: "0",
  strikeBalanceBeforeWei: null,
  strikeBalanceAfterWei: null,
  probeBalanceBeforeWei: null,
  probeBalanceAfterWei: null,
};

function isHash(value: string | null | undefined): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

async function balanceAt(chain: ChainRuntime, vault: Hex, blockNumber: bigint): Promise<bigint> {
  const key = `${chain.id}:${vault.toLowerCase()}:${blockNumber}`;
  const cached = balances.get(key);
  if (cached != null) return cached;
  const wei = await chain.http().readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "vaultBalance",
    blockNumber,
  });
  const value = BigInt(wei as bigint | string | number);
  balances.set(key, value);
  return value;
}

async function dropAt(chain: ChainRuntime, vault: Hex, blockNumber: bigint): Promise<{ before: bigint; after: bigint; drop: bigint }> {
  if (blockNumber <= 0n) return { before: 0n, after: 0n, drop: 0n };
  const before = await balanceAt(chain, vault, blockNumber - 1n);
  const after = await balanceAt(chain, vault, blockNumber);
  return { before, after, drop: before > after ? before - after : 0n };
}

export async function incidentBalanceLoss(
  chain: ChainRuntime,
  vaultAddress: string,
  suspectTxHash: string | null,
  strikeTxHash: string | null,
): Promise<IncidentBalanceLoss> {
  const vault = getAddress(vaultAddress);
  let probeBlock: bigint | null = null;
  let strikeBlock: bigint | null = null;
  if (isHash(suspectTxHash)) {
    const tx = await chain.http().getTransaction({ hash: suspectTxHash });
    if (tx.blockNumber != null) {
      if (!isHash(strikeTxHash) && tx.input.toLowerCase().startsWith(STRIKE)) strikeBlock = tx.blockNumber;
      else probeBlock = tx.blockNumber;
    }
  }
  if (isHash(strikeTxHash)) {
    const tx = await chain.http().getTransaction({ hash: strikeTxHash });
    if (tx.blockNumber != null) strikeBlock = tx.blockNumber;
  }
  const loss: IncidentBalanceLoss = { ...NONE };
  if (probeBlock != null && probeBlock !== strikeBlock) {
    const drop = await dropAt(chain, vault, probeBlock);
    loss.probeCostWei = drop.drop.toString();
    loss.probeBalanceBeforeWei = drop.before.toString();
    loss.probeBalanceAfterWei = drop.after.toString();
  }
  if (strikeBlock != null) {
    const drop = await dropAt(chain, vault, strikeBlock);
    loss.strikeLossWei = drop.drop.toString();
    loss.strikeBalanceBeforeWei = drop.before.toString();
    loss.strikeBalanceAfterWei = drop.after.toString();
  }
  return loss;
}
