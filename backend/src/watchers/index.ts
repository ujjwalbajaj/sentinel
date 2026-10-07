import { decodeEventLog, getAddress, toFunctionSelector, type Abi, type Hex } from "viem";
import { json, recordActivity } from "../activity.js";
import { cheapRiskScore } from "../activity-score.js";
import { explorerTx, isSet, mainnetChains, resetSocket, type ChainRuntime } from "../config/chains.js";
import { clearCreTimeout, publicIncident } from "../cre/bridge.js";
import { noteHeadArrived, noteHeadLogs, noteWssLog } from "../detector/detection-clock.js";
import { prisma } from "../db/client.js";
import { investigate, type DetectedVia, type WatchedTx } from "../detector/investigate.js";
import { explainIncident } from "../explain/explain.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { ensureProtocol } from "../protocols/store.js";
import { guardianAbi, mixerAbi, vaultAbi } from "../shared/load-abi.js";
import { socketBackoffMs } from "../shared/watcher-guard.js";
import { publishStrikeReverted } from "../warroom/strike-stage.js";
import { emitStage, stageAt } from "../warroom/stages.js";

const strikeSelector = toFunctionSelector("strike(uint256)");
const tails = new Map<number, Promise<void>>();
const pauseOnce = new Map<string, Promise<void>>();
const lastSeenBlock = new Map<number, bigint>();
const backfillQueued = new Set<number>();
const backfillAttempts = new Map<number, number>();
const pausePolls = new Set<number>();
const pausePollFrom = new Map<number, bigint>();
const withdrawPolls = new Set<number>();
const withdrawScanned = new Map<number, bigint>();
const strikeScanned = new Map<number, bigint>();
const claimedWithdrawals = new Set<string>();
const scanTails = new Map<number, Promise<void>>();
const HEAD_SCAN_CAP = 25n;
const WITHDRAW_POLL_MS = 2_000;
const LOG_BATCH_MS = 1_500;
const LOG_RANGE_CAP = 200n;
const logBatches = new Set<number>();
const rearmWatchers = new Map<number, () => void>();

export interface SeenExploitBlocked {
  chainId: number;
  txHash: string;
  blockNumber: string;
  incidentId: string;
}

let lastExploitBlocked: SeenExploitBlocked | null = null;

export function latestExploitBlocked(): SeenExploitBlocked | null {
  return lastExploitBlocked;
}

export function chainWatcher(chain: ChainRuntime): "idle" | "live" {
  const configured = isSet(chain.deployment.vault) || isSet(chain.deployment.guardian) || isSet(chain.deployment.mixer);
  return configured ? "live" : "idle";
}

export function watcherStatus(): "idle" | "watching" {
  return mainnetChains().some((chain) => chainWatcher(chain) === "live") ? "watching" : "idle";
}

export function resubscribeWatchers(chain: ChainRuntime): void {
  const rearm = rearmWatchers.get(chain.id);
  if (!rearm) return;
  try {
    rearm();
    log.info({ chainId: chain.id }, "watchers resubscribed");
  } catch (error) {
    log.warn({ chainId: chain.id, err: errorText(error) }, "watcher resubscribe failed");
  }
}

export function startWatchers(): void {
  if (watcherStatus() === "idle") {
    log.info("deployment addresses are empty, watchers idle");
    return;
  }
  for (const chain of mainnetChains()) {
    if (chainWatcher(chain) === "idle") {
      log.info({ chainId: chain.id }, "no addresses in the deployment file, watcher idle");
      continue;
    }
    void supervise(chain);
  }
}

async function supervise(chain: ChainRuntime): Promise<void> {
  startPausePoll(chain);
  startWithdrawalPoll(chain);
  startLogBatch(chain);
  let attempt = 0;
  for (;;) {
    try {
      await catchUp(chain);
      attempt = 0;
      await watchOnce(chain);
    } catch (error) {
      log.error({ chainId: chain.id, err: errorText(error) }, "watcher reconnecting");
      await resetSocket(chain);
      await sleep(socketBackoffMs(attempt));
      attempt += 1;
    }
  }
}

function watchOnce(chain: ChainRuntime): Promise<void> {
  return new Promise((_resolve, reject) => {
    let generation = 0;
    let stops: Array<() => void> = [];
    let resubTimer: ReturnType<typeof setTimeout> | null = null;
    let resubAttempt = 0;
    const clear = () => {
      for (const stop of stops) {
        try {
          stop();
        } catch {
          continue;
        }
      }
      stops = [];
    };
    const noteDrop = (eventName: string, error: unknown) => {
      log.warn({ chainId: chain.id, event: eventName, err: errorText(error) }, "subscription error");
      scheduleBackfill(chain);
      if (socketClosed(error)) return;
      if (resubTimer) return;
      resubTimer = setTimeout(() => {
        resubTimer = null;
        try {
          arm();
          log.info({ chainId: chain.id }, "watchers resubscribed");
          resubAttempt = 0;
        } catch (err) {
          resubAttempt += 1;
          log.warn({ chainId: chain.id, err: errorText(err) }, "watcher resubscribe failed");
          noteDrop(eventName, err);
        }
      }, socketBackoffMs(resubAttempt));
      resubAttempt += 1;
    };
    const arm = () => {
      const token = ++generation;
      clear();
      const socket = chain.socket();
      const onError = (eventName: string) => (error: Error) => {
        if (token !== generation) return;
        noteDrop(eventName, error);
      };
      if (isSet(chain.deployment.mixer)) {
        stops.push(subscribe(socket, chain, chain.deployment.mixer, mixerAbi, "Withdrawal", (item) => ingestWithdrawal(chain, item), onError("Withdrawal")));
      }
      if (isSet(chain.deployment.vault)) {
        const vaultEvents = ["Deposited", "Withdrawn", "PausedBy", "Paused", "Unpaused", "AllowlistUpdated", "RoleGranted"] as const;
        for (const name of vaultEvents) {
          stops.push(
            subscribe(socket, chain, chain.deployment.vault, vaultAbi, name, (item) => dispatchEvent(chain, name, item, true, "wss"), onError(name)),
          );
        }
      }
      if (isSet(chain.deployment.guardian)) {
        stops.push(
          subscribe(socket, chain, chain.deployment.guardian, guardianAbi, "VaultRegistered", (item) => ingestRegistered(chain, item), onError("VaultRegistered")),
        );
        stops.push(
          subscribe(socket, chain, chain.deployment.guardian, guardianAbi, "ExploitBlocked", (item) => ingestBlocked(chain, item), onError("ExploitBlocked")),
        );
      }
      log.info({ chainId: chain.id }, "watching contract events");
    };
    rearmWatchers.set(chain.id, () => {
      if (resubTimer) {
        clearTimeout(resubTimer);
        resubTimer = null;
      }
      arm();
      resubAttempt = 0;
    });
    try {
      arm();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(errorText(error)));
    }
  });
}

function subscribe(
  socket: { watchContractEvent: (args: unknown) => () => void },
  chain: ChainRuntime,
  address: Hex,
  abi: Abi,
  eventName: string,
  onLog: (item: EventLog) => Promise<void>,
  onError: (error: Error) => void,
): () => void {
  return socket.watchContractEvent({
    address,
    abi,
    eventName,
    onLogs: (logs: EventLog[] | undefined) => {
      try {
        if (!logs) return;
        for (const item of logs) {
          if (!item) continue;
          if (eventName === "Withdrawn" && item.blockNumber != null) noteWssLog(chain.id, item.blockNumber);
          const run = async () => {
            try {
              await onLog(item);
            } catch (error) {
              log.warn({ chainId: chain.id, event: eventName, err: errorText(error) }, "watcher callback skipped");
            }
          };
          if (eventName === "Withdrawn") startDetection(run);
          else enqueue(chain.id, run);
        }
      } catch (error) {
        log.warn({ chainId: chain.id, event: eventName, err: errorText(error) }, "watcher callback skipped");
      }
    },
    onError,
  });
}

interface EventLog {
  transactionHash: Hex | null;
  blockNumber: bigint | null;
  args: Record<string, unknown>;
}

function enqueue(chainId: number, task: () => Promise<void>): void {
  const previous = tails.get(chainId) ?? Promise.resolve();
  const run = previous.then(task, task).catch((error: unknown) => {
    log.warn({ chainId, err: errorText(error) }, "watcher task skipped");
  });
  tails.set(chainId, run);
}

function startPausePoll(chain: ChainRuntime): void {
  if (pausePolls.has(chain.id)) return;
  pausePolls.add(chain.id);
  setInterval(() => {
    enqueue(chain.id, async () => {
      try {
        await pollPauseSignals(chain);
      } catch (error) {
        log.warn({ chainId: chain.id, err: errorText(error) }, "pause poll skipped");
      }
    });
  }, 5_000);
}

async function pollPauseSignals(chain: ChainRuntime): Promise<void> {
  const addresses = [chain.deployment.guardian, chain.deployment.vault].filter(isSet);
  if (addresses.length === 0) return;
  const head = await chain.http().getBlockNumber();
  const remembered = pausePollFrom.get(chain.id);
  let from = remembered ?? (await storedBlock(chain.id)) ?? head;
  if (remembered == null && head - from > 2_000n) from = head - 2_000n;
  if (from > head) return;
  const end = from + 200n - 1n > head ? head : from + 200n - 1n;
  const logs = await chain.http().getLogs({ address: addresses, fromBlock: from, toBlock: end });
  for (const item of logs) {
    const abi = abiFor(chain, item.address);
    if (!abi) continue;
    try {
      const decoded = decodeEventLog({ abi, data: item.data, topics: item.topics });
      if (decoded.eventName !== "ExploitBlocked" && decoded.eventName !== "Paused") continue;
      const event: EventLog = {
        transactionHash: item.transactionHash ?? null,
        blockNumber: item.blockNumber ?? null,
        args: decoded.args as unknown as Record<string, unknown>,
      };
      await dispatchEvent(chain, decoded.eventName, event, false);
    } catch {
      continue;
    }
  }
  pausePollFrom.set(chain.id, end + 1n);
}

function claimWithdrawal(chainId: number, txHash: string): boolean {
  const key = `${chainId}:${txHash.toLowerCase()}`;
  if (claimedWithdrawals.has(key)) return false;
  claimedWithdrawals.add(key);
  return true;
}

function startDetection(task: () => Promise<void>): void {
  void task().catch((error: unknown) => {
    log.warn({ err: errorText(error) }, "detection skipped");
  });
}

function enqueueScan(chainId: number, task: () => Promise<void>): void {
  const previous = scanTails.get(chainId) ?? Promise.resolve();
  const run = previous.then(task, task).catch((error: unknown) => {
    log.warn({ chainId, err: errorText(error) }, "withdrawal scan skipped");
  });
  scanTails.set(chainId, run);
}

function markWithdrawnScanned(chainId: number, blockNumber: bigint): void {
  const prev = withdrawScanned.get(chainId);
  if (prev == null || blockNumber > prev) withdrawScanned.set(chainId, blockNumber);
}

export function onVaultHead(chain: ChainRuntime, blockNumber: bigint): void {
  noteHeadArrived(chain.id, blockNumber);
}

function startLogBatch(chain: ChainRuntime): void {
  if (logBatches.has(chain.id)) return;
  logBatches.add(chain.id);
  setInterval(() => {
    enqueueScan(chain.id, async () => {
      try {
        await scanCaughtUp(chain, "head");
      } catch (error) {
        log.warn({ chainId: chain.id, err: errorText(error) }, "log batch skipped");
      }
    });
  }, LOG_BATCH_MS);
}

function startWithdrawalPoll(chain: ChainRuntime): void {
  if (withdrawPolls.has(chain.id)) return;
  withdrawPolls.add(chain.id);
  setInterval(() => {
    enqueueScan(chain.id, async () => {
      try {
        await pollWithdrawals(chain);
      } catch (error) {
        log.warn({ chainId: chain.id, err: errorText(error) }, "withdrawal poll skipped");
      }
    });
  }, WITHDRAW_POLL_MS);
}

async function pollWithdrawals(chain: ChainRuntime): Promise<void> {
  if (!isSet(chain.deployment.vault) && !isSet(chain.deployment.mixer) && !isSet(chain.deployment.guardian)) return;
  await scanCaughtUp(chain, "poll");
}

async function scanCaughtUp(chain: ChainRuntime, via: DetectedVia): Promise<void> {
  const addresses = [chain.deployment.vault, chain.deployment.guardian, chain.deployment.mixer].filter(isSet);
  if (addresses.length === 0) return;
  const head = await chain.http().getBlockNumber();
  const prev = withdrawScanned.get(chain.id);
  if (prev != null && prev >= head) {
    const strikesAt = strikeScanned.get(chain.id);
    if (strikesAt != null && strikesAt >= head) return;
    await scanOpenStrikes(chain, head);
    return;
  }
  const from = prev == null ? (head > 8n ? head - 8n : 0n) : prev + 1n;
  const to = head - from + 1n > LOG_RANGE_CAP ? from + LOG_RANGE_CAP - 1n : head;
  if (to < head) {
    log.info(
      { chainId: chain.id, from: from.toString(), to: to.toString(), head: head.toString(), via },
      "log batch",
    );
  }
  await scanSignals(chain, from, to, via);
  markWithdrawnScanned(chain.id, to);
  await scanOpenStrikes(chain, to);
}

async function scanSignals(chain: ChainRuntime, fromBlock: bigint, toBlock: bigint, via: DetectedVia): Promise<void> {
  if (fromBlock > toBlock) return;
  await replay(chain, fromBlock, toBlock, true, via);
  for (let block = fromBlock; block <= toBlock; block++) noteHeadLogs(chain.id, block);
}

function rememberBlocked(chainId: number, txHash: string, blockNumber: bigint | null, incidentId: string): void {
  const next: SeenExploitBlocked = {
    chainId,
    txHash,
    blockNumber: (blockNumber ?? 0n).toString(),
    incidentId,
  };
  if (lastExploitBlocked?.txHash === next.txHash) return;
  lastExploitBlocked = next;
  log.info(next, "last ExploitBlocked");
}

function scheduleBackfill(chain: ChainRuntime): void {
  if (backfillQueued.has(chain.id)) return;
  backfillQueued.add(chain.id);
  const attempt = backfillAttempts.get(chain.id) ?? 0;
  setTimeout(() => {
    enqueue(chain.id, async () => {
      try {
        await backfillGap(chain);
        backfillAttempts.set(chain.id, 0);
      } catch (error) {
        backfillAttempts.set(chain.id, attempt + 1);
        log.warn({ chainId: chain.id, err: errorText(error) }, "reconnect backfill failed");
      } finally {
        backfillQueued.delete(chain.id);
      }
    });
  }, socketBackoffMs(attempt));
}

async function backfillGap(chain: ChainRuntime): Promise<void> {
  const head = await chain.http().getBlockNumber();
  const cursor = await storedBlock(chain.id);
  if (cursor == null) {
    await saveCursor(chain.id, head);
    return;
  }
  let from = cursor;
  if (head - from > 2_000n) {
    log.warn({ chainId: chain.id, behind: (head - from).toString() }, "reconnect gap capped at 2000 blocks");
    from = head - 2_000n;
  }
  if (from > head) return;
  log.info({ chainId: chain.id, from: from.toString(), to: head.toString() }, "backfill after reconnect");
  const step = 2_000n;
  for (let start = from; start <= head; start += step) {
    const end = start + step - 1n > head ? head : start + step - 1n;
    await replay(chain, start, end, true, "backfill");
    await saveCursor(chain.id, end);
  }
}

async function storedBlock(chainId: number): Promise<bigint | null> {
  const memory = lastSeenBlock.get(chainId);
  if (memory != null) return memory;
  const cursor = await prisma.chainCursor.findUnique({ where: { chainId } });
  if (!cursor) return null;
  return BigInt(cursor.lastBlock);
}

async function catchUp(chain: ChainRuntime): Promise<void> {
  const head = await chain.http().getBlockNumber();
  const cursor = await prisma.chainCursor.findUnique({ where: { chainId: chain.id } });
  const deploy = chain.deployment.deployBlock == null ? null : BigInt(chain.deployment.deployBlock);
  const deposited =
    deploy == null
      ? 1
      : await prisma.activityEvent.count({ where: { chainId: chain.id, type: { in: ["deposited", "Deposited"] } } });
  const allowlist =
    deploy == null ? 1 : await prisma.activityEvent.count({ where: { chainId: chain.id, type: "AllowlistUpdated" } });
  const roles =
    deploy == null ? 1 : await prisma.activityEvent.count({ where: { chainId: chain.id, type: "RoleGranted" } });
  let from = cursor ? BigInt(cursor.lastBlock) + 1n : head;
  if (deploy != null && (cursor == null || deposited === 0 || allowlist < 3 || roles < 3 || from < deploy)) {
    from = deploy;
    log.info({ chainId: chain.id, from: from.toString(), head: head.toString() }, "backfill from deployBlock");
  } else if (head - from > 5_000n) {
    log.warn({ chainId: chain.id, behind: (head - from).toString() }, "cursor is far behind, resuming at head");
    from = head;
  }
  if (from <= head) {
    const step = 2_000n;
    for (let start = from; start <= head; start += step) {
      const end = start + step - 1n > head ? head : start + step - 1n;
      await replay(chain, start, end);
    }
  }
  await saveCursor(chain.id, head);
}

async function replay(chain: ChainRuntime, fromBlock: bigint, toBlock: bigint, investigateNow = false, via: DetectedVia = "backfill"): Promise<void> {
  const addresses = [chain.deployment.mixer, chain.deployment.vault, chain.deployment.guardian].filter(isSet);
  if (addresses.length === 0) return;
  const logs = await chain.http().getLogs({ address: addresses, fromBlock, toBlock });
  const ordered = [...logs].sort((left, right) => {
    const leftBlock = left.blockNumber ?? 0n;
    const rightBlock = right.blockNumber ?? 0n;
    if (leftBlock < rightBlock) return -1;
    if (leftBlock > rightBlock) return 1;
    return (left.logIndex ?? 0) - (right.logIndex ?? 0);
  });
  for (const item of ordered) {
    const abi = abiFor(chain, item.address);
    if (!abi) continue;
    try {
      const decoded = decodeEventLog({ abi, data: item.data, topics: item.topics });
      if (!decoded.eventName) continue;
      const event: EventLog = {
        transactionHash: item.transactionHash ?? null,
        blockNumber: item.blockNumber ?? null,
        args: decoded.args as unknown as Record<string, unknown>,
      };
      await dispatchEvent(chain, decoded.eventName, event, investigateNow, via);
    } catch {
      continue;
    }
  }
}

function abiFor(chain: ChainRuntime, address: Hex): Abi | null {
  const target = address.toLowerCase();
  if (chain.deployment.mixer?.toLowerCase() === target) return mixerAbi;
  if (chain.deployment.vault?.toLowerCase() === target) return vaultAbi;
  if (chain.deployment.guardian?.toLowerCase() === target) return guardianAbi;
  return null;
}

async function scanOpenStrikes(chain: ChainRuntime, toBlock: bigint): Promise<void> {
  const prev = strikeScanned.get(chain.id);
  const open = await prisma.incident.findMany({
    where: { chainId: chain.id, status: { in: ["detected", "sent_to_cre", "paused"] } },
  });
  if (open.length === 0) {
    if (prev == null || toBlock > prev) strikeScanned.set(chain.id, toBlock);
    await saveCursor(chain.id, toBlock);
    return;
  }
  const from = prev == null ? toBlock : prev + 1n;
  if (from > toBlock) return;
  const to = toBlock - from + 1n > HEAD_SCAN_CAP ? from + HEAD_SCAN_CAP - 1n : toBlock;
  if (to < toBlock) {
    log.info(
      { chainId: chain.id, from: from.toString(), to: to.toString(), head: toBlock.toString() },
      "strike scan catching up",
    );
  }
  for (let blockNumber = from; blockNumber <= to; blockNumber++) {
    await revertedStrikesInBlock(chain, blockNumber, open);
  }
  strikeScanned.set(chain.id, to);
  await saveCursor(chain.id, to);
}

function attackerContracts(row: { attackerContract?: string | null; stages?: unknown }): string[] {
  const found = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) found.add(value.toLowerCase());
  };
  add(row.attackerContract);
  if (Array.isArray(row.stages)) {
    for (const stage of row.stages as { stage?: string; data?: { attackerContract?: unknown } }[]) {
      if (stage?.stage === "probe_detected") add(stage.data?.attackerContract);
    }
  }
  return [...found];
}

function strikeMatches(
  tx: { from?: string; to?: string | null; input?: string },
  attackers: Set<string>,
  contracts: Set<string>,
): boolean {
  const input = (tx.input ?? "").toLowerCase();
  if (!input.startsWith(strikeSelector)) return false;
  const from = (tx.from ?? "").toLowerCase();
  const to = (tx.to ?? "").toLowerCase();
  return contracts.has(to) || attackers.has(from);
}

async function revertedStrikesInBlock(
  chain: ChainRuntime,
  blockNumber: bigint,
  open: Array<{ id: string; attacker: string; attackerContract: string; suspectTxHash: string; score: number; stages: unknown }>,
): Promise<void> {
  if (open.length === 0) return;
  const block = await chain.http().getBlock({ blockNumber, includeTransactions: true });
  const attackers = new Set(open.map((row) => row.attacker.toLowerCase()));
  const contracts = new Set(open.flatMap((row) => attackerContracts(row)));
  const transactions = block.transactions as Array<{ hash: Hex; from: Hex; to?: Hex | null; input?: Hex; value: bigint } | string>;
  const expanded = transactions.filter((tx): tx is Exclude<typeof tx, string> => typeof tx !== "string");
  const strikeTxs = expanded.filter((tx) => strikeMatches(tx, attackers, contracts)).length;
  log.info({ chainId: chain.id, blockNumber: blockNumber.toString(), strikeTxs }, "strike block");
  for (const tx of expanded) {
    if (!strikeMatches(tx, attackers, contracts)) continue;
    const to = (tx.to ?? "").toLowerCase();
    const from = tx.from.toLowerCase();
    const index = open.findIndex((incident) => {
      const targets = attackerContracts(incident);
      return targets.includes(to) || incident.attacker.toLowerCase() === from;
    });
    if (index < 0) continue;
    const receipt = await chain.http().getTransactionReceipt({ hash: tx.hash });
    if (receipt.status !== "reverted") continue;
    const match = open[index];
    if (!match) continue;
    open.splice(index, 1);
    await publishStrikeReverted({
      chain,
      incidentId: match.id,
      txHash: tx.hash,
      at: new Date(Number(block.timestamp) * 1000),
      blockNumber: blockNumber.toString(),
      from: tx.from,
      to: tx.to ?? "",
      valueWei: tx.value.toString(),
      score: match.score,
    });
  }
}

async function ingestWithdrawal(chain: ChainRuntime, item: EventLog): Promise<void> {
  const to = asAddress(item.args.to);
  if (!to || !item.transactionHash) return;
  const at = unixDate(item.args.timestamp);
  await prisma.watchedWallet.upsert({
    where: { chainId_address: { chainId: chain.id, address: to } },
    create: {
      address: to,
      chainId: chain.id,
      firstFundedAt: at,
      fundingSource: "mixer",
      fundingTx: item.transactionHash,
    },
    update: {},
  });
  await recordActivity({
    chainId: chain.id,
    txHash: item.transactionHash,
    blockNumber: (item.blockNumber ?? 0n).toString(),
    type: "Withdrawal",
    from: chain.deployment.mixer ?? "",
    to,
    valueWei: "0",
    result: "success",
    at,
  });
  log.info({ chainId: chain.id, to, tx: item.transactionHash }, "mixer withdrawal recorded");
}

async function ingestVaultAmount(chain: ChainRuntime, item: EventLog, type: string): Promise<void> {
  const user = asAddress(item.args.user);
  if (!user || !item.transactionHash || !isSet(chain.deployment.vault)) return;
  const at = item.blockNumber === null ? new Date() : await blockTime(chain, item.blockNumber);
  const valueWei = asBigint(item.args.amount);
  const linked = await prisma.incident.findFirst({
    where: {
      chainId: chain.id,
      OR: [{ suspectTxHash: item.transactionHash }, { strikeTxHash: item.transactionHash }],
    },
    select: { score: true },
  });
  const riskScore = linked
    ? linked.score
    : await cheapRiskScore({
        chainId: chain.id,
        address: user,
        type,
        valueWei,
        at,
        blockNumber: (item.blockNumber ?? 0n).toString(),
      });
  await recordActivity({
    chainId: chain.id,
    txHash: item.transactionHash,
    blockNumber: (item.blockNumber ?? 0n).toString(),
    type,
    from: user,
    to: chain.deployment.vault,
    valueWei: valueWei.toString(),
    result: "success",
    at,
    riskScore,
  });
}

async function dispatchEvent(chain: ChainRuntime, name: string, item: EventLog, investigateNow: boolean, via: DetectedVia = "wss"): Promise<void> {
  if (name === "Withdrawal") await ingestWithdrawal(chain, item);
  if (name === "Deposited") await ingestVaultAmount(chain, item, "Deposited");
  if (name === "Withdrawn") await ingestWithdrawn(chain, item, investigateNow, via);
  if (name === "PausedBy") await ingestNote(chain, item, "PausedBy", asAddress(item.args.account));
  if (name === "Paused") {
    await ingestNote(chain, item, "Paused", asAddress(item.args.account));
    await setProtocolStatus(chain, "paused");
  }
  if (name === "Unpaused") {
    await ingestNote(chain, item, "Unpaused", asAddress(item.args.account));
    await setProtocolStatus(chain, "protected");
  }
  if (name === "AllowlistUpdated") await ingestNote(chain, item, "AllowlistUpdated", asAddress(item.args.account));
  if (name === "RoleGranted") await ingestNote(chain, item, "RoleGranted", asAddress(item.args.account));
  if (name === "VaultRegistered") await ingestRegistered(chain, item);
  if (name === "ExploitBlocked") await ingestBlocked(chain, item);
}

async function ingestNote(chain: ChainRuntime, item: EventLog, type: string, from: Hex | null): Promise<void> {
  if (!item.transactionHash || !isSet(chain.deployment.vault)) return;
  await recordActivity({
    chainId: chain.id,
    txHash: item.transactionHash,
    blockNumber: (item.blockNumber ?? 0n).toString(),
    type,
    from: from ?? "",
    to: chain.deployment.vault,
    valueWei: "0",
    result: noteResult(item),
    at: item.blockNumber === null ? new Date() : await blockTime(chain, item.blockNumber),
  });
}

function noteResult(item: EventLog): string {
  if (typeof item.args.allowed === "boolean") return item.args.allowed ? "allowed" : "removed";
  if (typeof item.args.role === "string") return item.args.role;
  return "success";
}

async function ingestWithdrawn(chain: ChainRuntime, item: EventLog, investigateNow: boolean, via: DetectedVia = "wss"): Promise<void> {
  if (investigateNow && item.transactionHash && !claimWithdrawal(chain.id, item.transactionHash)) return;
  await ingestVaultAmount(chain, item, "Withdrawn");
  if (!investigateNow || !item.transactionHash) return;
  const tx = await chain.http().getTransaction({ hash: item.transactionHash });
  const block = await chain.http().getBlock({ blockNumber: tx.blockNumber ?? item.blockNumber ?? 0n });
  const watched: WatchedTx = {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    input: tx.input,
    value: tx.value,
    nonce: tx.nonce,
    blockNumber: tx.blockNumber ?? 0n,
    timestamp: block.timestamp,
  };
  try {
    await investigate(chain, watched, via);
  } catch (error) {
    log.warn({ chainId: chain.id, tx: item.transactionHash, err: errorText(error) }, "detector skipped");
  }
}

async function ingestRegistered(chain: ChainRuntime, item: EventLog): Promise<void> {
  const vault = asAddress(item.args.vault);
  const admin = asAddress(item.args.admin);
  if (!vault) return;
  const vaultAddress = getAddress(vault);
  await ensureProtocol(chain);
  await prisma.protocol.updateMany({
    where: { chainId: chain.id, vaultAddress },
    data: { status: "protected", adminAddress: admin ?? "" },
  });
  const row = await prisma.protocol.findUnique({
    where: { chainId_vaultAddress: { chainId: chain.id, vaultAddress } },
  });
  await ingestNote(chain, item, "VaultRegistered", admin);
  live("protocol:updated", { id: row?.id, chainId: chain.id, vault: vaultAddress, admin, status: "protected" });
  log.info({ chainId: chain.id, vault: vaultAddress, admin }, "vault registered");
}

async function ingestBlocked(chain: ChainRuntime, item: EventLog): Promise<void> {
  const vault = asAddress(item.args.vault);
  const incidentId = typeof item.args.incidentId === "string" ? item.args.incidentId : "";
  if (!vault || !item.transactionHash) return;
  const observedAt = new Date();
  const score = Number(asBigint(item.args.score));
  rememberBlocked(chain.id, item.transactionHash, item.blockNumber, incidentId);
  await ingestNote(chain, item, "ExploitBlocked", asAddress(chain.deployment.guardian));
  await prisma.protocol.updateMany({ where: { chainId: chain.id, vaultAddress: vault }, data: { status: "paused" } });
  live("protocol:updated", { chainId: chain.id, vault, status: "paused" });
  const incident = incidentId
    ? await prisma.incident.findUnique({ where: { id: incidentId } })
    : await prisma.incident.findFirst({
        where: { chainId: chain.id, status: { in: ["detected", "sent_to_cre"] }, protocol: { vaultAddress: vault } },
        orderBy: { detectedAt: "desc" },
      });
  const pausedAt = unixDate(item.args.timestamp);
  if (!incident) {
    if (!incidentId) return;
    const protocol = await ensureProtocol(chain);
    if (!protocol) return;
    await prisma.protocol.update({ where: { id: protocol.id }, data: { status: "paused" } });
    const created = await prisma.incident.create({
      data: {
        id: incidentId,
        chainId: chain.id,
        protocolId: protocol.id,
        suspectTxHash: "",
        attacker: "",
        score,
        reasons: json([]),
        features: json({ source: "external" }),
        trace: json({}),
        status: "paused",
        source: "external",
        pauseTxHash: item.transactionHash,
        pausedAt,
      },
    });
    live("incident:paused", publicIncident(created));
    await emitPauseConfirmed(chain, created, item.transactionHash, observedAt, item.blockNumber, Math.floor(pausedAt.getTime() / 1000));
    log.info({ id: created.id, tx: item.transactionHash, score, source: "external" }, "exploit blocked");
    return;
  }
  if (incident.status === "paused" || incident.status === "reverted_strike" || !item.transactionHash) return;
  const txHash = item.transactionHash;
  await runPauseOnce(incident.id, () => finishPause(chain, incident.id, txHash, pausedAt, observedAt, item.blockNumber));
}

async function finishPause(
  chain: ChainRuntime,
  incidentId: string,
  txHash: string,
  pausedAt: Date,
  observedAt: Date,
  blockNumber?: bigint | null,
): Promise<void> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident || stageAt(incident, "pause_confirmed")) return;
  if (incident.status === "paused" || incident.status === "reverted_strike") {
    if (!incident.pauseTxHash) {
      await prisma.incident.update({ where: { id: incident.id }, data: { pauseTxHash: txHash, pausedAt } });
    }
    const current = await prisma.incident.findUnique({ where: { id: incident.id } });
    if (current) await emitPauseConfirmed(chain, current, txHash, observedAt, blockNumber, Math.floor(pausedAt.getTime() / 1000));
    return;
  }
  const features = incident.features as unknown as {
    timings: {
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
    };
  };
  const pausedUnix = Math.floor(pausedAt.getTime() / 1000);
  const exploitBlockedSeenMs = Date.now();
  const timings = {
    ...features.timings,
    pausedUnix,
    sentToPausedSec: features.timings?.sentUnix == null ? null : pausedUnix - features.timings.sentUnix,
    probeToPausedSec: features.timings ? pausedUnix - features.timings.probeBlockUnix : null,
    exploitBlockedSeenMs,
    exitToBlockedMs:
      typeof features.timings?.creExitMs === "number" ? exploitBlockedSeenMs - features.timings.creExitMs : null,
  };
  const updated = await prisma.incident.update({
    where: { id: incident.id },
    data: {
      status: "paused",
      pausedAt,
      pauseTxHash: txHash,
      features: json({ ...features, timings }),
    },
  });
  clearCreTimeout(incident.id);
  live("incident:paused", publicIncident(updated));
  await emitPauseConfirmed(chain, updated, txHash, observedAt, blockNumber, Math.floor(pausedAt.getTime() / 1000));
  void explainAfterPause(incident.id);
  log.info(
    {
      id: incident.id,
      tx: txHash,
      probeToPausedSec: timings.probeToPausedSec,
      creSpawnMs: timings.creSpawnMs,
      creExitMs: timings.creExitMs,
      exploitBlockedSeenMs: timings.exploitBlockedSeenMs,
      spawnToExitMs: timings.spawnToExitMs,
      exitToBlockedMs: timings.exitToBlockedMs,
    },
    "exploit blocked",
  );
}

export async function confirmPauseReceipt(incidentId: string, chainId: number, txHash: string): Promise<void> {
  const chain = mainnetChains().find((item) => item.id === chainId);
  if (!chain) return;
  const client = chain.http();
  let receipt: Awaited<ReturnType<typeof client.waitForTransactionReceipt>>;
  try {
    receipt = await client.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 60_000, pollingInterval: 250 });
  } catch (error) {
    log.warn(
      { incidentId, txHash, err: error instanceof Error ? error.message : String(error) },
      "pause receipt wait failed; watcher remains the fallback",
    );
    return;
  }
  const receiptReceivedAt = Date.now();
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const blockTimestamp = Number(block.timestamp);
  log.info(
    {
      incidentId,
      txHash,
      receiptReceivedAt: new Date(receiptReceivedAt).toISOString(),
      blockTimestamp,
      lagMs: receiptReceivedAt - blockTimestamp * 1000,
    },
    "pause receipt vs block timestamp",
  );
  const guardian = chain.deployment.guardian?.toLowerCase();
  const matched = receipt.logs.some((entry: (typeof receipt.logs)[number]) => {
    if (!guardian || entry.address.toLowerCase() !== guardian) return false;
    try {
      const decoded = decodeEventLog({ abi: guardianAbi, data: entry.data, topics: entry.topics });
      if (decoded.eventName !== "ExploitBlocked") return false;
      const args = decoded.args as { incidentId?: string };
      return args.incidentId?.toLowerCase() === incidentId.toLowerCase();
    } catch {
      return false;
    }
  });
  if (!matched) {
    log.info({ incidentId, txHash }, "receipt has no ExploitBlocked for this incident; watcher remains the fallback");
    return;
  }
  const pausedAt = new Date(blockTimestamp * 1000);
  const observedAt = new Date(receiptReceivedAt);
  await runPauseOnce(incidentId, () => finishPause(chain, incidentId, txHash, pausedAt, observedAt, receipt.blockNumber));
}

function runPauseOnce(incidentId: string, work: () => Promise<void>): Promise<void> {
  const key = incidentId.toLowerCase();
  const existing = pauseOnce.get(key);
  if (existing) return existing;
  const run = work().catch((error) => {
    pauseOnce.delete(key);
    throw error;
  });
  pauseOnce.set(key, run);
  return run;
}

async function explainAfterPause(incidentId: string): Promise<void> {
  try {
    const row = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!row) return;
    const explanation = await explainIncident(row);
    const saved = await prisma.incident.update({ where: { id: incidentId }, data: { explanation } });
    live("incident:explained", publicIncident(saved));
  } catch (error) {
    log.warn({ incidentId, err: errorText(error) }, "explanation skipped");
  }
}

async function emitPauseConfirmed(
  chain: ChainRuntime,
  incident: { id: string; chainId: number; stages: unknown; features: unknown },
  txHash: string,
  observedAt: Date,
  blockNumber?: bigint | null,
  knownTimestamp?: number,
): Promise<void> {
  const current = await prisma.incident.findUnique({ where: { id: incident.id }, select: { stages: true } });
  clearCreTimeout(incident.id);
  if (stageAt({ stages: current?.stages }, "pause_confirmed")) return;
  let pauseBlock = blockNumber ?? null;
  let pauseTimestamp = knownTimestamp && knownTimestamp > 0 ? knownTimestamp : null;
  if (pauseBlock == null || pauseTimestamp == null) {
    const receipt = await chain.http().getTransactionReceipt({ hash: txHash as Hex });
    pauseBlock = pauseBlock ?? receipt.blockNumber;
    const block = await chain.http().getBlock({ blockNumber: pauseBlock });
    pauseTimestamp = Number(block.timestamp);
  }
  const features = incident.features as { timings?: { probeBlockUnix?: number } };
  const probeTimestamp = features.timings?.probeBlockUnix;
  const detectedAt = stageAt({ stages: current?.stages }, "probe_detected") ?? stageAt(incident, "probe_detected");
  const wallSeconds = detectedAt ? Math.max(0, Math.round((observedAt.getTime() - Date.parse(detectedAt)) / 1000)) : null;
  await emitStage(incident.id, incident.chainId, "pause_confirmed", {
    txHash,
    blockNumber: Number(pauseBlock),
    blockTimestamp: pauseTimestamp,
    explorerUrl: explorerTx(chain, txHash),
    onchainSeconds: typeof probeTimestamp === "number" ? pauseTimestamp - probeTimestamp : null,
    wallSeconds,
  });
}

async function setProtocolStatus(chain: ChainRuntime, status: "paused" | "protected"): Promise<void> {
  if (!isSet(chain.deployment.vault)) return;
  await prisma.protocol.updateMany({
    where: { chainId: chain.id, vaultAddress: getAddress(chain.deployment.vault) },
    data: { status },
  });
}

async function blockTime(chain: ChainRuntime, blockNumber: bigint): Promise<Date> {
  const block = await chain.http().getBlock({ blockNumber });
  return new Date(Number(block.timestamp) * 1000);
}

function unixDate(value: unknown): Date {
  const seconds = asBigint(value);
  if (seconds === 0n) return new Date();
  return new Date(Number(seconds) * 1000);
}

function asAddress(value: unknown): Hex | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return getAddress(value);
}

function asBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value) return BigInt(value);
  return 0n;
}

async function saveCursor(chainId: number, blockNumber: bigint): Promise<void> {
  const prev = lastSeenBlock.get(chainId);
  if (prev != null && blockNumber <= prev) return;
  await prisma.chainCursor.upsert({
    where: { chainId },
    create: { chainId, lastBlock: blockNumber.toString() },
    update: { lastBlock: blockNumber.toString() },
  });
  lastSeenBlock.set(chainId, blockNumber);
}

function errorText(error: unknown): string {
  const named = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  const message = error instanceof Error ? error.message : String(error);
  return redact(`${named} ${message}`.trim());
}

function socketClosed(error: unknown): boolean {
  return /SocketClosed|WebSocketRequest|socket has been closed|ECONNRESET|1006/i.test(errorText(error));
}

function redact(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[http]")
    .replace(/wss?:\/\/\S+/gi, "[wss]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
