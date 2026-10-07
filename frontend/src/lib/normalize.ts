import { formatEther } from "viem";
import { chainFromId, chainMeta } from "./chains";
import { flattenTrace, probeNetLossWei } from "./trace";
import type { ActivityRow, Chain, Incident, Policy, Protocol, Signal, TimelineStage, TraceNode } from "./types";

function asChain(value: unknown): Chain {
  if (value === "base" || value === "bsc") return value;
  if (typeof value === "number") return chainFromId(value) ?? "base";
  if (value === "8453") return "base";
  if (value === "56") return "bsc";
  return "base";
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function asNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function ageLabel(seconds: number) {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

function secondsBetween(start?: string, end?: string) {
  if (!start || !end) return null;
  const delta = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(delta)) return null;
  return Math.max(0, Math.round(delta / 1000));
}

const emptyPolicy: Policy = {
  pauseThreshold: 80,
  alertThreshold: 40,
  autoPause: true,
  protectedHours: null,
  allowlist: [],
  cooldownMin: 0,
};

function nativeAmount(wei: string) {
  if (!wei) return undefined;
  try {
    return formatEther(BigInt(wei));
  } catch {
    return undefined;
  }
}

export function normalizeProtocol(raw: Record<string, unknown>): Protocol {
  const live = (raw.live ?? {}) as Record<string, unknown>;
  const chain = asChain(raw.chain ?? raw.chainId);
  const contracts = Array.isArray(raw.contracts)
    ? raw.contracts
    : raw.vaultAddress || raw.address
      ? [{ address: raw.vaultAddress ?? raw.address, chain, label: raw.name }]
      : [];
  const paused = Boolean(live.paused) || raw.status === "paused";
  const protectedVault = Boolean(live.protectedVault) || raw.status === "protected";
  const status: Protocol["status"] = paused ? "paused" : protectedVault ? "watching" : raw.status === "pending" ? "action-needed" : "watching";
  return {
    id: asString(raw.id),
    name: asString(raw.name, "Protocol"),
    website: asString(raw.website),
    logoUrl: asString(raw.logoUrl) || undefined,
    chains: (Array.isArray(raw.chains) ? raw.chains : [raw.chain ?? raw.chainId]).map(asChain),
    tvlUsd: asNumber(raw.tvlUsd ?? raw.valueProtectedUsd),
    tvlNative: asString(raw.tvlNative) || nativeAmount(asString(live.vaultBalanceWei ?? raw.vaultBalanceWei)),
    nativeSymbol: asString(raw.nativeSymbol) || chainMeta[chain].symbol,
    protectedVault,
    admin: asString(live.admin ?? raw.admin ?? raw.adminAddress) || undefined,
    guardian: asString(raw.guardian ?? raw.guardianAddress) || undefined,
    status,
    pauseMethod: (asString(raw.pauseMethod, "pauser-role") as Protocol["pauseMethod"]) || "pauser-role",
    contracts: (contracts as Record<string, unknown>[]).map((contract, index) => ({
      id: asString(contract.id, String(index)),
      label: asString(contract.label, "Vault"),
      address: asString(contract.address),
      chain: asChain(contract.chain ?? contract.chainId ?? raw.chain ?? raw.chainId),
      pauseMethod: (asString(contract.pauseMethod, "pauser-role") as Protocol["pauseMethod"]) || "pauser-role",
      guardianGranted: Boolean(contract.guardianGranted ?? contract.pauserGranted ?? live.pauserRoleGranted ?? raw.pauserGranted),
    })),
    lastEventAt: asString(raw.lastEventAt),
    lastEventBlock: asNumber(raw.lastEventBlock),
    risk24h: Array.isArray(raw.risk24h) ? (raw.risk24h as number[]) : [],
    risk7d: Array.isArray(raw.risk7d) ? (raw.risk7d as Protocol["risk7d"]) : [],
    tvl7d: Array.isArray(raw.tvl7d) ? (raw.tvl7d as Protocol["tvl7d"]) : [],
    policy: (raw.policy as Policy) || emptyPolicy,
  };
}

function traces(value: unknown): TraceNode[] {
  if (!Array.isArray(value)) return [];
  return value as TraceNode[];
}

function bpsLabel(bps: number) {
  const pct = bps / 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}

function signalsFrom(raw: Record<string, unknown>, features: Record<string, unknown>): Signal[] {
  if (Array.isArray(raw.signals) && raw.signals.length > 0 && !Array.isArray(raw.reasons)) {
    return (raw.signals as Record<string, unknown>[]).map((signal) => ({
      key: (asString(signal.key, "reentrancy") as Signal["key"]) || "reentrancy",
      label: asString(signal.label, "Signal"),
      detail: asString(signal.detail),
      points: asNumber(signal.points),
    }));
  }
  const reasons = Array.isArray(raw.reasons) ? (raw.reasons as Record<string, unknown>[]) : [];
  const pointsOf = (key: string) => {
    const match = reasons.find((reason) => reason.key === key);
    return match ? asNumber(match.points) : 0;
  };
  const detailOf = (key: string) => {
    const match = reasons.find((reason) => reason.key === key);
    return match ? asString(match.detail) : "";
  };
  const bps = features.vaultBalanceDeltaBps == null ? null : asNumber(features.vaultBalanceDeltaBps);
  const age = features.walletAgeSeconds == null ? null : asNumber(features.walletAgeSeconds);
  return [
    {
      key: "reentrancy",
      label: "Reentrancy",
      detail: detailOf("reentrancyDetected") || (features.reentrancyDetected ? "Re-entry in the trace" : "none"),
      points: pointsOf("reentrancyDetected"),
    },
    {
      key: "balanceDelta",
      label: "Balance delta",
      detail: bps == null ? detailOf("vaultBalanceDeltaBps") || "none" : `${bpsLabel(bps)} of vault`,
      points: pointsOf("vaultBalanceDeltaBps"),
    },
    {
      key: "mixerGas",
      label: "Mixer-funded",
      detail: detailOf("mixerFunded") || (features.mixerFunded ? "First funds came from a known mixer" : "none"),
      points: pointsOf("mixerFunded"),
    },
    {
      key: "freshWallet",
      label: "Fresh wallet",
      detail: age == null ? detailOf("walletAgeSeconds") || "none" : `${age} s old`,
      points: pointsOf("walletAgeSeconds"),
    },
    {
      key: "flashLoan",
      label: "Flash loan",
      detail: features.flashLoanEntry ? detailOf("flashLoanEntry") || "Flash loan detected" : "none",
      points: pointsOf("flashLoanEntry"),
    },
    {
      key: "newContract",
      label: "New contract",
      detail: features.newContractTarget ? detailOf("newContractTarget") || "New contract" : "none",
      points: pointsOf("newContractTarget"),
    },
  ];
}

function creAttemptRows(
  raw: Record<string, unknown>,
  features: Record<string, unknown>,
  rawTimeline: Record<string, unknown>[],
  creLog: string,
  status: string,
  sentAt: string,
): Incident["timeline"] {
  const top = Array.isArray(raw.creAttempts) ? raw.creAttempts : [];
  const nested = Array.isArray(features.creAttempts) ? features.creAttempts : [];
  const attempts = (top.length > 0 ? top : nested).filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  if (attempts.length > 0) {
    return [...attempts]
      .sort((left, right) => asString(left.at).localeCompare(asString(right.at)))
      .map((attempt) => ({
        at: asString(attempt.at),
        block: 0,
        stage: "cre" as const,
        text: creAttemptText(attempt),
        txHash: asString(attempt.txHash) || undefined,
        offChain: true,
      }))
      .filter((item) => item.at || item.text);
  }
  const sent = rawTimeline.find((row) => asString(row.step ?? row.stage) === "cre_sent");
  const at = asString(sent?.at) || sentAt;
  if (!at && !creLog) return [];
  const accepted = /action\s*=\s*pause/i.test(creLog) || status === "paused" || status === "reverted_strike" || status === "sent_to_cre";
  const reason = accepted ? "" : creLog;
  return [
    {
      at,
      block: 0,
      stage: "cre",
      text: creAttemptText({ action: accepted ? "pause" : "rejected", reason, score: null }),
      offChain: true,
    },
  ];
}

function creAttemptText(attempt: Record<string, unknown>) {
  const action = asString(attempt.action);
  const reason = asString(attempt.reason);
  const score = attempt.score == null || attempt.score === "" ? null : asNumber(attempt.score);
  const accepted = action === "pause" && !reason;
  const head = accepted ? "CRE · accepted" : "CRE · rejected";
  const extra = [score == null ? "" : `score ${score}`, !accepted && reason ? reason : ""].filter(Boolean);
  return extra.length ? `${head} · ${extra.join(" · ")}` : head;
}

const stepCopy: Record<string, { stage: TimelineStage; text: string; offChain?: boolean }> = {
  fund: { stage: "fund", text: "Funded" },
  allowlist: { stage: "allowlist", text: "Allowlisted (demo safety)" },
  deploy: { stage: "deploy", text: "Attacker deployed" },
  probe: { stage: "probe", text: "Probe (test call)" },
  detected: { stage: "detected", text: "Detected", offChain: true },
  exploit_blocked: { stage: "pause", text: "Paused (ExploitBlocked)" },
  strike_reverted: { stage: "strike", text: "Strike reverted (EnforcedPause)" },
};

export function normalizeIncident(raw: Record<string, unknown>): Incident {
  const features = (raw.features ?? {}) as Record<string, unknown>;
  const timings = (features.timings ?? {}) as Record<string, unknown>;
  const protocol = (raw.protocol ?? {}) as Record<string, unknown>;
  const chain = asChain(raw.chain ?? raw.chainId);
  const symbol = asString(raw.nativeSymbol) || chainMeta[chain].symbol;
  const status = asString(raw.status);
  const protocolName = asString(protocol.name || raw.protocolName);
  const vaultAddress = asString(raw.vaultAddress ?? protocol.vaultAddress ?? raw.address);
  const traceBody = (raw.trace ?? {}) as { probe?: unknown; simulation?: unknown };
  const probeFrame = traceBody.probe;
  const simulationFrame = traceBody.simulation;
  const resent = features.resent === true || raw.resent === true;
  const creLog = asString(raw.creRunLog);
  const sentAt = asString(raw.sentAt);
  const pausedAt = asString(raw.pausedAt);
  const rawTimeline = Array.isArray(raw.timeline) ? (raw.timeline as Record<string, unknown>[]) : [];

  const timeline: Incident["timeline"] = [];
  for (const row of rawTimeline) {
    const step = asString(row.step ?? row.stage);
    if (step === "cre_sent" || step === "cre_attempt") continue;
    const copy = stepCopy[step];
    if (!copy) continue;
    const at = asString(row.at);
    const txHash = asString(row.txHash) || undefined;
    if (!at && !txHash) continue;
    const text = step === "fund" && features.mixerFunded ? "Funded via MockMixer" : asString(row.text) || copy.text;
    timeline.push({ at, block: asNumber(row.block), stage: copy.stage, text, txHash, offChain: copy.offChain });
  }

  const creRows = creAttemptRows(raw, features, rawTimeline, creLog, status, sentAt);
  timeline.push(...creRows);
  timeline.sort((left, right) => {
    const leftMs = Date.parse(left.at);
    const rightMs = Date.parse(right.at);
    const leftKey = Number.isFinite(leftMs) ? leftMs : Number.POSITIVE_INFINITY;
    const rightKey = Number.isFinite(rightMs) ? rightMs : Number.POSITIVE_INFINITY;
    return leftKey - rightKey;
  });

  const probeAt =
    timeline.find((item) => item.stage === "probe")?.at ||
    (timings.probeBlockUnix != null ? new Date(asNumber(timings.probeBlockUnix) * 1000).toISOString() : "");
  const pauseStamp = timeline.find((item) => item.stage === "pause")?.at || pausedAt;
  const probeToPause = secondsBetween(probeAt, pauseStamp);

  const probeTrace = probeFrame ? flattenTrace(probeFrame, symbol) : traces(raw.probeTrace);
  const strikeTrace = simulationFrame ? flattenTrace(simulationFrame, symbol) : traces(raw.strikeTrace);
  const valueAtRiskWei = asString(raw.valueAtRiskWei);
  const fundsLostWei = asString(raw.fundsLostWei) || probeNetLossWei(probeFrame, vaultAddress);
  const attackerRecord = (typeof raw.attacker === "object" && raw.attacker ? raw.attacker : {}) as Record<string, unknown>;
  const attackerAddress = typeof raw.attacker === "string" ? raw.attacker : asString(attackerRecord.address);
  const ageSeconds = features.walletAgeSeconds == null ? null : asNumber(features.walletAgeSeconds);

  return {
    id: asString(raw.id),
    protocolId: asString(raw.protocolId ?? protocol.id),
    source: asString(raw.source),
    status,
    protocolName,
    resent,
    chain,
    score: asNumber(raw.score),
    outcome: outcomeFrom(raw),
    valueAtRiskUsd: asNumber(raw.valueAtRiskUsd),
    valueAtRiskWei,
    valueAtRiskNative: asString(raw.valueAtRiskNative) || nativeAmount(valueAtRiskWei),
    vaultBalanceWei: asString(raw.vaultBalanceWei),
    fundsLostWei,
    strikeLossWei: asString(raw.strikeLossWei) || fundsLostWei,
    probeCostWei: asString(raw.probeCostWei) || "0",
    strikeBalanceBeforeWei: asString(raw.strikeBalanceBeforeWei) || null,
    strikeBalanceAfterWei: asString(raw.strikeBalanceAfterWei) || null,
    probeBalanceBeforeWei: asString(raw.probeBalanceBeforeWei) || null,
    probeBalanceAfterWei: asString(raw.probeBalanceAfterWei) || null,
    vaultDeltaBps: features.vaultBalanceDeltaBps == null ? null : asNumber(features.vaultBalanceDeltaBps),
    nativeSymbol: symbol,
    vaultAddress: vaultAddress || undefined,
    active: Boolean(raw.active),
    testToPauseSec: probeToPause,
    fundsLostUsd: asNumber(raw.fundsLostUsd),
    timeline,
    signals: signalsFrom(raw, features),
    trace: probeTrace,
    probeTrace,
    strikeTrace,
    threshold: raw.threshold == null ? 80 : asNumber(raw.threshold, 80),
    explanation: explanationOf(raw, features, valueAtRiskWei),
    cre: creSteps(raw, status, creLog, sentAt, pausedAt),
    attacker: {
      address: attackerAddress,
      age: ageSeconds == null ? asString(attackerRecord.age) : `${ageSeconds} s old`,
      fundingSource: features.mixerFunded ? "MockMixer" : asString(attackerRecord.fundingSource),
      contractsDeployed: asString(raw.attackerContract) ? [asString(raw.attackerContract)] : Array.isArray(attackerRecord.contractsDeployed) ? (attackerRecord.contractsDeployed as string[]) : [],
      otherProtocols: Array.isArray(attackerRecord.otherProtocols) ? (attackerRecord.otherProtocols as string[]) : [],
    },
    balanceChange: asString(raw.balanceChange),
    fundsDestination: asString(raw.fundsDestination || raw.attackerContract),
  };
}

function creSteps(raw: Record<string, unknown>, status: string, creLog: string, sentAt: string, pausedAt: string): Incident["cre"] {
  if (Array.isArray(raw.cre) && raw.cre.length > 0 && !creLog && !sentAt) {
    return (raw.cre as Record<string, unknown>[]).map((item) => ({
      step: asString(item.step),
      at: asString(item.at),
      block: asNumber(item.block),
      txHash: asString(item.txHash) || undefined,
      result: asString(item.result) || undefined,
    }));
  }
  const pauseTx = asString(raw.pauseTxHash);
  const score = asNumber(raw.score);
  const detectedAt = asString(raw.detectedAt);
  const loggedPause = /action\s*=\s*pause/i.test(creLog);
  if (!sentAt && !loggedPause && !pauseTx && status !== "cre_rejected") return [];
  const steps: Incident["cre"] = [];
  if (sentAt) steps.push({ step: "Evidence sent", at: sentAt, block: 0 });
  if (sentAt || loggedPause) steps.push({ step: `Scored (${score})`, at: sentAt || detectedAt, block: 0 });
  if (loggedPause) steps.push({ step: "Signed report", at: sentAt || detectedAt, block: 0 });
  if (loggedPause && pauseTx) {
    steps.push({ step: "Chainlink forwarder", at: pausedAt || sentAt, block: 0, txHash: pauseTx });
    steps.push({ step: "Guardian.pause()", at: pausedAt || sentAt, block: 0, txHash: pauseTx });
    if (status === "paused" || status === "reverted_strike") {
      steps.push({ step: "ReportProcessed", at: pausedAt || sentAt, block: 0, txHash: pauseTx, result: "true" });
    }
  }
  if (status === "cre_rejected") steps.push({ step: "Rejected", at: sentAt || detectedAt, block: 0, result: creLog || undefined });
  return steps;
}

function explanationOf(raw: Record<string, unknown>, features: Record<string, unknown>, valueAtRiskWei: string) {
  const given = asString(raw.explanation).trim();
  if (given) return given;
  if (features.walletAgeSeconds == null && features.vaultBalanceDeltaBps == null && features.reentrancyDetected == null) {
    return "No explanation stored for this incident.";
  }
  const age = asNumber(features.walletAgeSeconds);
  const unknownAge = 10 * 365 * 24 * 3600;
  const ageText = age >= unknownAge - 60 ? "unknown age" : `${age} seconds`;
  const pct = Math.round(asNumber(features.vaultBalanceDeltaBps) / 100);
  const amount = `${nativeAmount(valueAtRiskWei) ?? "0"} native`;
  const secs = (features.timings as { probeToPausedSec?: number | null } | undefined)?.probeToPausedSec;
  const secsText = secs == null ? "an unmeasured number of" : String(secs);
  const funded = features.mixerFunded ? "funded through a mixer, " : "";
  const reentry = features.reentrancyDetected
    ? "deployed a contract that re-entered withdrawAll() before the vault updated its balance."
    : "called withdraw on the vault.";
  return `A wallet ${ageText} old, ${funded}${reentry} Simulating the full attack showed ${pct}% of the vault (${amount}) could be drained in one transaction. SENTINEL paused the vault ${secsText} seconds after the test call.`;
}

export function mergeIncident(previous: Incident | undefined, next: Incident): Incident {
  if (!previous) return next;
  return {
    ...previous,
    ...next,
    timeline: next.timeline.length > 0 ? next.timeline : previous.timeline,
    probeTrace: next.probeTrace && next.probeTrace.length > 0 ? next.probeTrace : previous.probeTrace,
    strikeTrace: next.strikeTrace && next.strikeTrace.length > 0 ? next.strikeTrace : previous.strikeTrace,
    trace: next.trace.length > 0 ? next.trace : previous.trace,
    signals: next.signals.length > 0 ? next.signals : previous.signals,
    cre: next.cre.length > 0 ? next.cre : previous.cre,
    explanation: next.explanation.startsWith("No explanation") ? previous.explanation || next.explanation : next.explanation || previous.explanation,
  };
}

function outcomeFrom(raw: Record<string, unknown>): Incident["outcome"] {
  const given = asString(raw.outcome);
  if (given === "blocked" || given === "alerted" || given === "false-positive" || given === "open") return given;
  const status = asString(raw.status);
  if (status === "paused" || status === "reverted_strike") return "blocked";
  if (status === "cre_rejected") return "alerted";
  return "open";
}

function activityRiskScore(raw: Record<string, unknown>): number | null {
  if (raw.riskScore == null || raw.riskScore === "") return null;
  const number = typeof raw.riskScore === "number" ? raw.riskScore : Number(raw.riskScore);
  return Number.isFinite(number) ? number : null;
}

export function normalizeActivity(raw: Record<string, unknown>): ActivityRow {
  const score = activityRiskScore(raw);
  const resultText = asString(raw.result, "normal");
  const known = ["normal", "watch", "risk", "paused", "reverted"] as const;
  const result = (known as readonly string[]).includes(resultText) ? (resultText as ActivityRow["result"]) : score != null && score >= 80 ? "risk" : "normal";
  return {
    id: asString(raw.id),
    at: asString(raw.at),
    block: asNumber(raw.blockNumber ?? raw.block),
    chain: asChain(raw.chain ?? raw.chainId),
    protocolId: asString(raw.protocolId),
    event: asString(raw.type ?? raw.event),
    from: asString(raw.from),
    txHash: asString(raw.txHash),
    score,
    result,
  };
}

export type Stats = {
  valueProtectedUsd: number | null;
  valueProtectedNative: { chain: Chain; symbol: string; amount: string; wei: string; usd: number | null }[];
  attacksBlocked: number;
  medianTestToPauseSec: number | null;
  lastIncidentSeconds: number | null;
  fundsLostUsd: number | null;
};

export function normalizeStats(raw: Record<string, unknown>): Stats {
  const wrapped = (raw.valueProtected ?? {}) as { chains?: Record<string, unknown>[] };
  const chains = Array.isArray(raw.valueProtectedNative)
    ? (raw.valueProtectedNative as Record<string, unknown>[])
    : (wrapped.chains ?? []);
  return {
    valueProtectedUsd: nullableNumber(raw.valueProtectedUsd ?? (raw.valueProtected as { usd?: number | null } | undefined)?.usd),
    valueProtectedNative: chains.map((item) => ({
      chain: asChain(item.chain ?? item.chainId),
      symbol: asString(item.symbol ?? item.native),
      amount: asString(item.amount) || nativeAmount(asString(item.wei)) || "0",
      wei: asString(item.wei),
      usd: nullableNumber(item.usd),
    })),
    attacksBlocked: asNumber(raw.attacksBlocked),
    medianTestToPauseSec:
      raw.medianTestToPauseSec == null && raw.medianProbeToPauseSeconds == null
        ? null
        : asNumber(raw.medianTestToPauseSec ?? raw.medianProbeToPauseSeconds),
    fundsLostUsd: nullableNumber(raw.fundsLostUsd ?? (raw.fundsLost as { usd?: number | null } | undefined)?.usd),
    lastIncidentSeconds: raw.lastIncidentSeconds == null ? null : asNumber(raw.lastIncidentSeconds),
  };
}
