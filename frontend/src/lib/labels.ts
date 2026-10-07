import { chainMeta } from "./chains";
import type { ActivityResult, Chain, IncidentOutcome, PauseMethod, ProtocolStatus } from "./types";

export type Tone = "safe" | "warn" | "danger" | "info" | "muted";

export function protocolLabel(name: string, chains: Chain | Chain[]): string {
  const list = Array.isArray(chains) ? chains : [chains];
  const chain = list.map((item) => chainMeta[item].label).join(", ");
  return chain ? `${name} · ${chain}` : name;
}

export function exploitTitle(name: string): string {
  return `Exploit blocked on ${name}`;
}

export function protocolPill(status: ProtocolStatus): { tone: Tone; label: string } {
  switch (status) {
    case "watching":
      return { tone: "safe", label: "Watching" };
    case "paused":
      return { tone: "info", label: "Paused" };
    case "alert-only":
      return { tone: "muted", label: "Alert only" };
    case "action-needed":
      return { tone: "warn", label: "Action needed" };
  }
}

export function outcomePill(outcome: IncidentOutcome): { tone: Tone; label: string } {
  switch (outcome) {
    case "blocked":
      return { tone: "safe", label: "Blocked" };
    case "alerted":
      return { tone: "warn", label: "Alerted" };
    case "false-positive":
      return { tone: "muted", label: "False positive" };
    case "open":
      return { tone: "danger", label: "Open" };
  }
}

export function resultPill(result: ActivityResult, score: number | null): { tone: Tone; label: string } {
  switch (result) {
    case "normal":
      return { tone: "muted", label: "Normal" };
    case "watch":
      return { tone: "warn", label: "Watch" };
    case "risk":
      return { tone: "danger", label: score == null ? "Risk" : `Risk ${score}` };
    case "paused":
      return { tone: "info", label: "Paused" };
    case "reverted":
      return { tone: "safe", label: "Reverted" };
  }
}

export const pauseMethodLabel: Record<PauseMethod, string> = {
  "pauser-role": "PAUSER_ROLE",
  "safe-module": "Safe module",
  "owner-wrapper": "Owner wrapper",
  "alert-only": "Alert only",
};

export function incidentStatusPill(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "detected":
      return { tone: "warn", label: "detected" };
    case "sent_to_cre":
      return { tone: "info", label: "sent_to_cre" };
    case "cre_rejected":
      return { tone: "danger", label: "cre_rejected" };
    case "paused":
      return { tone: "info", label: "paused" };
    case "reverted_strike":
      return { tone: "safe", label: "reverted_strike" };
    case "false_positive":
      return { tone: "muted", label: "false_positive" };
    default:
      return { tone: "muted", label: status || "unknown" };
  }
}

export const stageLabel: Record<string, string> = {
  setup: "Setup",
  fund: "Fund",
  allowlist: "Allowlist",
  deploy: "Deploy",
  probe: "Probe",
  detected: "Detected",
  cre: "CRE",
  test: "Test",
  simulate: "Simulate",
  pause: "Pause",
  strike: "Strike reverted",
};
