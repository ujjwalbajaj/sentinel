import { getAddress, type Hex } from "viem";
import type { ChainRuntime } from "../config/chains.js";
import { isSet } from "../config/chains.js";
import { prisma } from "../db/client.js";
import { log } from "../log.js";
import { requireEvent, mixerAbi } from "../shared/load-abi.js";

const withdrawalEvent = requireEvent(mixerAbi, "Withdrawal");
const TWO_HOURS = 7_200n;
const CHUNK = 2_000n;

export type WalletSource = "watcher" | "lookup" | "unknown";

export interface WalletEvidence {
  mixerFunded: boolean;
  walletAgeSec: number | null;
  walletSource: WalletSource;
  firstFundedAt: string | null;
}

export async function resolveWallet(chain: ChainRuntime, wallet: string, asOfUnix: number): Promise<WalletEvidence> {
  const address = getAddress(wallet);
  const watched = await prisma.watchedWallet.findUnique({
    where: { chainId_address: { chainId: chain.id, address } },
  });
  if (watched?.fundingSource === "mixer" && watched.firstFundedAt) {
    const evidence = evidenceFrom(watched.firstFundedAt, asOfUnix, "watcher");
    log.info({ chainId: chain.id, address, ...evidence }, "wallet evidence");
    return evidence;
  }
  const found = await lookupMixerFunding(chain, address);
  if (found) {
    await prisma.watchedWallet.upsert({
      where: { chainId_address: { chainId: chain.id, address } },
      create: {
        address,
        chainId: chain.id,
        firstFundedAt: found.at,
        fundingSource: "mixer",
        fundingTx: found.txHash,
      },
      update: {
        firstFundedAt: found.at,
        fundingSource: "mixer",
        fundingTx: found.txHash,
      },
    });
    const evidence = evidenceFrom(found.at, asOfUnix, "lookup");
    log.info({ chainId: chain.id, address, fundingTx: found.txHash, ...evidence }, "wallet evidence");
    return evidence;
  }
  const evidence: WalletEvidence = {
    mixerFunded: false,
    walletAgeSec: null,
    walletSource: "unknown",
    firstFundedAt: null,
  };
  log.warn({ chainId: chain.id, address, walletSource: "unknown" }, "wallet age unknown; not sending a default age");
  return evidence;
}

function evidenceFrom(fundedAt: Date, asOfUnix: number, walletSource: WalletSource): WalletEvidence {
  const fundedUnix = Math.floor(fundedAt.getTime() / 1000);
  return {
    mixerFunded: true,
    walletAgeSec: Math.max(0, asOfUnix - fundedUnix),
    walletSource,
    firstFundedAt: fundedAt.toISOString(),
  };
}

async function lookupMixerFunding(chain: ChainRuntime, address: Hex): Promise<{ at: Date; txHash: Hex } | null> {
  if (!isSet(chain.deployment.mixer)) return null;
  const mixer = getAddress(chain.deployment.mixer);
  const head = await chain.http().getBlockNumber();
  const from = await blockAboutTwoHoursAgo(chain, head);
  let earliest: { at: Date; txHash: Hex; block: bigint } | null = null;
  for (let start = from; start <= head; start += CHUNK) {
    const end = start + CHUNK - 1n > head ? head : start + CHUNK - 1n;
    const logs = await chain.http().getLogs({
      address: mixer,
      event: withdrawalEvent,
      args: { to: address },
      fromBlock: start,
      toBlock: end,
    });
    for (const item of logs) {
      const seconds = timestampOf(item.args);
      if (seconds == null || !item.transactionHash || item.blockNumber == null) continue;
      if (earliest && item.blockNumber >= earliest.block) continue;
      earliest = { at: new Date(seconds * 1000), txHash: item.transactionHash, block: item.blockNumber };
    }
  }
  return earliest ? { at: earliest.at, txHash: earliest.txHash } : null;
}

async function blockAboutTwoHoursAgo(chain: ChainRuntime, head: bigint): Promise<bigint> {
  const tip = await chain.http().getBlock({ blockNumber: head });
  const sample = head > 200n ? head - 200n : 0n;
  const past = await chain.http().getBlock({ blockNumber: sample });
  const elapsed = BigInt(tip.timestamp) - BigInt(past.timestamp);
  const span = elapsed > 0n ? (TWO_HOURS * (head - sample)) / elapsed + 50n : 20_000n;
  return head > span ? head - span : 0n;
}

function timestampOf(args: unknown): number | null {
  if (!args || typeof args !== "object" || !("timestamp" in args)) return null;
  const value = (args as { timestamp?: unknown }).timestamp;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) return Number(value);
  return null;
}
