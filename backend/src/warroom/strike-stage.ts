import { getAddress, type Hex } from "viem";
import { recordActivity } from "../activity.js";
import { explorerTx, isSet, type ChainRuntime } from "../config/chains.js";
import { publicIncident } from "../cre/bridge.js";
import { prisma } from "../db/client.js";
import { revertSignature } from "../demo/revert.js";
import { incidentBalanceLoss } from "../incidents/balance-loss.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { emitStage } from "./stages.js";

const claimed = new Set<string>();

export function claimStrikeTx(chainId: number, txHash: string): boolean {
  const key = `${chainId}:${txHash.toLowerCase()}`;
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

function releaseStrikeTx(chainId: number, txHash: string): void {
  claimed.delete(`${chainId}:${txHash.toLowerCase()}`);
}

type StoredStage = { stage?: string; at?: string; data?: { txHash?: string; probeCostWei?: string; strikeLossWei?: string } };

function strikeStage(stages: unknown, txHash: string): StoredStage | null {
  if (!Array.isArray(stages)) return null;
  const hash = txHash.toLowerCase();
  for (let index = stages.length - 1; index >= 0; index--) {
    const stage = stages[index] as StoredStage;
    if (stage?.stage === "strike_reverted" && (stage.data?.txHash ?? "").toLowerCase() === hash) return stage;
  }
  return null;
}

function weiOrZero(value: string | null | undefined): string {
  if (!value || value === "0") return "0";
  return value;
}

async function strikeAmounts(chain: ChainRuntime, suspectTxHash: string, strikeTxHash: string): Promise<{ probeCostWei: string; strikeLossWei: string }> {
  if (!isSet(chain.deployment.vault)) return { probeCostWei: "0", strikeLossWei: "0" };
  const loss = await incidentBalanceLoss(chain, chain.deployment.vault, suspectTxHash || null, strikeTxHash).catch(() => null);
  let probeCostWei = loss?.probeCostWei ?? "0";
  if (probeCostWei === "0" && /^0x[0-9a-fA-F]{64}$/.test(suspectTxHash)) {
    const probe = await chain.http().getTransaction({ hash: suspectTxHash as Hex }).catch(() => null);
    if (probe && probe.value > 0n) probeCostWei = probe.value.toString();
  }
  return { probeCostWei, strikeLossWei: "0" };
}

export async function publishStrikeReverted(input: {
  chain: ChainRuntime;
  incidentId: string;
  txHash: string;
  reason?: string;
  explorerUrl?: string;
  strikeLossWei?: string;
  probeCostWei?: string;
  at?: Date;
  blockNumber?: string;
  from?: string;
  to?: string;
  valueWei?: string;
  score?: number;
}): Promise<boolean> {
  if (!claimStrikeTx(input.chain.id, input.txHash)) return false;
  let staged = false;
  try {
    const row = await prisma.incident.findUnique({ where: { id: input.incidentId } });
    if (!row) return false;
    const reason = input.reason ?? (await revertSignature(input.chain, input.txHash as Hex).catch(() => null)) ?? "reverted";
    const amounts = await strikeAmounts(input.chain, row.suspectTxHash, input.txHash);
    const probeCostWei = amounts.probeCostWei !== "0" ? amounts.probeCostWei : weiOrZero(input.probeCostWei);
    const strikeLossWei = "0";
    const existing = strikeStage(row.stages, input.txHash);
    if (existing && weiOrZero(existing.data?.probeCostWei) === probeCostWei && weiOrZero(existing.data?.strikeLossWei) === strikeLossWei) {
      return false;
    }
    const tx = input.blockNumber && input.from ? null : await input.chain.http().getTransaction({ hash: input.txHash as Hex }).catch(() => null);
    const at = input.at ?? new Date();
    const updated = await prisma.incident.update({
      where: { id: row.id },
      data: { status: "reverted_strike", strikeTxHash: input.txHash, strikeAt: at },
    });
    await emitStage(row.id, input.chain.id, "strike_reverted", {
      txHash: input.txHash,
      reason,
      explorerUrl: input.explorerUrl ?? explorerTx(input.chain, input.txHash),
      strikeLossWei: strikeLossWei ?? "0",
      probeCostWei: probeCostWei ?? "0",
    });
    staged = true;
    await recordActivity({
      chainId: input.chain.id,
      txHash: input.txHash,
      blockNumber: input.blockNumber ?? tx?.blockNumber?.toString() ?? "0",
      type: "strike",
      from: input.from ? getAddress(input.from) : tx?.from ? getAddress(tx.from) : getAddress(row.attacker),
      to: input.to ? getAddress(input.to) : tx?.to ? getAddress(tx.to) : "",
      valueWei: input.valueWei ?? tx?.value.toString() ?? "0",
      result: "reverted",
      at,
      riskScore: input.score ?? row.score,
    });
    live("incident:strike_reverted", publicIncident(updated));
    log.info({ id: row.id, tx: input.txHash, reason, probeCostWei, strikeLossWei }, "strike reverted");
    return true;
  } catch (error) {
    if (!staged) releaseStrikeTx(input.chain.id, input.txHash);
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { incidentId: input.incidentId, tx: input.txHash, err: message.replace(/https?:\/\/\S+/gi, "[http]").replace(/wss?:\/\/\S+/gi, "[wss]") },
      "strike reverted stage skipped",
    );
    return false;
  }
}
