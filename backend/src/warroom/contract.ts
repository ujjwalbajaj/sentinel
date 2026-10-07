export const WAR_ROOM_STAGES = [
  "probe_detected",
  "trace_complete",
  "simulation_complete",
  "cre_submitted",
  "cre_verdict",
  "report_signed",
  "pause_confirmed",
  "strike_reverted",
  "cre_timeout",
] as const;

export type WarRoomStageName = (typeof WAR_ROOM_STAGES)[number];

export interface WarRoomStage {
  incidentId: string;
  chainId: 56 | 8453;
  stage: WarRoomStageName;
  at: string;
  data: Record<string, unknown>;
}

export function isChainId(value: number): value is 56 | 8453 {
  return value === 56 || value === 8453;
}
