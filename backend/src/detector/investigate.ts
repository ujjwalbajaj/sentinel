import { getAddress, toFunctionSelector, type Hex, type PublicClient } from "viem";
import { truncateTrace, type CallFrame, type StateDiff } from "./trace.js";
import { json, recordActivity } from "../activity.js";
import { explorerTx, rpc, type ChainRuntime } from "../config/chains.js";
import { enqueueEvidence, publicIncident } from "../cre/bridge.js";
import { prisma } from "../db/client.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { nativeUsd, weiToUsd } from "../prices.js";
import { ensureProtocol } from "../protocols/store.js";
import { strikeReentries, strikeWei } from "../config/env.js";
import { scoreEvidence } from "../shared/cre/scoring.js";
import type { Evidence as DisplayEvidence } from "../shared/cre/types.js";
import { encodeCall } from "../shared/call.js";
import { crePayload } from "../shared/cre/evidence.js";
import { incidentId } from "../shared/incident-id.js";
import { attackerAbi } from "../shared/load-abi.js";
import { formatNativeAmount, liveVaultWei } from "../vaults.js";
import { flattenTrace } from "../warroom/frames.js";
import { emitStage } from "../warroom/stages.js";
import { reentrancyDetected, shouldInvestigate, touchesVaultWithdraw, withdrawSenders } from "./decide.js";
import { detectionClock } from "./detection-clock.js";
import { resolveWallet } from "./wallet.js";

const WITHDRAW = toFunctionSelector("withdrawAll()");
const DEPOSIT = toFunctionSelector("deposit()");

export type DetectedVia = "wss" | "head" | "poll" | "backfill";

export interface WatchedTx {
  hash: Hex;
  from: Hex;
  to: Hex | null;
  input: Hex;
  value: bigint;
  nonce: number;
  blockNumber: bigint;
  timestamp: bigint;
}

export async function onVaultTransaction(chain: ChainRuntime, tx: WatchedTx, success: boolean): Promise<void> {
  const vault = chain.deployment.vault;
  if (!vault || !tx.to || tx.to.toLowerCase() !== vault.toLowerCase()) return;
  const at = new Date(Number(tx.timestamp) * 1000);
  const selector = tx.input.slice(0, 10).toLowerCase();
  if (!success) {
    await recordActivity({
      chainId: chain.id,
      txHash: tx.hash,
      blockNumber: tx.blockNumber.toString(),
      type: selector === WITHDRAW ? "withdrawn" : "vault_call",
      from: getAddress(tx.from),
      to: getAddress(tx.to),
      valueWei: tx.value.toString(),
      result: "reverted",
      at,
    });
    return;
  }
  if (selector === DEPOSIT) {
    await recordActivity({
      chainId: chain.id,
      txHash: tx.hash,
      blockNumber: tx.blockNumber.toString(),
      type: "deposited",
      from: getAddress(tx.from),
      to: getAddress(tx.to),
      valueWei: tx.value.toString(),
      result: "success",
      at,
    });
    return;
  }
  if (selector === WITHDRAW) {
    await recordActivity({
      chainId: chain.id,
      txHash: tx.hash,
      blockNumber: tx.blockNumber.toString(),
      type: "withdrawn",
      from: getAddress(tx.from),
      to: getAddress(tx.to),
      valueWei: tx.value.toString(),
      result: "success",
      at,
    });
  }
  await investigate(chain, tx, "wss");
}

export async function onAttackerTransaction(chain: ChainRuntime, tx: WatchedTx, success: boolean): Promise<void> {
  if (!success || !tx.to) return;
  const vault = chain.deployment.vault;
  if (vault && tx.to.toLowerCase() === vault.toLowerCase()) return;
  await investigate(chain, tx, "wss");
}

export async function investigate(chain: ChainRuntime, tx: WatchedTx, detectedVia: DetectedVia = "wss"): Promise<void> {
  const vault = chain.deployment.vault;
  if (!vault) return;
  const protocol = await ensureProtocol(chain);
  if (!protocol || protocol.status === "paused") return;
  const sameTx = await prisma.incident.findFirst({
    where: { chainId: chain.id, protocolId: protocol.id, suspectTxHash: tx.hash },
  });
  if (sameTx) return;
  const open = await prisma.incident.findFirst({
    where: { chainId: chain.id, protocolId: protocol.id, status: { in: ["detected", "sent_to_cre"] } },
  });
  if (open) return;

  const client = chain.http();
  const wallet = await resolveWallet(chain, tx.from, Number(tx.timestamp) || Math.floor(Date.now() / 1000));
  const mixerFunded = wallet.mixerFunded;
  const age = wallet.walletAgeSec;
  const vaultBefore = await liveVaultWei(chain, vault);
  const id = incidentId(chain.id, tx.hash);
  const outerContract = tx.to ? getAddress(tx.to) : "";
  await prisma.incident.create({
    data: {
      id,
      chainId: chain.id,
      protocolId: protocol.id,
      suspectTxHash: tx.hash,
      attacker: getAddress(tx.from),
      attackerContract: outerContract,
      score: 0,
      reasons: json([]),
      features: json({}),
      trace: json({}),
      status: "detected",
      stages: json([]),
      detectedAt: new Date(),
      vaultBalanceWei: vaultBefore.toString(),
    },
  });
  const pricePromise = nativeUsd(chain);
  const stage = await emitStage(id, chain.id, "probe_detected", {
    txHash: tx.hash,
    from: getAddress(tx.from),
    attackerContract: outerContract,
    blockNumber: Number(tx.blockNumber),
    blockTimestamp: Number(tx.timestamp),
    walletAgeSec: age,
    mixerFunded,
    walletSource: wallet.walletSource,
    vaultAddress: getAddress(vault),
    vaultBalance: formatNativeAmount(vaultBefore),
    symbol: chain.native,
    explorerUrl: explorerTx(chain, tx.hash),
    detectedVia,
  });
  const blockMs = Number(tx.timestamp) * 1000;
  const detectionLagMs = (stage ? Date.parse(stage.at) : Date.now()) - blockMs;
  const clock = detectionClock(chain.id, tx.blockNumber);
  log.info(
    {
      incidentId: id,
      chainId: chain.id,
      tx: tx.hash,
      detectedVia,
      probeBlockAt: new Date(blockMs).toISOString(),
      headArrivedAt: clock.headArrivedAt ?? null,
      wssArrivedAt: clock.wssArrivedAt ?? null,
      headLogsAt: clock.headLogsAt ?? null,
      probeDetectedAt: stage?.at ?? null,
      detectionLagMs,
    },
    "detection lag",
  );

  let probeTrace: CallFrame;
  try {
    probeTrace = await rpc<CallFrame>(client, "debug_traceTransaction", [tx.hash, { tracer: "callTracer" }]);
  } catch (error) {
    log.error({ tx: tx.hash, err: error instanceof Error ? error.message : String(error) }, "probe trace failed");
    await prisma.incident.update({ where: { id }, data: { status: "ignored" } });
    return;
  }
  if (!touchesVaultWithdraw(probeTrace, vault) && !tx.input.toLowerCase().startsWith(WITHDRAW)) {
    await prisma.incident.update({ where: { id }, data: { status: "ignored" } });
    return;
  }

  const senders = withdrawSenders(probeTrace, vault);
  const sender = senders[0] ? getAddress(senders[0]) : getAddress(tx.from);
  const code = await client.getBytecode({ address: sender });
  const senderIsContract = Boolean(code && code !== "0x");
  const withdrawn = sumWithdrawn(probeTrace, vault);
  const deposited = await depositedWei(chain.id, sender);
  if (
    !shouldInvestigate({
      senderIsContract,
      mixerFunded,
      withdrawnWei: withdrawn,
      depositedWei: deposited,
    })
  ) {
    log.info(
      {
        tx: tx.hash,
        senderIsContract,
        mixerFunded,
        withdrawnWei: withdrawn.toString(),
        depositedWei: deposited.toString(),
      },
      "withdrawal not investigated",
    );
    await prisma.incident.update({ where: { id }, data: { status: "ignored" } });
    return;
  }

  const attackerContract = (senderIsContract ? sender : tx.to && tx.to.toLowerCase() !== vault.toLowerCase() ? getAddress(tx.to) : sender) as Hex;
  const traced = flattenTrace(probeTrace, chain, attackerContract);
  if (reentrancyDetected(probeTrace, vault)) traced.reentrancy = true;
  await emitStage(id, chain.id, "trace_complete", {
    depth: traced.depth,
    reentrancy: traced.reentrancy,
    frames: traced.frames,
  });
  const simulation = await simulateStrike(
    client,
    getAddress(tx.from),
    attackerContract,
    strikeWei(chain.id),
    strikeReentries(),
    vault,
  );
  let deltaBps = 0;
  let valueAtRisk = 0n;
  let reentrancy = reentrancyDetected(probeTrace, vault);
  if (simulation.callTrace) reentrancy = reentrancy || reentrancyDetected(simulation.callTrace, vault);
  if (simulation.ok && simulation.drop !== null && vaultBefore > 0n) {
    valueAtRisk = simulation.drop;
    deltaBps = Number((simulation.drop * 10_000n) / vaultBefore);
  } else {
    log.warn({ tx: tx.hash, err: simulation.error }, "strike simulation failed, using the probe delta");
    valueAtRisk = withdrawn;
    deltaBps = vaultBefore > 0n ? Number((withdrawn * 10_000n) / vaultBefore) : 0;
  }
  const vaultAfter = vaultBefore > valueAtRisk ? vaultBefore - valueAtRisk : 0n;
  await emitStage(id, chain.id, "simulation_complete", {
    vaultBeforeWei: vaultBefore.toString(),
    vaultAfterWei: vaultAfter.toString(),
    deltaBps,
    atRisk: formatNativeAmount(valueAtRisk),
    symbol: chain.native,
  });

  const testSizedCall = valueAtRisk > 0n && withdrawn * 10_000n <= valueAtRisk * 500n;
  const payload = crePayload({
    incidentId: id,
    chainId: chain.id,
    vault,
    suspectTxHash: tx.hash,
    attacker: getAddress(tx.from),
    features: {
      walletAgeSeconds: age,
      mixerFunded,
      reentrancyDetected: reentrancy,
      vaultBalanceDeltaBps: deltaBps,
      flashLoanEntry: false,
      newContractTarget: false,
    },
  });
  enqueueEvidence(id, payload);
  log.info({ id, tx: tx.hash }, "CRE queued after simulation");

  const priceStarted = Date.now();
  const price = await pricePromise;
  log.info({ id, priceMs: Date.now() - priceStarted }, "vault price read");
  const vaultTvlUsd = weiToUsd(vaultBefore, price);
  const display = scoreEvidence({
    incidentId: id,
    chain: creChain(chain.id),
    vault,
    suspectTxHash: tx.hash,
    attacker: getAddress(tx.from),
    features: {
      walletAgeSeconds: age,
      mixerFunded,
      reentrancyDetected: reentrancy,
      vaultBalanceDeltaBps: deltaBps,
      flashLoanEntry: false,
      newContractTarget: false,
    },
  });
  const detectedUnix = Math.floor(Date.now() / 1000);
  const probeBlockUnix = Number(tx.timestamp);
  const features = {
    reentrancyDetected: reentrancy,
    vaultBalanceDeltaBps: deltaBps,
    walletAgeSeconds: age,
    mixerFunded,
    walletSource: wallet.walletSource,
    flashLoanEntry: false as const,
    newContractTarget: false as const,
    testSizedCall,
    deployerNonce: tx.nonce,
    vaultTvlUsd,
    timings: {
      probeBlockUnix,
      detectedUnix,
      sentUnix: null,
      pausedUnix: null,
      probeToDetectedSec: detectedUnix - probeBlockUnix,
      detectedToSentSec: null,
      sentToPausedSec: null,
      probeToPausedSec: null,
      creSpawnMs: null,
      creExitMs: null,
      exploitBlockedSeenMs: null,
      spawnToExitMs: null,
      exitToBlockedMs: null,
    },
  };
  const probeTraceStored = truncateTrace(probeTrace, 6);
  const simulationTraceStored = simulation.callTrace ? truncateTrace(simulation.callTrace, 6) : null;

  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.incident.findUnique({ where: { id } });
    const prev = (existing?.features ?? {}) as { creAttempts?: unknown; timings?: Record<string, unknown> };
    const timings = { ...features.timings } as Record<string, unknown>;
    for (const [key, value] of Object.entries(prev.timings ?? {})) {
      if (value != null) timings[key] = value;
    }
    const kept = existing != null && lockedStatus.has(existing.status);
    return tx.incident.update({
      where: { id },
      data: {
        attackerContract,
        score: display.score,
        reasons: json(display.reasons),
        features: json({ ...features, timings, ...(prev.creAttempts ? { creAttempts: prev.creAttempts } : {}) }),
        trace: json({ probe: probeTraceStored, simulation: simulationTraceStored, stateDiff: simulation.diff }),
        explanation: existing?.explanation ? existing.explanation : "",
        status: kept ? existing.status : "detected",
        valueAtRiskWei: valueAtRisk.toString(),
        vaultBalanceWei: vaultBefore.toString(),
        detectedAt: existing?.detectedAt ?? new Date(detectedUnix * 1000),
      },
    });
  });
  await prisma.activityEvent.updateMany({
    where: {
      chainId: chain.id,
      txHash: tx.hash,
      type: { in: ["Deposited", "Withdrawn", "deposited", "withdrawn"] },
    },
    data: { riskScore: display.score },
  });
  live("incident:detected", publicIncident(row));
  log.info({ id, score: display.score, tx: tx.hash }, "incident detected");
}

const lockedStatus = new Set(["sent_to_cre", "paused", "reverted_strike", "cre_rejected", "false_positive", "ignored"]);

function creChain(chainId: number): DisplayEvidence["chain"] {
  if (chainId === 56) return "bsc";
  if (chainId === 8453) return "base";
  throw new Error(`Chain ${chainId} has no CRE chain key. Expected 56 or 8453.`);
}

function sumWithdrawn(frame: CallFrame, vault: string): bigint {
  let total = 0n;
  const target = vault.toLowerCase();
  const walk = (node: CallFrame) => {
    if ((node.from ?? "").toLowerCase() === target && node.value) total += BigInt(node.value);
    for (const child of node.calls ?? []) walk(child);
  };
  walk(frame);
  return total;
}

async function depositedWei(chainId: number, address: Hex): Promise<bigint> {
  const rows = await prisma.activityEvent.findMany({
    where: { chainId, type: { in: ["deposited", "Deposited"] }, from: address },
  });
  return rows.reduce((sum, row) => sum + BigInt(row.valueWei), 0n);
}

async function simulateStrike(
  client: PublicClient,
  from: Hex,
  to: Hex,
  value: bigint,
  reentries: bigint,
  vault: Hex,
): Promise<{ ok: boolean; drop: bigint | null; callTrace: CallFrame | null; diff: StateDiff | null; error?: string }> {
  if (to.toLowerCase() === from.toLowerCase()) {
    return { ok: false, drop: null, callTrace: null, diff: null, error: "no attacker contract" };
  }
  const data = encodeCall(attackerAbi, "strike", [reentries]);
  const call = { from, to, data, value: `0x${value.toString(16)}`, gas: "0x1e8480" };
  try {
    const diff = await rpc<StateDiff>(client, "debug_traceCall", [
      call,
      "latest",
      { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
    ]);
    const callTrace = await rpc<CallFrame>(client, "debug_traceCall", [call, "latest", { tracer: "callTracer" }]);
    if (callTrace.error) {
      return { ok: false, drop: null, callTrace, diff, error: callTrace.error };
    }
    return { ok: true, drop: dropFromDiff(diff, vault), callTrace, diff };
  } catch (error) {
    return { ok: false, drop: null, callTrace: null, diff: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function dropFromDiff(diff: StateDiff, vault: string): bigint | null {
  if (!diff?.pre || !diff.post) return null;
  const key = Object.keys(diff.pre).find((candidate) => candidate.toLowerCase() === vault.toLowerCase());
  if (!key) return null;
  const before = diff.pre[key]?.balance;
  const after = diff.post[key]?.balance ?? diff.post[key.toLowerCase()]?.balance;
  if (before === undefined || after === undefined) return null;
  const pre = BigInt(before);
  const post = BigInt(after);
  if (post >= pre) return 0n;
  return pre - post;
}
