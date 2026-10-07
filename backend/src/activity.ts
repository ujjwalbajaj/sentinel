import type { Prisma } from "@prisma/client";
import { prisma } from "./db/client.js";
import { live } from "./live/hub.js";

export async function recordActivity(input: {
  chainId: number;
  txHash: string;
  blockNumber: string;
  type: string;
  from: string;
  to: string;
  valueWei: string;
  result: string;
  at: Date;
  riskScore?: number | null;
}): Promise<void> {
  const legacy: Record<string, string> = {
    Deposited: "deposited",
    Withdrawn: "withdrawn",
    PausedBy: "paused_by",
    Withdrawal: "mixer_funded",
  };
  const types = legacy[input.type] ? [input.type, legacy[input.type]] : [input.type];
  const siblings = await prisma.activityEvent.findMany({
    where: { chainId: input.chainId, txHash: input.txHash, type: { in: types } },
  });
  const existing = siblings.find(
    (row) => row.from === input.from && row.result === input.result && row.valueWei === input.valueWei,
  );
  if (existing) {
    const data: { type?: string; riskScore?: number | null } = {};
    if (existing.type !== input.type) data.type = input.type;
    if (input.riskScore !== undefined && existing.riskScore !== input.riskScore) data.riskScore = input.riskScore;
    if (data.type !== undefined || data.riskScore !== undefined) {
      await prisma.activityEvent.update({ where: { id: existing.id }, data });
    }
    return;
  }
  const row = await prisma.activityEvent.create({
    data: {
      chainId: input.chainId,
      txHash: input.txHash,
      blockNumber: input.blockNumber,
      type: input.type,
      from: input.from,
      to: input.to,
      valueWei: input.valueWei,
      result: input.result,
      at: input.at,
      riskScore: input.riskScore,
    },
  });
  live("activity:new", {
    ...row,
    at: row.at.toISOString(),
  });
}

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
