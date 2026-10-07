import { randomUUID } from "node:crypto";
import type { Hex } from "viem";
import { AccountBook } from "./accounts.js";
import { assessTransaction, type Protocol, type Assessment } from "./assessTx.js";
import { CHAINS, chainById } from "./chains.js";
import type { Desk, DeskEvent } from "./desk.js";
import { dispatchPause } from "./dispatch.js";
import { encodePauseReport } from "./pause.js";
import { createRpc, getBlock, watchBlocks } from "./nownodes.js";
import { saveAlert } from "./db.js";
import { isCovered, registryForChain } from "./subscription.js";
import type { Db } from "./db.js";
import type { Rulebook } from "../cre/sentinel-workflow/score.js";

export function protocolsFromEnv(): Protocol[] {
  const protocols: Protocol[] = [];
  for (const chain of CHAINS) {
    const suffix = chain.key.toUpperCase();
    const vault = process.env[`VAULT_${suffix}`] as Hex | undefined;
    const guardian = process.env[`GUARDIAN_${suffix}`] as Hex | undefined;
    if (!vault || !guardian) continue;
    protocols.push({
      name: process.env[`PROTOCOL_${suffix}`] ?? "VaultX",
      chainId: chain.id,
      chainLabel: chain.label,
      chainSelectorName: chain.selectorName,
      vault,
      guardian,
      tvlUsd: Number(process.env[`TVL_${suffix}`] ?? "0"),
    });
  }
  return protocols;
}

export function watchLive(desk: Desk, db: Db | null, rulebook: Rulebook): void {
  desk.reset("live");
  const protocols = protocolsFromEnv();
  for (const protocol of protocols) desk.addProtocol(protocol);
  const book = new AccountBook();
  const apiKey = process.env.NOWNODES_API_KEY;

  for (const chain of CHAINS) {
    const chainProtocols = protocols.filter((protocol) => protocol.chainId === chain.id);
    if (chainProtocols.length === 0) {
      console.log(`No protected vault on ${chain.label}. Set VAULT_${chain.key.toUpperCase()} and GUARDIAN_${chain.key.toUpperCase()}.`);
      continue;
    }
    let rpc;
    try {
      rpc = createRpc(chain, apiKey);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      continue;
    }
    console.log(`Watching ${chain.label} for ${chainProtocols.map((protocol) => protocol.vault).join(", ")}`);
    const client = rpc;
    watchBlocks(
      chain,
      apiKey,
      (blockNumber) => {
        void handleBlock(chain.id, blockNumber, client, book, chainProtocols, rulebook, desk, db);
      },
      (error) => console.error(error.message),
    );
  }
}

async function handleBlock(
  chainId: number,
  blockNumber: bigint,
  rpc: ReturnType<typeof createRpc>,
  book: AccountBook,
  protocols: Protocol[],
  rulebook: Rulebook,
  desk: Desk,
  db: Db | null,
): Promise<void> {
  const chain = chainById(chainId);
  if (!chain) return;
  let block;
  try {
    block = await getBlock(rpc, blockNumber);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return;
  }
  for (const tx of block.transactions) {
    try {
      const assessment = await assessTransaction({
        chain,
        rpc,
        tx,
        timestamp: Number(block.timestamp),
        book,
        protocols,
        rulebook,
      });
      if (!assessment || assessment.verdict.probability === 0) continue;
      const calldata = encodePauseReport(
        assessment.protocol.vault,
        assessment.verdict.probability,
        assessment.alertId,
      );
      const simulation = eventFrom(assessment, {
        kind: "simulation",
        title: "Suspicious call simulated",
        body: assessment.verdict.explanation,
        calldata,
      });
      desk.push(simulation);
      await saveAlert(db, simulation);
      console.log(`\n${simulation.chainLabel}  ${simulation.title}`);
      console.log(simulation.body);

      if (!assessment.verdict.pause) continue;
      const covered = await isCovered(rpc, registryForChain(chainId), assessment.protocol.vault);
      if (!covered) {
        const skipped = eventFrom(assessment, {
          kind: "watch",
          title: "Coverage lapsed",
          body: "This vault is off the watch list. SENTINEL will not pause it. Withdrawals stay open.",
          calldata,
        });
        desk.push(skipped);
        console.log(skipped.body);
        continue;
      }
      const dispatched = await dispatchPause(assessment);
      const pause = eventFrom(assessment, {
        kind: "pause",
        title: "Guardian pause submitted",
        body: dispatched.detail,
        calldata,
      });
      desk.push(pause);
      await saveAlert(db, pause);
      console.log(pause.body);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}

function eventFrom(
  assessment: Assessment,
  fields: Pick<DeskEvent, "kind" | "title" | "body"> & { calldata?: string },
): DeskEvent {
  return {
    id: randomUUID(),
    clock: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    chainId: assessment.protocol.chainId,
    chainLabel: assessment.protocol.chainLabel,
    protocolName: assessment.protocol.name,
    vault: assessment.protocol.vault,
    guardian: assessment.protocol.guardian,
    kind: fields.kind,
    title: fields.title,
    body: fields.body,
    probability: assessment.verdict.probability,
    explanation: assessment.verdict.explanation,
    signals: assessment.verdict.signals,
    drainedUsd: assessment.verdict.drainedUsd,
    drainBps: assessment.verdict.drainBps,
    trace: assessment.trace,
    calldata: fields.calldata,
    txHash: assessment.tx.hash,
  };
}
