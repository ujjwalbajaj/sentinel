import { prisma } from "./db/client.js";
import { scoreEvidence } from "./shared/cre/scoring.js";

const UNKNOWN_AGE = 10 * 365 * 24 * 3600;
const VAULT_AMOUNT = new Set(["Deposited", "Withdrawn", "deposited", "withdrawn"]);

export function isVaultAmount(type: string): boolean {
  return VAULT_AMOUNT.has(type);
}

/** Local score from stored wallet facts. No traces and no RPC. */
export async function cheapRiskScore(input: {
  chainId: number;
  address: string;
  type: string;
  valueWei: bigint;
  at: Date;
  blockNumber?: string;
}): Promise<number | null> {
  if (!isVaultAmount(input.type)) return null;
  const watched = await prisma.watchedWallet.findUnique({
    where: { chainId_address: { chainId: input.chainId, address: input.address } },
  });
  const age = watched?.firstFundedAt
    ? Math.max(0, Math.floor(input.at.getTime() / 1000 - watched.firstFundedAt.getTime() / 1000))
    : UNKNOWN_AGE;
  const deposits = await prisma.activityEvent.findMany({
    where: { chainId: input.chainId, from: input.address, type: { in: ["Deposited", "deposited"] } },
    select: { valueWei: true, blockNumber: true, at: true },
  });
  const prior = deposits.filter((row) => {
    if (input.blockNumber && row.blockNumber) return BigInt(row.blockNumber) < BigInt(input.blockNumber);
    return row.at.getTime() <= input.at.getTime();
  });
  const deposited = prior.reduce((sum, row) => sum + BigInt(row.valueWei), 0n);
  const withdraw = input.type === "Withdrawn" || input.type === "withdrawn";
  const overWithdraw = withdraw && input.valueWei > deposited;
  return scoreEvidence({
    incidentId: `0x${"11".repeat(32)}`,
    chain: input.chainId === 56 ? "bsc" : "base",
    vault: `0x${"11".repeat(20)}`,
    suspectTxHash: `0x${"22".repeat(32)}`,
    attacker: `0x${"33".repeat(20)}`,
    features: {
      walletAgeSeconds: age,
      mixerFunded: watched?.fundingSource === "mixer",
      reentrancyDetected: false,
      vaultBalanceDeltaBps: overWithdraw ? 2000 : 0,
      flashLoanEntry: false,
      newContractTarget: false,
    },
  }).score;
}
