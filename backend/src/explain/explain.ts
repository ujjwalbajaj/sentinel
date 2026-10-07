import type { Incident } from "@prisma/client";
import { formatEther } from "viem";
import { env } from "../config/env.js";
import { log } from "../log.js";

interface Timings {
  probeBlockUnix: number;
  detectedUnix: number;
  sentUnix: number | null;
  pausedUnix: number | null;
  probeToDetectedSec: number | null;
  detectedToSentSec: number | null;
  sentToPausedSec: number | null;
  probeToPausedSec: number | null;
}

interface Features {
  walletAgeSeconds: number | null;
  mixerFunded: boolean;
  reentrancyDetected: boolean;
  vaultBalanceDeltaBps: number;
  timings?: Timings;
}

export function templateExplanation(incident: Incident): string {
  const features = incident.features as unknown as Features;
  const age = features.walletAgeSeconds;
  const ageText = age == null ? "unknown age" : `${age} seconds`;
  const pct = Math.round((features.vaultBalanceDeltaBps ?? 0) / 100);
  const amount = `${formatEther(BigInt(incident.valueAtRiskWei || "0"))} native`;
  const secs = features.timings?.probeToPausedSec;
  const secsText = secs === null || secs === undefined ? "an unmeasured number of" : String(secs);
  const funded = features.mixerFunded ? "funded through a mixer, " : "";
  const reentry = features.reentrancyDetected
    ? "deployed a contract that re-entered withdrawAll() before the vault updated its balance."
    : "called withdraw on the vault.";
  return `A wallet ${ageText} old, ${funded}${reentry} Simulating the full attack showed ${pct}% of the vault (${amount}) could be drained in one transaction. SENTINEL paused the vault ${secsText} seconds after the test call.`;
}

export async function explainIncident(incident: Incident): Promise<string> {
  const fallback = templateExplanation(incident);
  if (!env.LLM_API_KEY) return fallback;
  try {
    const features = incident.features as unknown as Features;
    const response = await fetch(env.LLM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "Explain this blockchain incident in at most 80 words. Use only the JSON. Do not invent addresses or amounts.",
          },
          {
            role: "user",
            content: JSON.stringify({
              features,
              valueAtRiskWei: incident.valueAtRiskWei,
              vaultBalanceWei: incident.vaultBalanceWei,
              score: incident.score,
              chainId: incident.chainId,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      log.warn({ status: response.status }, "explanation model returned an error, using the template");
      return fallback;
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) return fallback;
    const words = text.split(/\s+/);
    return words.length > 80 ? words.slice(0, 80).join(" ") : text;
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : String(error) }, "explanation model failed, using the template");
    return fallback;
  }
}
