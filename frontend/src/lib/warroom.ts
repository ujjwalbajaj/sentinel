import { chainFromId, chainMeta } from "./chains";
import { addressUrl, txUrl } from "./explorer";
import type { Chain } from "./types";

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

export const PIPELINE_STEPS = [
  ["probe_detected", "Probe"],
  ["trace_complete", "Traced"],
  ["simulation_complete", "Simulated"],
  ["cre_verdict", "CRE verdict"],
  ["report_signed", "Signed"],
  ["pause_confirmed", "Paused"],
  ["strike_reverted", "Strike blocked"],
] as const;

export type StepId = (typeof PIPELINE_STEPS)[number][0];
export type StepStatus = "idle" | "active" | "done" | "bad";
export type Phase = "calm" | "threat" | "contained";
export type Playback = "idle" | "instant" | "live" | "replay";
export type ChainId = 56 | 8453;

export interface TraceFrame {
  depth: number;
  label: string;
  reentry?: boolean;
}

export interface CreRule {
  id: string;
  label: string;
  points: number | null;
  hit: boolean;
}

export interface LogPart {
  text: string;
  tone?: "red" | "grn" | "blu" | "tea" | "amb" | "muted";
  href?: string;
}

export interface LogLine {
  id: string;
  at: string;
  time: string;
  parts: LogPart[];
}

export interface LaneBlock {
  n: number;
  hot: boolean;
  paused: boolean;
}

export interface SuspectState {
  from: string;
  walletAgeSec: number | null;
  mixerFunded: boolean;
  attackerContract: string | null;
  txHash: string;
  blockNumber: number | null;
  explorerUrl: string | null;
  detectedVia: string | null;
  walletSource: string | null;
}

export interface TraceState {
  depth: number;
  reentrancy: boolean;
  frames: TraceFrame[];
}

export interface SimulationState {
  deltaBps: number;
  atRisk: string;
  symbol: string;
  vaultBeforeWei: string | null;
  vaultAfterWei: string | null;
}

export interface VerdictState {
  score: number;
  threshold: number | null;
  action: "pause" | "rejected";
  rules: CreRule[] | null;
}

export interface ReportState {
  reportHex: string;
  writeTxHash?: string;
  writeTxUrl?: string;
}

export interface PauseState {
  txHash: string;
  blockNumber: number | null;
  explorerUrl: string | null;
  onchainSeconds: number | null;
  wallSeconds: number | null;
}

export interface StrikeState {
  txHash: string;
  blockNumber: number | null;
  reason: string;
  explorerUrl: string | null;
  strikeLossWei: string | null;
  probeCostWei: string | null;
}

export interface StepState {
  status: StepStatus;
  time: string;
}

export interface Cues {
  probe: number;
  trace: number;
  sim: number;
  verdict: number;
  report: number;
  pause: number;
  strike: number;
}

export interface WarRoomState {
  playback: Playback;
  phase: Phase;
  heads: Record<ChainId, { block: number | null; latencyMs: number | null }>;
  lanes: Record<ChainId, LaneBlock[]>;
  latencyMs: number | null;
  eventCount: number;
  log: LogLine[];
  seen: string[];
  incidentId: string | null;
  chainId: ChainId | null;
  probeAt: string | null;
  pauseAt: string | null;
  symbol: string | null;
  vaultBalance: string | null;
  vaultAddress: string | null;
  attacker: string | null;
  suspect: SuspectState | null;
  trace: TraceState | null;
  simulation: SimulationState | null;
  creMode: "simulate" | "http" | null;
  verdict: VerdictState | null;
  report: ReportState | null;
  pause: PauseState | null;
  strike: StrikeState | null;
  timeoutLog: string | null;
  steps: Record<StepId, StepState>;
  cues: Cues;
}

export interface WarRoomStage {
  incidentId: string;
  chainId: ChainId;
  stage: WarRoomStageName;
  at: string;
  data: Record<string, unknown>;
}

export type WarRoomEvent =
  | { type: "chain:head"; chainId: ChainId; blockNumber: number; latencyMs: number; at?: string }
  | { type: "activity:new"; chainId: number; txHash?: string; activityType?: string; at?: string }
  | { type: "warroom:stage"; incidentId: string; chainId: ChainId; stage: WarRoomStageName; at: string; data: Record<string, unknown>; mode?: Playback; gapLabel?: string }
  | { type: "hydrate"; stages: WarRoomStage[] }
  | { type: "reset"; clearLog?: boolean; playback?: Playback }
  | { type: "replace"; state: WarRoomState };

const STAGE_SET = new Set<string>(WAR_ROOM_STAGES);

function emptyCues(): Cues {
  return { probe: 0, trace: 0, sim: 0, verdict: 0, report: 0, pause: 0, strike: 0 };
}

function bump(cues: Cues, key: keyof Cues, mode: Playback): Cues {
  if (mode === "instant") return cues;
  return { ...cues, [key]: cues[key] + 1 };
}

function emptySteps(): Record<StepId, StepState> {
  return {
    probe_detected: { status: "idle", time: "" },
    trace_complete: { status: "idle", time: "" },
    simulation_complete: { status: "idle", time: "" },
    cre_verdict: { status: "idle", time: "" },
    report_signed: { status: "idle", time: "" },
    pause_confirmed: { status: "idle", time: "" },
    strike_reverted: { status: "idle", time: "" },
  };
}

export function warRoomInitial(): WarRoomState {
  return {
    playback: "idle",
    phase: "calm",
    heads: {
      56: { block: null, latencyMs: null },
      8453: { block: null, latencyMs: null },
    },
    lanes: { 56: [], 8453: [] },
    latencyMs: null,
    eventCount: 0,
    log: [],
    seen: [],
    incidentId: null,
    chainId: null,
    probeAt: null,
    pauseAt: null,
    symbol: null,
    vaultBalance: null,
    vaultAddress: null,
    attacker: null,
    suspect: null,
    trace: null,
    simulation: null,
    creMode: null,
    verdict: null,
    report: null,
    pause: null,
    strike: null,
    timeoutLog: null,
    steps: emptySteps(),
    cues: emptyCues(),
  };
}

export function isChainId(value: number): value is ChainId {
  return value === 56 || value === 8453;
}

export function isWarRoomStage(value: unknown): value is WarRoomStage {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<WarRoomStage>;
  return (
    typeof row.incidentId === "string" &&
    typeof row.chainId === "number" &&
    isChainId(row.chainId) &&
    typeof row.stage === "string" &&
    STAGE_SET.has(row.stage) &&
    typeof row.at === "string" &&
    !!row.data &&
    typeof row.data === "object"
  );
}

export function chainLabel(chainId: ChainId | null) {
  if (chainId === 56) return "BNB Chain";
  if (chainId === 8453) return "Base";
  return "—";
}

export function chainShort(chainId: number) {
  return chainId === 56 ? "BNB" : chainId === 8453 ? "Base" : String(chainId);
}

export function shortHash(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatWatch(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "T+ 00.0s";
  const safe = Math.max(0, seconds);
  const body = safe.toFixed(1);
  return `T+ ${safe < 10 ? "0" : ""}${body}s`;
}

export function clockOf(iso: string | undefined) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toTimeString().slice(0, 8);
  return date.toTimeString().slice(0, 8);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asBool(value: unknown) {
  return value === true;
}

function explorerChain(chainId: ChainId): Chain {
  return chainFromId(chainId) ?? "bsc";
}

function txLink(chainId: ChainId, hash: string | null, explicit: string | null) {
  if (explicit) return explicit;
  if (!hash) return null;
  return txUrl(explorerChain(chainId), hash);
}

function addressLink(chainId: ChainId, address: string | null) {
  if (!address) return null;
  return addressUrl(explorerChain(chainId), address);
}

function rel(probeAt: string | null, at: string) {
  if (!probeAt) return "";
  const seconds = (Date.parse(at) - Date.parse(probeAt)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  return `+${Math.max(0, seconds).toFixed(1)}s`;
}

function stageKey(stage: { incidentId: string; stage: string; at: string }) {
  return `${stage.incidentId}:${stage.stage}:${stage.at}`;
}

function pushLog(state: WarRoomState, at: string | undefined, parts: LogPart[]): WarRoomState {
  const line: LogLine = {
    id: `${at ?? ""}:${state.log.length}:${parts.map((part) => part.text).join("|")}`,
    at: at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString(),
    time: clockOf(at),
    parts,
  };
  const log = [...state.log, line].sort((left, right) => Date.parse(left.at) - Date.parse(right.at)).slice(-40);
  return { ...state, log };
}

function mergeReportLog(state: WarRoomState, at: string, writeTxHash: string | undefined, writeTxUrl: string | undefined): WarRoomState {
  if (!writeTxHash || !writeTxUrl) return state;
  const index = state.log.findLastIndex((line) => line.parts.some((part) => part.text === "Report signed" || part.text === "report signed"));
  if (index < 0) {
    return pushLog(state, at, [
      { text: "Report signed", tone: "blu" },
      { text: ` · ${shortHash(writeTxHash)}`, href: writeTxUrl },
    ]);
  }
  const line = state.log[index];
  if (line.parts.some((part) => part.href === writeTxUrl)) return state;
  const log = state.log.slice();
  log[index] = { ...line, parts: [...line.parts, { text: ` · ${shortHash(writeTxHash)}`, href: writeTxUrl }] };
  return { ...state, log };
}

function remember(state: WarRoomState, key: string): WarRoomState {
  if (state.seen.includes(key)) return state;
  return { ...state, seen: [...state.seen, key].slice(-200) };
}

function withBlock(blocks: LaneBlock[], blockNumber: number, flag?: "hot" | "paused") {
  const next = blocks.map((block) =>
    block.n === blockNumber
      ? { ...block, hot: block.hot || flag === "hot", paused: block.paused || flag === "paused" }
      : block,
  );
  if (next.some((block) => block.n === blockNumber)) return next.slice(-26);
  return [...next, { n: blockNumber, hot: flag === "hot", paused: flag === "paused" }].slice(-26);
}

function clearIncident(state: WarRoomState, clearLog = false): WarRoomState {
  return {
    ...state,
    phase: "calm",
    incidentId: null,
    chainId: state.chainId,
    probeAt: null,
    pauseAt: null,
    symbol: null,
    vaultBalance: null,
    vaultAddress: null,
    attacker: null,
    suspect: null,
    trace: null,
    simulation: null,
    creMode: null,
    verdict: null,
    report: null,
    pause: null,
    strike: null,
    timeoutLog: null,
    steps: emptySteps(),
    cues: emptyCues(),
    log: clearLog ? [] : state.log,
  };
}

function activateNext(steps: Record<StepId, StepState>, id: StepId) {
  const index = PIPELINE_STEPS.findIndex(([key]) => key === id);
  const nextId = PIPELINE_STEPS[index + 1]?.[0];
  if (!nextId || steps[nextId].status === "done" || steps[nextId].status === "bad") return steps;
  const cleared = { ...steps };
  for (const [key] of PIPELINE_STEPS) {
    if (cleared[key].status === "active") cleared[key] = { ...cleared[key], status: "idle" };
  }
  cleared[nextId] = { ...cleared[nextId], status: "active" };
  return cleared;
}

function completeStep(steps: Record<StepId, StepState>, id: StepId, at: string, probeAt: string | null, bad = false, gapLabel?: string) {
  const status: StepStatus = bad ? "bad" : "done";
  const next = { ...steps, [id]: { status, time: !bad && gapLabel ? gapLabel : rel(probeAt, at) } };
  return bad ? next : activateNext(next, id);
}

const REPLAY_NAMES: Record<string, string> = {
  probe_detected: "probe",
  trace_complete: "trace",
  simulation_complete: "sim",
  cre_submitted: "cre",
  cre_verdict: "verdict",
  report_signed: "report",
  pause_confirmed: "pause",
  strike_reverted: "strike",
  cre_timeout: "timeout",
};

export const REPLAY_GAP_CAP_MS = 4000;

export function replayGapLabel(stage: string, gapMs: number) {
  if (gapMs <= REPLAY_GAP_CAP_MS) return undefined;
  const name = REPLAY_NAMES[stage] ?? stage;
  const seconds = gapMs / 1000;
  if (seconds >= 3600) return `${name} +${Math.round(seconds / 3600)} h later`;
  if (seconds >= 60) return `${name} +${Math.round(seconds / 60)} min later`;
  return `${name} +${Math.round(seconds)}s later`;
}

function parseFrames(value: unknown): TraceFrame[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = asString(row.label);
    if (!label) return [];
    const depth = asNumber(row.depth) ?? 0;
    const frame: TraceFrame = { depth, label };
    if (row.reentry === true) frame.reentry = true;
    return [frame];
  });
}

function parseRules(value: unknown): CreRule[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = asString(row.id);
    if (!id) return [];
    return [{ id, label: asString(row.label) ?? id, points: asNumber(row.points), hit: asBool(row.hit) }];
  });
}

function ageText(seconds: number | null) {
  if (seconds == null) return "unknown";
  if (seconds < 60) return `${Math.round(seconds)} sec old`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min old`;
  return `${(seconds / 3600).toFixed(1)} h old`;
}

function applyStage(state: WarRoomState, stage: WarRoomStage, mode: Playback, gapLabel?: string): WarRoomState {
  const key = stageKey(stage);
  if (mode !== "replay" && state.seen.includes(key)) return state;
  let next = remember(state, key);
  if (next.incidentId && next.incidentId !== stage.incidentId && stage.stage === "probe_detected") {
    next = clearIncident(next);
    next = remember(next, key);
  }
  if (next.incidentId && next.incidentId !== stage.incidentId && stage.stage !== "probe_detected") return state;
  const data = stage.data;
  const playback = mode === "idle" ? "live" : mode;
  next = { ...next, playback, incidentId: stage.incidentId, chainId: stage.chainId };

  switch (stage.stage) {
    case "probe_detected": {
      const txHash = asString(data.txHash) ?? "";
      const from = asString(data.from) ?? "";
      const attacker = asString(data.attackerContract);
      const blockNumber = asNumber(data.blockNumber);
      const walletAgeSec = asNumber(data.walletAgeSec);
      const mixerFunded = asBool(data.mixerFunded);
      const symbol = asString(data.symbol);
      const vaultBalance = asString(data.vaultBalance);
      const vaultAddress = asString(data.vaultAddress);
      const explorerUrl = txLink(stage.chainId, txHash, asString(data.explorerUrl));
      const detectedVia = asString(data.detectedVia);
      const walletSource = asString(data.walletSource);
      next = {
        ...next,
        phase: "threat",
        probeAt: stage.at,
        pauseAt: null,
        symbol,
        vaultBalance,
        vaultAddress,
        attacker,
        suspect: { from, walletAgeSec, mixerFunded, attackerContract: attacker, txHash, blockNumber, explorerUrl, detectedVia, walletSource },
        trace: null,
        simulation: null,
        creMode: null,
        verdict: null,
        report: null,
        pause: null,
        strike: null,
        timeoutLog: null,
        steps: completeStep(emptySteps(), "probe_detected", stage.at, stage.at, false, gapLabel),
        cues: bump(emptyCues(), "probe", playback),
        lanes:
          blockNumber == null
            ? next.lanes
            : { ...next.lanes, [stage.chainId]: withBlock(next.lanes[stage.chainId], blockNumber, "hot") },
        heads:
          blockNumber == null
            ? next.heads
            : { ...next.heads, [stage.chainId]: { ...next.heads[stage.chainId], block: blockNumber } },
      };
      const probeParts: LogPart[] = [
        { text: "Probe detected", tone: "red" },
        { text: walletAgeSec == null ? " · age unknown" : ` · ${ageText(walletAgeSec)}`, tone: "red" },
      ];
      if (detectedVia) probeParts.push({ text: ` · ${detectedVia}`, tone: "muted" });
      if (walletSource) probeParts.push({ text: ` · ${walletSource}`, tone: "muted" });
      if (mixerFunded) probeParts.push({ text: " · mixer-funded", tone: "red" });
      if (explorerUrl && txHash) probeParts.push({ text: ` · ${shortHash(txHash)}`, href: explorerUrl });
      return pushLog(next, stage.at, probeParts);
    }
    case "trace_complete": {
      const frames = parseFrames(data.frames);
      const depth = asNumber(data.depth) ?? frames.reduce((max, frame) => Math.max(max, frame.depth), 0);
      const reentrancy = asBool(data.reentrancy) || frames.some((frame) => frame.reentry);
      next = {
        ...next,
        trace: { depth, reentrancy, frames },
        steps: completeStep(next.steps, "trace_complete", stage.at, next.probeAt, false, gapLabel),
        cues: bump(next.cues, "trace", playback),
      };
      return pushLog(next, stage.at, [
        { text: "Trace: ", tone: "tea" },
        { text: reentrancy ? `re-entry at depth ${depth}` : `depth ${depth}`, tone: reentrancy ? "red" : undefined },
      ]);
    }
    case "simulation_complete": {
      const deltaBps = asNumber(data.deltaBps) ?? 0;
      const atRisk = asString(data.atRisk) ?? "";
      const symbol = asString(data.symbol) ?? next.symbol ?? "";
      const pct = deltaBps / 100;
      next = {
        ...next,
        symbol: symbol || next.symbol,
        simulation: {
          deltaBps,
          atRisk,
          symbol,
          vaultBeforeWei: asString(data.vaultBeforeWei),
          vaultAfterWei: asString(data.vaultAfterWei),
        },
        steps: completeStep(next.steps, "simulation_complete", stage.at, next.probeAt, false, gapLabel),
        cues: bump(next.cues, "sim", playback),
      };
      return pushLog(next, stage.at, [
        { text: "Simulated strike: ", tone: "tea" },
        { text: `vault ${pct > 0 ? "−" : ""}${Math.abs(pct).toFixed(0)}%`, tone: "red" },
        { text: atRisk ? ` (${atRisk}${symbol ? ` ${symbol}` : ""})` : "" },
      ]);
    }
    case "cre_submitted": {
      const modeName = data.mode === "http" || data.mode === "simulate" ? data.mode : null;
      next = { ...next, creMode: modeName };
      return pushLog(next, stage.at, [
        { text: "Evidence sent to Chainlink CRE", tone: "blu" },
        ...(modeName ? [{ text: ` · ${modeName}`, tone: "muted" as const }] : []),
      ]);
    }
    case "cre_verdict": {
      const score = asNumber(data.score) ?? 0;
      const threshold = asNumber(data.threshold);
      const action = data.action === "rejected" ? "rejected" : "pause";
      const rules = Object.prototype.hasOwnProperty.call(data, "rules") ? parseRules(data.rules) : null;
      next = {
        ...next,
        verdict: { score, threshold, action, rules },
        steps: completeStep(next.steps, "cre_verdict", stage.at, next.probeAt, false, gapLabel),
        cues: bump(next.cues, "verdict", playback),
      };
      const parts: LogPart[] = [{ text: "CRE verdict: ", tone: "blu" }, { text: `score ${score}` }];
      if (threshold != null) parts.push({ text: ` ≥ ${threshold}` });
      parts.push({ text: ` → ${action}` });
      return pushLog(next, stage.at, parts);
    }
    case "report_signed": {
      const incomingHex = asString(data.reportHex);
      const incomingHash = asString(data.writeTxHash);
      const previous = next.report;
      const updating = previous != null && next.steps.report_signed.status !== "idle";
      const reportHex = incomingHex || previous?.reportHex || "";
      const writeTxHash = incomingHash ?? previous?.writeTxHash;
      const writeTxUrl = writeTxHash ? txLink(stage.chainId, writeTxHash, null) ?? previous?.writeTxUrl : previous?.writeTxUrl;
      const report = { reportHex, writeTxHash, writeTxUrl };
      if (updating) return mergeReportLog({ ...next, report }, stage.at, writeTxHash, writeTxUrl);
      next = {
        ...next,
        report,
        steps: completeStep(next.steps, "report_signed", stage.at, next.probeAt, false, gapLabel),
        cues: bump(next.cues, "report", playback),
      };
      const parts: LogPart[] = [{ text: "Report signed", tone: "blu" }];
      if (writeTxHash && writeTxUrl) parts.push({ text: ` · ${shortHash(writeTxHash)}`, href: writeTxUrl });
      return pushLog(next, stage.at, parts);
    }
    case "pause_confirmed": {
      const txHash = asString(data.txHash) ?? "";
      const blockNumber = asNumber(data.blockNumber);
      const explorerUrl = txLink(stage.chainId, txHash, asString(data.explorerUrl));
      next = {
        ...next,
        phase: next.verdict?.action === "rejected" ? "threat" : "contained",
        pauseAt: stage.at,
        pause: {
          txHash,
          blockNumber,
          explorerUrl,
          onchainSeconds: asNumber(data.onchainSeconds),
          wallSeconds: asNumber(data.wallSeconds),
        },
        steps: completeStep(next.steps, "pause_confirmed", stage.at, next.probeAt, false, gapLabel),
        cues: bump(next.cues, "pause", playback),
        lanes:
          blockNumber == null
            ? next.lanes
            : { ...next.lanes, [stage.chainId]: withBlock(next.lanes[stage.chainId], blockNumber, "paused") },
      };
      const parts: LogPart[] = [{ text: "Vault paused", tone: "grn" }];
      if (blockNumber != null) parts.push({ text: ` · block #${blockNumber.toLocaleString("en-US")}`, tone: "grn" });
      if (explorerUrl && txHash) parts.push({ text: ` · ${shortHash(txHash)}`, href: explorerUrl, tone: "grn" });
      return pushLog(next, stage.at, parts);
    }
    case "strike_reverted": {
      const txHash = asString(data.txHash) ?? "";
      const reason = asString(data.reason) ?? "reverted";
      const explorerUrl = txLink(stage.chainId, txHash, asString(data.explorerUrl));
      next = {
        ...next,
        strike: {
          txHash,
          blockNumber: asNumber(data.blockNumber),
          reason,
          explorerUrl,
          strikeLossWei: asString(data.strikeLossWei) || "0",
          probeCostWei: asString(data.probeCostWei),
        },
        steps: completeStep(next.steps, "strike_reverted", stage.at, next.probeAt, false, gapLabel),
        cues: bump(next.cues, "strike", playback),
      };
      const parts: LogPart[] = [
        { text: "Strike reverted: ", tone: "red" },
        { text: reason, tone: "red" },
      ];
      if (explorerUrl && txHash) parts.push({ text: ` · ${shortHash(txHash)}`, href: explorerUrl });
      return pushLog(next, stage.at, parts);
    }
    case "cre_timeout": {
      if (next.pause || next.steps.pause_confirmed.status === "done") return next;
      const log = asString(data.log) ?? "";
      const steps =
        next.steps.cre_verdict.status === "done"
          ? next.steps
          : completeStep(next.steps, "cre_verdict", stage.at, next.probeAt, true);
      next = { ...next, timeoutLog: log, steps };
      return pushLog(next, stage.at, [{ text: "CRE timed out", tone: "amb" }]);
    }
    default:
      return next;
  }
}

const OPEN_INCIDENT_MS = 5 * 60 * 1000;

export function incidentInProgress(stages: WarRoomStage[], now = Date.now()) {
  if (stages.some((stage) => stage.stage === "strike_reverted" || stage.stage === "cre_timeout")) return false;
  const probe = stages.find((stage) => stage.stage === "probe_detected");
  if (!probe) return false;
  const at = Date.parse(probe.at);
  return Number.isFinite(at) && now - at >= 0 && now - at < OPEN_INCIDENT_MS;
}

export function newestChainStages(incidents: { chainId?: number; stages?: unknown }[], chainId: ChainId): WarRoomStage[] {
  let bestAt = Number.NEGATIVE_INFINITY;
  let best: WarRoomStage[] = [];
  for (const incident of incidents) {
    if (Number(incident.chainId) !== chainId || !Array.isArray(incident.stages)) continue;
    const stages = incident.stages.filter(isWarRoomStage);
    const probe = stages.find((stage) => stage.stage === "probe_detected");
    const at = probe ? Date.parse(probe.at) : Number.NaN;
    if (!Number.isFinite(at) || at <= bestAt) continue;
    bestAt = at;
    best = stages;
  }
  return best;
}

export function restingSummary(stages: WarRoomStage[]): string | null {
  if (!stages.length) return null;
  const struck = stages.some((stage) => stage.stage === "strike_reverted");
  const timedOut = stages.some((stage) => stage.stage === "cre_timeout");
  const verdict = [...stages].reverse().find((stage) => stage.stage === "cre_verdict");
  const rejected = verdict?.data.action === "rejected";
  if (!struck && !timedOut && !rejected) return null;
  const pause = [...stages].reverse().find((stage) => stage.stage === "pause_confirmed");
  const onchain = pause ? asNumber(pause.data.onchainSeconds) : null;
  if (onchain != null) return `Last incident: paused in ${onchain.toFixed(1)}s`;
  const probe = stages.find((stage) => stage.stage === "probe_detected");
  if (pause && probe) {
    const wall = (Date.parse(pause.at) - Date.parse(probe.at)) / 1000;
    if (Number.isFinite(wall)) return `Last incident: paused in ${Math.max(0, wall).toFixed(1)}s`;
  }
  if (rejected) return "Last incident: no pause";
  if (timedOut) return "Last incident: timed out";
  return "Last incident: strike blocked";
}

export function warRoomReducer(state: WarRoomState, event: WarRoomEvent): WarRoomState {
  switch (event.type) {
    case "replace":
      return event.state;
    case "reset":
      return { ...clearIncident(state, event.clearLog), playback: event.playback ?? "idle" };
    case "hydrate": {
      const keys = new Set(event.stages.map((stage) => stageKey(stage)));
      let next = clearIncident({ ...state, seen: state.seen.filter((key) => !keys.has(key)) });
      for (const stage of event.stages) next = applyStage(next, stage, "instant");
      return { ...next, playback: "instant" };
    }
    case "chain:head": {
      if (!isChainId(event.chainId) || !Number.isFinite(event.blockNumber)) return state;
      return {
        ...state,
        latencyMs: Number.isFinite(event.latencyMs) ? event.latencyMs : state.latencyMs,
        heads: {
          ...state.heads,
          [event.chainId]: {
            block: event.blockNumber,
            latencyMs: Number.isFinite(event.latencyMs) ? event.latencyMs : state.heads[event.chainId].latencyMs,
          },
        },
        lanes: { ...state.lanes, [event.chainId]: withBlock(state.lanes[event.chainId], event.blockNumber) },
      };
    }
    case "activity:new": {
      const hash = event.txHash ?? "";
      const chain = isChainId(event.chainId) ? event.chainId : null;
      const href = chain && hash ? txUrl(explorerChain(chain), hash) : undefined;
      const kind = event.activityType || "event";
      return pushLog(
        { ...state, eventCount: state.eventCount + 1 },
        event.at,
        [
          { text: chainShort(event.chainId), tone: "tea" },
          { text: ` ${kind} ` },
          { text: shortHash(hash), href, tone: "muted" },
        ],
      );
    }
    case "warroom:stage":
      return applyStage(state, event, event.mode ?? "live", event.gapLabel);
    default:
      return state;
  }
}

function positiveWei(value: string | null | undefined) {
  if (!value) return null;
  try {
    const wei = BigInt(value);
    return wei > BigInt(0) ? wei.toString() : null;
  } catch {
    return null;
  }
}

function balanceDrop(before: string | null | undefined, after: string | null | undefined) {
  if (!before || !after) return null;
  try {
    const drop = BigInt(before) - BigInt(after);
    return drop > BigInt(0) ? drop.toString() : null;
  } catch {
    return null;
  }
}

export function resolveProbeCostWei(strike: StrikeState | null, simulation: SimulationState | null) {
  const direct = positiveWei(strike?.probeCostWei);
  if (direct) return direct;
  const fromBalances = balanceDrop(simulation?.vaultBeforeWei, simulation?.vaultAfterWei);
  if (fromBalances) return fromBalances;
  return strike?.probeCostWei === "0" ? "0" : null;
}

export function revertSignature(reason: string | null | undefined) {
  if (!reason) return "";
  const match = reason.match(/[A-Za-z_][A-Za-z0-9_]*\(\)/);
  if (match) return match[0];
  if (/^reverted$/i.test(reason.trim())) return "";
  return reason;
}

export function addressHref(chainId: ChainId | null, address: string | null) {
  if (!chainId || !address) return null;
  return addressLink(chainId, address);
}

export function chainNative(chainId: ChainId | null) {
  if (!chainId) return "";
  const chain = chainFromId(chainId);
  return chain ? chainMeta[chain].symbol : "";
}
