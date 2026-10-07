import { json } from "../activity.js";
import { prisma } from "../db/client.js";
import { live } from "../live/hub.js";
import { isChainId, type WarRoomStage, type WarRoomStageName } from "./contract.js";

export async function emitStage(incidentId: string, chainId: number, stage: WarRoomStageName, data: Record<string, unknown>): Promise<WarRoomStage | null> {
  if (!isChainId(chainId)) return null;
  const entry: WarRoomStage = {
    incidentId,
    chainId,
    stage,
    at: new Date().toISOString(),
    data,
  };
  await prisma.$transaction(async (tx) => {
    const row = await tx.incident.findUnique({ where: { id: incidentId }, select: { stages: true } });
    const stages = Array.isArray(row?.stages) ? [...(row.stages as unknown as WarRoomStage[])] : [];
    stages.push(entry);
    await tx.incident.update({ where: { id: incidentId }, data: { stages: json(stages) } });
  });
  live("warroom:stage", entry);
  return entry;
}

export function stageAt(incident: { stages: unknown }, stage: WarRoomStageName): string | null {
  const stages = Array.isArray(incident.stages) ? (incident.stages as WarRoomStage[]) : [];
  return stages.find((item) => item.stage === stage)?.at ?? null;
}
