import { PrismaClient } from "@prisma/client";

const id = "0x9990e3c480f2e06d231b3e388f1bb16ac59fbe6313849eee172d1a5d4d4b43c0";
const prisma = new PrismaClient();
const row = await prisma.incident.findUnique({ where: { id }, include: { protocol: true } });
const all = await prisma.incident.findMany({
  select: { id: true, status: true, source: true, score: true, suspectTxHash: true },
  orderBy: { detectedAt: "desc" },
});
if (!row) {
  console.log(JSON.stringify({ missing: true, all }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}
const watched = row.attacker
  ? await prisma.watchedWallet.findUnique({ where: { address_chainId: { address: row.attacker, chainId: row.chainId } } })
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

function summarizeFrame(frame, depth = 0) {
  if (!frame || depth > 6) return null;
  return {
    type: frame.type,
    from: frame.from,
    to: frame.to,
    input: typeof frame.input === "string" ? frame.input.slice(0, 10) : undefined,
    value: frame.value,
    calls: (frame.calls ?? []).slice(0, 8).map((child) => summarizeFrame(child, depth + 1)),
  };
}

const trace = row.trace ?? {};
console.log(
  JSON.stringify(
    {
      all,
      id: row.id,
      status: row.status,
      source: row.source,
      score: row.score,
      chainId: row.chainId,
      protocol: { id: row.protocol.id, name: row.protocol.name, vault: row.protocol.vaultAddress, guardian: row.protocol.guardianAddress, admin: row.protocol.adminAddress },
      attacker: row.attacker,
      attackerContract: row.attackerContract,
      suspectTxHash: row.suspectTxHash,
      pauseTxHash: row.pauseTxHash,
      strikeTxHash: row.strikeTxHash,
      valueAtRiskWei: row.valueAtRiskWei,
      vaultBalanceWei: row.vaultBalanceWei,
      detectedAt: row.detectedAt,
      sentAt: row.sentAt,
      pausedAt: row.pausedAt,
      strikeAt: row.strikeAt,
      explanation: row.explanation,
      creRunLog: row.creRunLog?.slice(0, 800),
      reasons: row.reasons,
      features: row.features,
      watched: watched && { fundingTx: watched.fundingTx, firstFundedAt: watched.firstFundedAt, source: watched.source },
      allowlist: allowlist && { txHash: allowlist.txHash, at: allowlist.at, type: allowlist.type },
      deploy: deploy && { txHash: deploy.txHash, at: deploy.at },
      probeRoot: summarizeFrame(trace.probe),
      simRoot: summarizeFrame(trace.simulation),
      stateDiffKeys: trace.stateDiff ? Object.keys(trace.stateDiff) : null,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
