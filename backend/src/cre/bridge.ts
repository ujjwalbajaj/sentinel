import type { Incident } from "@prisma/client";
import { detectionOff, env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { json } from "../activity.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { creEvidenceIssues, creEvidenceSchema } from "../shared/cre/evidence.js";
import { CreListenerDown, followBroadcast, listenPortOpen, triggerCreListener } from "./listen.js";
import { CreSpawnError, parseCreSimulation, parseSentinelReport, parseSentinelVerdict, simulateCre, triggerCreHttp, type Evidence } from "../shared/cre-client.js";
import { emitStage } from "../warroom/stages.js";

let queue: Promise<void> = Promise.resolve();
const creTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearCreTimeout(incidentId: string): void {
  const timer = creTimers.get(incidentId);
  if (!timer) return;
  clearTimeout(timer);
  creTimers.delete(incidentId);
}

function armCreTimeout(incidentId: string): void {
  clearCreTimeout(incidentId);
  const timer = setTimeout(() => {
    creTimers.delete(incidentId);
    void timeoutIfStillWaiting(incidentId);
  }, 90_000);
  creTimers.set(incidentId, timer);
}

interface Timings {
  probeBlockUnix: number;
  detectedUnix: number;
  sentUnix: number | null;
  pausedUnix: number | null;
  probeToDetectedSec: number | null;
  detectedToSentSec: number | null;
  sentToPausedSec: number | null;
  probeToPausedSec: number | null;
  creSpawnMs: number | null;
  creExitMs: number | null;
  exploitBlockedSeenMs: number | null;
  spawnToExitMs: number | null;
  exitToBlockedMs: number | null;
}

export function enqueueEvidence(incidentId: string, evidence: Evidence): void {
  queue = queue
    .then(() => deliver(incidentId, evidence))
    .catch((error) => {
      log.error({ incidentId, err: error instanceof Error ? error.message : String(error) }, "CRE delivery failed");
    });
}

async function deliver(id: string, evidence: Evidence): Promise<void> {
  if (detectionOff()) {
    log.info({ id }, "CRE off, not spawning");
    return;
  }
  const current = await prisma.incident.findUnique({ where: { id } });
  if (!current) return;
  if (current.status === "paused" || current.status === "reverted_strike" || current.status === "false_positive") {
    log.info({ id, status: current.status }, "skipping CRE, incident already handled");
    return;
  }
  const protocol = await prisma.protocol.findUnique({ where: { id: current.protocolId } });
  if (protocol?.status === "paused") {
    log.info({ id }, "skipping CRE, vault already paused");
    return;
  }

  const checked = creEvidenceSchema.safeParse(evidence);
  if (!checked.success) {
    const reason = `Rejected evidence: ${creEvidenceIssues(checked.error)}`;
    log.error({ id, err: reason }, "CRE payload failed validation; not spawning");
    await recordCre(current, {
      status: "cre_rejected",
      creRunLog: reason,
      creSpawnMs: null,
      creExitMs: null,
      attempt: { at: new Date().toISOString(), mode: env.CRE_MODE, exitCode: null, action: "rejected", score: null, txHash: null, reason },
    });
    return;
  }

  let creRunLog = "";
  let creSpawnMs: number | null = null;
  let creExitMs: number | null = null;
  let parsed: ReturnType<typeof parseCreSimulation> | null = null;
  let exitCode: number | null = env.CRE_MODE === "http" ? 0 : null;
  let mode: "simulate" | "http" = env.CRE_MODE === "simulate" ? "simulate" : "http";
  let attemptMode: string = env.CRE_MODE;
  let listenQueued = false;
  let listenOffset: number | null = null;
  if (env.CRE_MODE === "listen") {
    if (await listenPortOpen()) {
      mode = "http";
      attemptMode = "listen";
      log.info({ id, path: "listen" }, "CRE path");
      await emitStage(current.id, current.chainId, "cre_submitted", { mode });
      try {
        const run = await triggerCreListener(checked.data);
        listenOffset = run.offset;
        creRunLog = [run.log, run.httpBody].filter(Boolean).join("\n");
        creSpawnMs = run.startedAt;
        creExitMs = run.exitedAt;
        exitCode = 0;
        parsed = parseCreSimulation(creRunLog);
        const sawVerdict = creRunLog.includes("SENTINEL_VERDICT") || creRunLog.includes("Transaction successful") || creRunLog.includes("Rejected evidence");
        if (!sawVerdict) listenQueued = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof CreListenerDown) {
          attemptMode = "spawn";
          log.warn({ id, path: "spawn", err: message }, "CRE listen is down, spawning a one-shot simulation");
          creRunLog = "";
          parsed = null;
        } else {
          log.error({ id, path: "listen", err: message }, "CRE listen trigger failed");
          await recordCre(current, {
            status: "cre_rejected",
            creRunLog: message,
            creSpawnMs,
            creExitMs,
            attempt: {
              at: new Date().toISOString(),
              mode: "listen",
              exitCode: null,
              action: null,
              score: null,
              txHash: null,
              reason: message,
            },
          });
          return;
        }
      }
    } else {
      attemptMode = "spawn";
      log.info({ id, path: "spawn" }, "CRE path");
    }
  }
  if (listenQueued) {
    await recordCre(current, {
      status: "sent_to_cre",
      creRunLog: "CRE listen accepted the trigger. The simulator log is not attached, so the verdict line was not parsed.",
      creSpawnMs,
      creExitMs,
      attempt: {
        at: new Date().toISOString(),
        mode: "listen",
        exitCode: 0,
        action: null,
        score: null,
        txHash: null,
        reason: null,
      },
    });
    log.info({ id, path: "listen" }, "evidence queued on the CRE listener; waiting for ExploitBlocked");
    armCreTimeout(id);
    return;
  }
  if (!creRunLog) {
    mode = env.CRE_MODE === "http" ? "http" : "simulate";
    await emitStage(current.id, current.chainId, "cre_submitted", { mode });
  try {
    if (env.CRE_MODE === "http") {
      creRunLog = await triggerCreHttp(checked.data);
      parsed = parseCreSimulation(creRunLog);
    } else {
      const run = await simulateCre(checked.data);
      creRunLog = run.log;
      creSpawnMs = run.startedAt;
      creExitMs = run.exitedAt;
      exitCode = run.exitCode;
      parsed = parseCreSimulation(run.log);
    }
  } catch (error) {
    creRunLog = error instanceof Error ? error.message : String(error);
    if (error instanceof CreSpawnError) {
      creSpawnMs = error.startedAt;
      creExitMs = error.exitedAt;
    }
    log.error({ id, err: creRunLog }, "CRE call failed");
    await publishCreLines(current, creRunLog, parsed);
    await recordCre(current, {
      status: "cre_rejected",
      creRunLog,
      creSpawnMs,
      creExitMs,
      attempt: {
        at: new Date().toISOString(),
        mode: attemptMode,
        exitCode,
        action: parsed?.action ?? null,
        score: parsed?.score ?? null,
        txHash: parsed?.txHash ?? null,
        reason: creRunLog,
      },
    });
    return;
  }
  }

  let report = await publishCreLines(current, creRunLog, parsed);
  const expectsBroadcast = parseSentinelVerdict(creRunLog, current.id)?.action === "pause" || Boolean(report);
  if (attemptMode === "listen" && listenOffset != null && !report?.writeTxHash && expectsBroadcast) {
    const followed = await followBroadcast(listenOffset, current.id);
    if (followed?.writeTxHash && followed.writeTxHash !== report?.writeTxHash) {
      report = followed;
      await emitStage(current.id, current.chainId, "report_signed", { reportHex: followed.reportHex, writeTxHash: followed.writeTxHash });
    } else if (!report && followed) {
      report = followed;
      await emitStage(current.id, current.chainId, "report_signed", { ...followed });
    }
  }
  const verdictAction = parseSentinelVerdict(creRunLog, current.id)?.action ?? parsed?.action;
  const accepted = verdictAction === "pause" && (exitCode === 0 || exitCode === null);
  if (!accepted) {
    const reason = parsed?.reason ?? (parsed?.action ? `CRE action ${parsed.action} without a txHash` : "CRE stdout had no pause result");
    log.error({ id, action: parsed?.action ?? null, exitCode: parsed?.exitCode ?? null }, reason);
    await recordCre(current, {
      status: "cre_rejected",
      creRunLog: reason,
      creSpawnMs,
      creExitMs,
      attempt: {
        at: new Date().toISOString(),
        mode: attemptMode,
        exitCode,
        action: parsed?.action ?? null,
        score: parsed?.score ?? null,
        txHash: parsed?.txHash ?? null,
        reason,
      },
    });
    return;
  }

  await recordCre(current, {
    status: "sent_to_cre",
    creRunLog: `action=pause score=${parsed?.score ?? "missing"} txHash=${report?.writeTxHash ?? parsed?.txHash ?? "pending"}`,
    creSpawnMs,
    creExitMs,
    attempt: {
      at: new Date().toISOString(),
      mode: attemptMode,
      exitCode,
      action: verdictAction ?? "pause",
      score: parsed?.score ?? null,
      txHash: report?.writeTxHash ?? parsed?.txHash ?? null,
      reason: null,
    },
  });
  log.info(
    { id, mode: attemptMode, creSpawnMs, creExitMs, txHash: report?.writeTxHash ?? parsed?.txHash ?? null },
    "evidence handed to CRE; waiting for ExploitBlocked",
  );
  if (report?.writeTxHash) {
    const { confirmPauseReceipt } = await import("../watchers/index.js");
    try {
      await confirmPauseReceipt(current.id, current.chainId, report.writeTxHash);
    } catch (error) {
      log.warn(
        { id, err: error instanceof Error ? error.message : String(error) },
        "pause receipt confirmation failed; watcher remains the fallback",
      );
    }
  }
}

interface CreAttempt {
  at: string;
  mode: string;
  exitCode: number | null;
  action: string | null;
  score: number | null;
  txHash: string | null;
  reason: string | null;
}

async function appendCreAttempt(current: Incident, attempt: CreAttempt): Promise<Incident> {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${current.id} FOR UPDATE`;
    const fresh = await tx.incident.findUnique({ where: { id: current.id } });
    const features = ((fresh ?? current).features ?? {}) as { creAttempts?: CreAttempt[] };
    const creAttempts = [...(features.creAttempts ?? []), attempt];
    return tx.incident.update({
      where: { id: current.id },
      data: { features: json({ ...features, creAttempts }) },
    });
  });
  live("incident:cre_attempt", { id: current.id, attempt });
  return updated;
}

async function recordCre(
  current: Incident,
  input: {
    status: "sent_to_cre" | "cre_rejected";
    creRunLog: string;
    creSpawnMs: number | null;
    creExitMs: number | null;
    attempt: CreAttempt;
  },
): Promise<void> {
  await appendCreAttempt(current, input.attempt);
  const sentAt = new Date();
  const sentUnix = Math.floor(sentAt.getTime() / 1000);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${current.id} FOR UPDATE`;
    const fresh = await tx.incident.findUnique({ where: { id: current.id } });
    const base = fresh ?? current;
    const features = (base.features ?? {}) as { timings?: Partial<Timings>; creAttempts?: CreAttempt[] };
    const prior = features.timings ?? {};
    const timings: Timings = {
      probeBlockUnix: prior.probeBlockUnix ?? 0,
      detectedUnix: prior.detectedUnix ?? sentUnix,
      sentUnix,
      pausedUnix: prior.pausedUnix ?? null,
      probeToDetectedSec: prior.probeToDetectedSec ?? null,
      detectedToSentSec: prior.detectedUnix == null ? null : sentUnix - prior.detectedUnix,
      sentToPausedSec: prior.sentToPausedSec ?? null,
      probeToPausedSec: prior.probeToPausedSec ?? null,
      creSpawnMs: input.creSpawnMs,
      creExitMs: input.creExitMs,
      exploitBlockedSeenMs: prior.exploitBlockedSeenMs ?? null,
      spawnToExitMs: input.creSpawnMs == null || input.creExitMs == null ? null : input.creExitMs - input.creSpawnMs,
      exitToBlockedMs: prior.exitToBlockedMs ?? null,
    };
    return tx.incident.update({
      where: { id: current.id },
      data: {
        status: keepCreStatus(base, input.status),
        sentAt: input.status === "sent_to_cre" ? sentAt : base.sentAt,
        creRunLog: input.creRunLog,
        features: json({ ...features, timings }),
      },
    });
  });
  live(input.status === "sent_to_cre" ? "incident:sent_to_cre" : "incident:cre_rejected", publicIncident(updated));
}

async function publishCreLines(
  current: Incident,
  creRunLog: string,
  parsed: ReturnType<typeof parseCreSimulation> | null,
): Promise<ReturnType<typeof parseSentinelReport>> {
  const verdict = parseSentinelVerdict(creRunLog, current.id);
  if (verdict) {
    await emitStage(current.id, current.chainId, "cre_verdict", { ...verdict });
    if (verdict.action === "pause" || verdict.action === "rejected") clearCreTimeout(current.id);
  } else if (parsed && typeof parsed.score === "number" && (parsed.action === "pause" || parsed.action === "rejected")) {
    await emitStage(current.id, current.chainId, "cre_verdict", { score: parsed.score, action: parsed.action, source: "cre" });
    clearCreTimeout(current.id);
  }
  const report = parseSentinelReport(creRunLog, current.id);
  if (report) await emitStage(current.id, current.chainId, "report_signed", { ...report });
  return report;
}

function keepCreStatus(row: Incident, next: "sent_to_cre" | "cre_rejected"): string {
  if (row.status === "paused" || row.status === "reverted_strike" || row.status === "false_positive") return row.status;
  const stages = Array.isArray(row.stages) ? (row.stages as { stage?: string }[]) : [];
  if (stages.some((stage) => stage.stage === "pause_confirmed")) return row.status === "sent_to_cre" ? "paused" : row.status;
  return next;
}

function verdictAlreadyIn(row: Incident): boolean {
  const stages = Array.isArray(row.stages) ? (row.stages as { stage?: string; data?: { action?: string } }[]) : [];
  return stages.some(
    (stage) => stage.stage === "cre_verdict" && (stage.data?.action === "pause" || stage.data?.action === "rejected"),
  );
}

async function timeoutIfStillWaiting(id: string): Promise<void> {
  const row = await prisma.incident.findUnique({ where: { id } });
  if (!row || row.status === "paused" || row.status === "reverted_strike" || row.status === "cre_rejected" || row.status === "false_positive") return;
  const stages = Array.isArray(row.stages) ? (row.stages as { stage?: string }[]) : [];
  if (stages.some((stage) => stage.stage === "pause_confirmed")) return;
  if (verdictAlreadyIn(row)) return;
  if (row.status !== "sent_to_cre") return;
  live("incident:cre_timeout", { id, creRunLog: row.creRunLog });
  await emitStage(row.id, row.chainId, "cre_timeout", { log: row.creRunLog });
  log.warn({ id }, "no ExploitBlocked within 90s");
}

export function publicIncident(row: Incident): Record<string, unknown> {
  return {
    ...row,
    detectedAt: row.detectedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    strikeAt: row.strikeAt?.toISOString() ?? null,
  };
}
