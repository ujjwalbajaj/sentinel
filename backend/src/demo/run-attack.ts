import { randomUUID } from "node:crypto";
import { getAddress, parseEther, type Hex } from "viem";
import { chainById, explorerTx, isSet } from "../config/chains.js";
import { prisma } from "../db/client.js";
import { HttpError } from "../http-error.js";
import { incidentBalanceLoss } from "../incidents/balance-loss.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { readContractValue } from "../shared/call.js";
import { vaultAbi } from "../shared/load-abi.js";
import { liveVaultWei } from "../vaults.js";
import { runDemo, type DemoConfirmation, type DemoTx } from "./actions.js";
import { acquireDemo, releaseDemo } from "./lock.js";
import { publishStrikeReverted } from "../warroom/strike-stage.js";
import { revertSignature } from "./revert.js";

const STEPS = [
  ["recycle", "Recycle"],
  ["fund-fresh-wallet", "Fund fresh wallet"],
  ["allowlist-fresh-wallet", "Allowlist fresh wallet"],
  ["deploy-attacker", "Deploy attacker"],
  ["probe", "Probe"],
] as const;

export interface DemoStepEvent {
  runId: string;
  step: string;
  status: "pending" | "running" | "done" | "failed";
  title: string;
  detail: string;
  txHashes: string[];
  explorerUrls: string[];
  feeWei: string;
  startedAt: string | null;
  endedAt: string | null;
  countdownEndsAt?: string;
  sentinel?: string;
  outcome?: "reverted" | "drained";
  reason?: string;
  vaultBeforeWei?: string;
  vaultAfterWei?: string;
}

export async function beginAttackRun(chainId: number, strikeDelaySec: number): Promise<{ runId: string }> {
  const busy = acquireDemo("run");
  if (busy === "run") throw new HttpError("A demo run is already in progress", 409);
  if (busy === "action") throw new HttpError("Another demo action is running", 409);
  const runId = randomUUID();
  try {
    await assertVaultReady(chainId);
  } catch (error) {
    releaseDemo();
    throw error;
  }
  void execute(runId, chainId, strikeDelaySec).finally(() => releaseDemo());
  return { runId };
}

async function assertVaultReady(chainId: number): Promise<void> {
  const chain = chainById(chainId);
  if (!chain) throw new HttpError("chainId must be 56 or 8453", 400);
  if (!isSet(chain.deployment.vault)) throw new HttpError("Vault is empty", 400);
  const vault = getAddress(chain.deployment.vault);
  const paused = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "paused");
  const wei = await liveVaultWei(chain, vault, true);
  if (paused && wei === 0n) throw new HttpError("Vault is paused and empty", 400);
  if (paused) throw new HttpError("Vault is paused", 400);
  if (wei === 0n) throw new HttpError("Vault is empty", 400);
}

async function execute(runId: string, chainId: number, strikeDelaySec: number): Promise<void> {
  let probeTx: string | null = null;
  let probeAt = Date.now();
  try {
    for (const [step, title] of STEPS) {
      const finished = await runStep(runId, chainId, step, title, () => action(chainId, step));
      if (step === "probe") {
        probeTx = finished.txHash;
        probeAt = Date.now();
      }
      if (!finished.ok) return;
    }
    await countdown(runId, chainId, strikeDelaySec, probeTx, probeAt);
    await runStep(runId, chainId, "strike", "Strike", () => action(chainId, "strike"), (result) => strikeOutcome(chainId, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo run failed";
    log.info({ runId, chainId, err: message }, "demo run failed");
    emit({
      runId,
      step: "run",
      status: "failed",
      title: "Run attack",
      detail: message,
      txHashes: [],
      explorerUrls: [],
      feeWei: "0",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });
  }
}

async function action(chainId: number, step: string): Promise<DemoConfirmation> {
  const result = await runDemo(chainId, step);
  if (!("txs" in result)) {
    return {
      action: step,
      chainId,
      status: "failed",
      label: step,
      txs: [],
      result: { freshWallet: null, attackerContract: null, vaultBalance: null, allowlisted: false, revertReason: null, paused: null },
      error: "Demo action did not return a transaction result",
      line: "Demo action did not return a transaction result",
    };
  }
  return result;
}

async function runStep(
  runId: string,
  chainId: number,
  step: string,
  title: string,
  work: () => Promise<DemoConfirmation>,
  enrich?: (result: DemoConfirmation) => Promise<Partial<DemoStepEvent>>,
): Promise<{ ok: boolean; txHash: string | null }> {
  const base = { runId, step, title, txHashes: [] as string[], explorerUrls: [] as string[], feeWei: "0", detail: "" };
  emit({ ...base, status: "pending", startedAt: null, endedAt: null });
  const startedAt = new Date().toISOString();
  emit({ ...base, status: "running", startedAt, endedAt: null });
  const result = await work();
  const endedAt = new Date().toISOString();
  const txs = result.txs.filter((tx) => tx.hash);
  const done = step === "strike" ? strikeFired(result) : result.status === "confirmed";
  const extra = enrich ? await enrich(result).catch(() => ({})) : {};
  emit({
    ...base,
    ...extra,
    status: done ? "done" : "failed",
    detail: result.error || result.line,
    txHashes: txs.map((tx) => tx.hash),
    explorerUrls: txs.map((tx) => tx.explorerUrl),
    feeWei: feeOf(txs),
    startedAt,
    endedAt,
  });
  log.info({ runId, chainId, step, status: done ? "done" : "failed" }, "demo step");
  return { ok: done, txHash: txs.at(-1)?.hash ?? null };
}

function strikeFired(result: DemoConfirmation): boolean {
  return result.txs.some((tx) => tx.hash && tx.status !== "failed");
}

async function countdown(runId: string, chainId: number, strikeDelaySec: number, probeTx: string | null, probeAt: number): Promise<void> {
  const title = "Countdown";
  const base = { runId, step: "countdown", title, txHashes: [] as string[], explorerUrls: [] as string[], feeWei: "0", detail: "" };
  emit({ ...base, status: "pending", startedAt: null, endedAt: null });
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const endsAt = started + strikeDelaySec * 1000;
  const countdownEndsAt = new Date(endsAt).toISOString();
  let sentinel = await sentinelState(chainId, probeTx, probeAt).catch(() => null);
  emit({
    ...base,
    status: "running",
    detail: `Strike in ${strikeDelaySec}s`,
    startedAt,
    endedAt: null,
    countdownEndsAt,
    ...(sentinel ? { sentinel } : {}),
  });
  while (Date.now() < endsAt) {
    const next = await sentinelState(chainId, probeTx, probeAt).catch(() => null);
    if (next && next !== sentinel) {
      sentinel = next;
      emit({
        ...base,
        status: "running",
        detail: `Strike in ${strikeDelaySec}s`,
        startedAt,
        endedAt: null,
        countdownEndsAt,
        sentinel,
      });
    }
    const slice = Math.min(1_000, endsAt - Date.now());
    if (slice > 0) await sleep(slice);
  }
  const latest = (await sentinelState(chainId, probeTx, probeAt).catch(() => null)) ?? sentinel;
  emit({
    ...base,
    status: "done",
    detail: "Strike starting",
    startedAt,
    endedAt: new Date().toISOString(),
    countdownEndsAt,
    ...(latest ? { sentinel: latest } : {}),
  });
}

async function strikeOutcome(chainId: number, result: DemoConfirmation): Promise<Partial<DemoStepEvent>> {
  const tx = [...result.txs].reverse().find((item) => item.hash && item.status !== "failed");
  if (!tx?.hash) return {};
  const chain = chainById(chainId);
  const outcome = tx.status === "confirmed" ? "drained" : "reverted";
  const extra: Partial<DemoStepEvent> = { outcome };
  if (outcome === "reverted") {
    const traced = chain ? await revertSignature(chain, tx.hash as Hex).catch(() => null) : null;
    extra.reason = traced ?? signatureFrom(result.result.revertReason);
  }
  if (chain && isSet(chain.deployment.vault)) {
    const incident = outcome === "reverted" ? await newestPausedIncident(chain.id, chain.deployment.vault) : null;
    const loss = await incidentBalanceLoss(chain, chain.deployment.vault, incident?.suspectTxHash ?? null, tx.hash).catch(() => null);
    if (loss?.strikeBalanceBeforeWei) extra.vaultBeforeWei = loss.strikeBalanceBeforeWei;
    if (loss?.strikeBalanceAfterWei) extra.vaultAfterWei = loss.strikeBalanceAfterWei;
    if (outcome === "reverted" && incident && tx.status === "reverted") {
      await publishStrikeReverted({
        chain,
        incidentId: incident.id,
        txHash: tx.hash,
        reason: "EnforcedPause()",
        explorerUrl: tx.explorerUrl || explorerTx(chain, tx.hash),
        strikeLossWei: loss?.strikeLossWei ?? "0",
        probeCostWei: loss?.probeCostWei ?? "0",
        from: incident.attacker,
        score: incident.score,
      }).catch((error: unknown) => {
        log.warn({ chainId, tx: tx.hash, err: error instanceof Error ? error.message : String(error) }, "strike stage skipped");
      });
    }
  }
  return extra;
}

async function newestPausedIncident(chainId: number, vault: string): Promise<{ id: string; suspectTxHash: string; attacker: string; score: number } | null> {
  const protocol = await prisma.protocol.findUnique({
    where: { chainId_vaultAddress: { chainId, vaultAddress: getAddress(vault) } },
    select: { id: true },
  });
  if (!protocol) return null;
  const rows = await prisma.incident.findMany({
    where: { chainId, protocolId: protocol.id },
    orderBy: { detectedAt: "desc" },
    take: 20,
    select: { id: true, suspectTxHash: true, attacker: true, score: true, stages: true },
  });
  const match = rows.find((row) => Array.isArray(row.stages) && (row.stages as { stage?: string }[]).some((stage) => stage.stage === "pause_confirmed"));
  return match ? { id: match.id, suspectTxHash: match.suspectTxHash, attacker: match.attacker, score: match.score } : null;
}

async function sentinelState(chainId: number, probeTx: string | null, probeAt: number): Promise<string | null> {
  if (!probeTx) return null;
  const row = await prisma.incident.findFirst({
    where: { chainId, suspectTxHash: probeTx },
    orderBy: { detectedAt: "desc" },
    select: { stages: true },
  });
  return sentinelLabel(row?.stages, probeAt);
}

function signatureFrom(reason: string | null): string {
  if (!reason) return "reverted";
  const known = reason.match(/\b(EnforcedPause|NotAllowlisted|NotVaultAdmin|PauserRoleMissing)\b/);
  if (known) return `${known[1]}()`;
  return reason.endsWith("()") ? reason : reason;
}

function sentinelLabel(stages: unknown, probeAt: number): string | null {
  const list = Array.isArray(stages) ? (stages as { stage?: string; at?: string; data?: Record<string, unknown> }[]) : [];
  const found = (name: string) => list.find((item) => item.stage === name);
  const pause = found("pause_confirmed");
  if (pause) {
    const wall = pause.data?.wallSeconds;
    if (typeof wall === "number") return `paused at +${wall}s`;
    const at = pause.at ? Date.parse(pause.at) : Number.NaN;
    const probe = found("probe_detected");
    const from = probe?.at ? Date.parse(probe.at) : probeAt;
    if (Number.isFinite(at) && Number.isFinite(from)) return `paused at +${Math.max(0, Math.round((at - from) / 1000))}s`;
    return "paused";
  }
  if (found("cre_verdict") || found("report_signed")) return "CRE verdict";
  if (found("trace_complete") || found("simulation_complete") || found("cre_submitted")) return "Threat";
  if (found("probe_detected")) return "Watching";
  return null;
}

function feeOf(txs: DemoTx[]): string {
  let total = 0n;
  for (const tx of txs) {
    if (!tx.gasCostNative) continue;
    try {
      total += parseEther(tx.gasCostNative);
    } catch {
      continue;
    }
  }
  return total.toString();
}

function emit(event: DemoStepEvent): void {
  live("demo:step", event);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
