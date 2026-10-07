import type { Evidence } from "./types";
import { scoreEvidence } from "./scoring";

export type VerdictRule = {
  id: string;
  label: string;
  points: number;
  hit: boolean;
};

export type SentinelVerdict = {
  incidentId: `0x${string}`;
  score: number;
  threshold: number;
  action: "pause" | "rejected";
  rules: VerdictRule[];
  guard?: string;
};

const GUARD_REASON = "No pause-level score without reentrancy or at least a 5% simulated loss";

/**
 * Weights match scoring.ts. points is the weight; hit is whether that weight was added.
 */
function rulesFor(evidence: Evidence): VerdictRule[] {
  const features = evidence.features;
  return [
    {
      id: "reentrancy",
      label: "Re-entry in the probe trace",
      points: 30,
      hit: features.reentrancyDetected,
    },
    {
      id: "loss20",
      label: "Simulated vault loss ≥ 20%",
      points: 30,
      hit: features.vaultBalanceDeltaBps >= 2000,
    },
    {
      id: "loss5",
      label: "Simulated vault loss ≥ 5%",
      points: 15,
      hit: features.vaultBalanceDeltaBps >= 500 && features.vaultBalanceDeltaBps < 2000,
    },
    {
      id: "mixer",
      label: "Gas funded via a mixer",
      points: 20,
      hit: features.mixerFunded,
    },
    {
      id: "fresh",
      label: "Wallet under 1 hour old",
      points: 16,
      hit: features.walletAgeSeconds != null && features.walletAgeSeconds < 3600,
    },
    {
      id: "dayold",
      label: "Wallet under 1 day old",
      points: 8,
      hit: features.walletAgeSeconds != null && features.walletAgeSeconds >= 3600 && features.walletAgeSeconds < 86400,
    },
    {
      id: "flash",
      label: "Flash-loan entry",
      points: 20,
      hit: features.flashLoanEntry,
    },
    {
      id: "newc",
      label: "Target contract < 1 h old",
      points: 10,
      hit: features.newContractTarget,
    },
  ];
}

export function buildVerdict(evidence: Evidence, threshold: number): SentinelVerdict {
  const scored = scoreEvidence(evidence);
  const rules = rulesFor(evidence);
  const raw = Math.min(100, rules.reduce((sum, rule) => sum + (rule.hit ? rule.points : 0), 0));
  const guardBlocked = raw >= threshold && scored.score < threshold;
  const verdict: SentinelVerdict = {
    incidentId: evidence.incidentId,
    score: scored.score,
    threshold,
    action: scored.score >= threshold ? "pause" : "rejected",
    rules,
  };
  if (guardBlocked) verdict.guard = GUARD_REASON;
  return verdict;
}
