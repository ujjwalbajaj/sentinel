import type { FastifyInstance } from "fastify";
import type { Incident, Protocol } from "@prisma/client";
import { getAddress } from "viem";
import { z } from "zod";
import { chainById, explorerAddress, explorerTx, isSet, mainnetChains } from "../config/chains.js";
import { prisma } from "../db/client.js";
import { incidentBalanceLoss, type IncidentBalanceLoss } from "../incidents/balance-loss.js";
import { HttpError } from "../http-error.js";
import { log } from "../log.js";
import { nativeUsd, weiToUsd } from "../prices.js";
import { formatNativeAmount, liveVaultWei } from "../vaults.js";
import { sessionOf } from "./auth.js";

interface TimelineStep {
  step: "fund" | "allowlist" | "deploy" | "probe" | "detected" | "cre_sent" | "exploit_blocked" | "strike_reverted";
  txHash: string | null;
  at: string | null;
  explorerUrl: string | null;
}

export function registerReads(app: FastifyInstance): void {
  app.get("/warroom/current", async (request) => {
    const query = z.object({ chainId: z.coerce.number() }).parse(request.query);
    if (query.chainId !== 56 && query.chainId !== 8453) throw new HttpError("chainId must be 56 or 8453", 400);
    const row = await prisma.incident.findFirst({
      where: {
        chainId: query.chainId,
        detectedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        status: { not: "ignored" },
      },
      orderBy: { detectedAt: "desc" },
    });
    if (!row) return { incident: null };
    return {
      incident: {
        id: row.id,
        chainId: row.chainId,
        status: row.status,
        suspectTxHash: row.suspectTxHash,
        stages: Array.isArray(row.stages) ? row.stages : [],
      },
    };
  });

  app.get("/incidents/:id/stages", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.incident.findUnique({ where: { id: params.id }, select: { stages: true } });
    if (!row) throw new HttpError("Incident not found", 404);
    return { stages: Array.isArray(row.stages) ? row.stages : [] };
  });

  app.get("/incidents", async () => {
    const rows = await prisma.incident.findMany({ orderBy: { detectedAt: "desc" }, take: 100, include: { protocol: true } });
    return { incidents: await Promise.all(rows.map((row) => presentIncident(row))) };
  });

  app.get("/incidents/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.incident.findUnique({ where: { id: params.id }, include: { protocol: true } });
    if (!row) throw new HttpError("Incident not found", 404);
    return presentIncident(row);
  });

  app.get("/incidents/:id/postmortem.pdf", async (request, reply) => {
    sessionOf(request.headers.cookie);
    const params = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.incident.findUnique({ where: { id: params.id } });
    if (!row) throw new HttpError("Incident not found", 404);
    const body = row.explanation || "This incident does not have an explanation yet.";
    reply.header("content-type", "application/pdf");
    return reply.send(simplePdf(`SENTINEL post-mortem ${row.id}`, body));
  });

  app.get("/activity", async (request) => {
    const query = z.object({
      chainId: z.coerce.number().optional(),
      limit: z.coerce.number().int().positive().max(200).default(50),
    }).parse(request.query);
    const rows = await prisma.activityEvent.findMany({
      where: query.chainId ? { chainId: query.chainId } : undefined,
      orderBy: { at: "desc" },
      take: query.limit,
    });
    return {
      activity: rows.map((row) => ({
        ...row,
        at: row.at.toISOString(),
        explorerUrl: linkTx(row.chainId, row.txHash),
      })),
    };
  });

  app.get("/stats", async () => {
    const protocols = await prisma.protocol.findMany({ where: { status: { in: ["protected", "paused"] } } });
    const protectedByChain = new Map<number, bigint>();
    for (const protocol of protocols) {
      const chain = chainById(protocol.chainId);
      if (!chain || !isSet(protocol.vaultAddress)) continue;
      const balance = await liveVaultWei(chain, getAddress(protocol.vaultAddress));
      protectedByChain.set(protocol.chainId, (protectedByChain.get(protocol.chainId) ?? 0n) + balance);
    }
    const chains = [];
    let protectedUsd: number | null = 0;
    for (const chain of mainnetChains()) {
      const wei = protectedByChain.get(chain.id) ?? 0n;
      const usd = weiToUsd(wei, wei === 0n ? 0 : await nativeUsd(chain));
      if (usd == null) protectedUsd = null;
      else if (protectedUsd != null) protectedUsd += usd;
      chains.push({
        chainId: chain.id,
        native: chain.native,
        amount: formatNativeAmount(wei),
        wei: wei.toString(),
        usd: usd == null ? null : round2(usd),
      });
    }
    const counted = { status: { in: ["paused", "reverted_strike"] }, NOT: { source: { in: ["test", "resend"] } } };
    const blocked = await prisma.incident.count({ where: counted });
    const pausedRows = await prisma.incident.findMany({
      where: counted,
      select: {
        features: true,
        pausedAt: true,
        suspectTxHash: true,
        strikeTxHash: true,
        protocol: { select: { vaultAddress: true, chainId: true } },
      },
    });
    const scored = pausedRows
      .filter((row) => (row.features as { resent?: boolean }).resent !== true)
      .map((row) => {
        const features = row.features as { timings?: { probeToPausedSec?: number | null } };
        const seconds = typeof features.timings?.probeToPausedSec === "number" ? features.timings.probeToPausedSec : null;
        return { seconds, pausedAt: row.pausedAt };
      })
      .filter((row): row is { seconds: number; pausedAt: Date | null } => row.seconds !== null);
    const samples = scored.map((row) => row.seconds);
    const lastIncidentSeconds = scored.sort((left, right) => (right.pausedAt?.getTime() ?? 0) - (left.pausedAt?.getTime() ?? 0))[0]?.seconds ?? null;
    const lostByChain = new Map<number, bigint>();
    for (const row of pausedRows) {
      const chain = chainById(row.protocol.chainId);
      if (!chain || !isSet(row.protocol.vaultAddress)) continue;
      const loss = await safeBalanceLoss(chain, row.protocol.vaultAddress, row.suspectTxHash, row.strikeTxHash);
      const lost = BigInt(loss?.strikeLossWei ?? "0");
      if (lost === 0n) continue;
      lostByChain.set(row.protocol.chainId, (lostByChain.get(row.protocol.chainId) ?? 0n) + lost);
    }
    const fundsLost = [];
    let fundsLostUsd: number | null = 0;
    for (const chain of mainnetChains()) {
      const wei = lostByChain.get(chain.id) ?? 0n;
      const usd = weiToUsd(wei, wei === 0n ? 0 : await nativeUsd(chain));
      if (usd == null) fundsLostUsd = null;
      else if (fundsLostUsd != null) fundsLostUsd += usd;
      fundsLost.push({ chainId: chain.id, native: chain.native, wei: wei.toString(), usd: usd == null ? null : round2(usd) });
    }
    const protectedWei = chains.reduce((sum, chain) => sum + BigInt(chain.wei), 0n);
    const lostWei = fundsLost.reduce((sum, chain) => sum + BigInt(chain.wei), 0n);
    return {
      valueProtected: { chains, usd: protectedUsd == null ? null : round2(protectedUsd) },
      valueProtectedWei: protectedWei.toString(),
      valueProtectedUsd: protectedUsd == null ? null : round2(protectedUsd),
      attacksBlocked: blocked,
      medianProbeToPauseSeconds: median(samples),
      lastIncidentSeconds,
      fundsLost: { chains: fundsLost, usd: fundsLostUsd == null ? null : round2(fundsLostUsd) },
      fundsLostWei: lostWei.toString(),
      fundsLostUsd: fundsLostUsd == null ? null : round2(fundsLostUsd),
    };
  });
}

async function presentIncident(row: Incident & { protocol?: Protocol }) {
  const chain = chainById(row.chainId);
  const tx = (hash: string | null) => (chain && hash ? explorerTx(chain, hash) : null);
  const address = (value: string) => (chain && value ? explorerAddress(chain, value) : null);
  const loss =
    chain && row.protocol && isSet(row.protocol.vaultAddress)
      ? await safeBalanceLoss(chain, row.protocol.vaultAddress, row.suspectTxHash, row.strikeTxHash)
      : null;
  const price = chain ? await nativeUsd(chain) : null;
  const strikeLossWei = loss?.strikeLossWei ?? "0";
  const probeCostWei = loss?.probeCostWei ?? "0";
  const strikeLossUsd = price == null ? null : weiToUsd(BigInt(strikeLossWei), price);
  const probeCostUsd = price == null ? null : weiToUsd(BigInt(probeCostWei), price);
  return {
    ...row,
    detectedAt: row.detectedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    strikeAt: row.strikeAt?.toISOString() ?? null,
    resent: (row.features as { resent?: boolean }).resent === true,
    creAttempts: Array.isArray((row.features as { creAttempts?: unknown }).creAttempts)
      ? (row.features as { creAttempts: unknown[] }).creAttempts
      : [],
    strikeLossWei,
    probeCostWei,
    strikeBalanceBeforeWei: loss?.strikeBalanceBeforeWei ?? null,
    strikeBalanceAfterWei: loss?.strikeBalanceAfterWei ?? null,
    probeBalanceBeforeWei: loss?.probeBalanceBeforeWei ?? null,
    probeBalanceAfterWei: loss?.probeBalanceAfterWei ?? null,
    strikeLossUsd: strikeLossUsd == null ? null : round2(strikeLossUsd),
    probeCostUsd: probeCostUsd == null ? null : round2(probeCostUsd),
    fundsLostWei: strikeLossWei,
    fundsLostUsd: strikeLossUsd == null ? null : round2(strikeLossUsd),
    links: {
      suspectTx: tx(row.suspectTxHash),
      pauseTx: tx(row.pauseTxHash),
      strikeTx: tx(row.strikeTxHash),
      attacker: address(row.attacker),
      attackerContract: row.attackerContract ? address(row.attackerContract) : null,
      vault: row.protocol ? address(row.protocol.vaultAddress) : null,
      guardian: row.protocol ? address(row.protocol.guardianAddress) : null,
    },
    timeline: await incidentTimeline(row),
  };
}

async function incidentTimeline(row: Incident): Promise<TimelineStep[]> {
  const chain = chainById(row.chainId);
  const link = (hash: string | null) => (chain && hash ? explorerTx(chain, hash) : null);
  const step = (name: TimelineStep["step"], txHash: string | null, at: Date | null): TimelineStep => ({
    step: name,
    txHash,
    at: at?.toISOString() ?? null,
    explorerUrl: link(txHash),
  });
  const watched = row.attacker
    ? await prisma.watchedWallet.findUnique({ where: { chainId_address: { chainId: row.chainId, address: row.attacker } } })
    : null;
  const allowlist = row.attacker
    ? await prisma.activityEvent.findFirst({
        where: { chainId: row.chainId, type: "AllowlistUpdated", from: row.attacker },
        orderBy: { at: "asc" },
      })
    : null;
  const deploy = row.attacker
    ? await prisma.spendLog.findFirst({
        where: { chainId: row.chainId, action: "deploy-attacker", wallet: row.attacker },
        orderBy: { at: "asc" },
      })
    : null;
  const probe = row.suspectTxHash
    ? await prisma.activityEvent.findFirst({ where: { chainId: row.chainId, txHash: row.suspectTxHash }, orderBy: { at: "asc" } })
    : null;
  const features = row.features as { timings?: { probeBlockUnix?: number } };
  const probeAt = probe?.at ?? (features.timings?.probeBlockUnix ? new Date(features.timings.probeBlockUnix * 1000) : null);
  return [
    step("fund", watched?.fundingTx ?? null, watched?.firstFundedAt ?? null),
    step("allowlist", allowlist?.txHash ?? null, allowlist?.at ?? null),
    step("deploy", deploy?.txHash ?? null, deploy?.at ?? null),
    step("probe", row.suspectTxHash || null, probeAt),
    step("detected", row.suspectTxHash || null, row.detectedAt),
    step("cre_sent", null, row.sentAt),
    step("exploit_blocked", row.pauseTxHash, row.pausedAt),
    step("strike_reverted", row.strikeTxHash, row.strikeAt),
  ];
}

async function safeBalanceLoss(
  chain: NonNullable<ReturnType<typeof chainById>>,
  vault: string,
  suspectTxHash: string | null,
  strikeTxHash: string | null,
): Promise<IncidentBalanceLoss | null> {
  try {
    return await incidentBalanceLoss(chain, vault, suspectTxHash, strikeTxHash);
  } catch (error) {
    log.warn({ chainId: chain.id, suspectTxHash, strikeTxHash, err: error instanceof Error ? error.message : String(error) }, "balance loss skipped");
    return null;
  }
}

function linkTx(chainId: number, hash: string): string | null {
  const chain = chainById(chainId);
  return chain ? explorerTx(chain, hash) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function simplePdf(title: string, body: string): Buffer {
  const lines = [title, "", ...wrap(body, 90)];
  const commands = ["BT", "/F1 11 Tf", "54 740 Td"];
  for (const line of lines) {
    commands.push(`(${escapePdf(line)}) Tj`, "0 -16 Td");
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string, width: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}
