import { randomUUID } from "node:crypto";
import { truncateTrace } from "./analyze.js";
import { CHAINS } from "./chains.js";
import type { Desk, DeskEvent } from "./desk.js";
import { buildHeroObservation, HERO_TVL_USD } from "./hero.js";
import { encodePauseReport } from "./pause.js";
import { assess, type Rulebook } from "../cre/sentinel-workflow/score.js";

const runs = new WeakMap<Desk, number>();

export async function playIncident(desk: Desk, rulebook: Rulebook, speedMs = 700): Promise<void> {
  const token = (runs.get(desk) ?? 0) + 1;
  runs.set(desk, token);
  desk.reset("tabletop");
  for (const chain of CHAINS) {
    const preview = buildHeroObservation(chain, rulebook);
    desk.addProtocol({
      name: "VaultX",
      chainId: chain.id,
      chainLabel: chain.label,
      vault: preview.vault,
      guardian: preview.guardian,
      tvlUsd: HERO_TVL_USD,
    });
  }

  for (const chain of CHAINS) {
    if (runs.get(desk) !== token) return;
    const observation = buildHeroObservation(chain, rulebook);
    const verdict = assess(observation, rulebook);
    emit(desk, {
      clock: "11:38:02 PM",
      chainId: observation.chainId,
      chainLabel: observation.chainLabel,
      protocolName: observation.protocolName,
      vault: observation.vault,
      guardian: observation.guardian,
      kind: "simulation",
      title: "Test call simulated",
      body: verdict.explanation,
      probability: verdict.probability,
      explanation: verdict.explanation,
      signals: verdict.signals,
      drainedUsd: verdict.drainedUsd,
      drainBps: verdict.drainBps,
      trace: truncateTrace(observation.trace, 5),
      txHash: observation.txHash,
    });
    await sleep(speedMs);
    if (runs.get(desk) !== token) return;

    const calldata = encodePauseReport(observation.vault, verdict.probability, observation.alertId);
    emit(desk, {
      clock: "11:38:41 PM",
      chainId: observation.chainId,
      chainLabel: observation.chainLabel,
      protocolName: observation.protocolName,
      vault: observation.vault,
      guardian: observation.guardian,
      kind: "pause",
      title: "CRE workflow paused VaultX",
      body: `Chainlink CRE workflow sentinel-pause submitted a guardian report on ${observation.chainLabel}. Calldata ${calldata}`,
      probability: verdict.probability,
      explanation: verdict.explanation,
      calldata,
      txHash: observation.txHash,
    });
    await sleep(speedMs);
    if (runs.get(desk) !== token) return;

    emit(desk, {
      clock: "11:42:15 PM",
      chainId: observation.chainId,
      chainLabel: observation.chainLabel,
      protocolName: observation.protocolName,
      vault: observation.vault,
      guardian: observation.guardian,
      kind: "reverted",
      title: "Strike reverted",
      body: "The strike landed and reverted. Nothing left the vault.",
      probability: verdict.probability,
      txHash: observation.txHash,
    });
    await sleep(speedMs);
  }
}

function emit(desk: Desk, event: Omit<DeskEvent, "id" | "createdAt">): void {
  const full: DeskEvent = { ...event, id: randomUUID(), createdAt: new Date().toISOString() };
  desk.push(full);
  console.log(`\n${full.clock}  ${full.chainLabel}  ${full.title}`);
  console.log(full.body);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
