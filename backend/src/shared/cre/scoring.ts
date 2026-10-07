import type { Evidence } from "./types.js";

export type Reason = {
  key: string;
  points: number;
  detail: string;
};

/**
 * Demo score is 96: reentrancy 30 + 38% vault loss 30 + mixer 20 + 19-minute wallet 16.
 * newContractTarget would add 10 and the 100 cap would publish 100.
 * The fixtures and the frontend both show 96, so the demo evidence leaves that flag false.
 */
export function scoreEvidence(e: Evidence): { score: number; reasons: Reason[] } {
  const features = e.features;
  const reasons: Reason[] = [];

  if (features.reentrancyDetected) {
    reasons.push({
      key: "reentrancyDetected",
      points: 30,
      detail: "withdrawAll() re-entered in one transaction",
    });
  }

  if (features.vaultBalanceDeltaBps >= 2000) {
    reasons.push({
      key: "vaultBalanceDeltaBps",
      points: 30,
      detail: `Simulated vault loss is ${Math.floor(features.vaultBalanceDeltaBps / 100)}%`,
    });
  } else if (features.vaultBalanceDeltaBps >= 500) {
    reasons.push({
      key: "vaultBalanceDeltaBps",
      points: 15,
      detail: `Simulated vault loss is ${Math.floor(features.vaultBalanceDeltaBps / 100)}%`,
    });
  }

  if (features.mixerFunded) {
    reasons.push({
      key: "mixerFunded",
      points: 20,
      detail: "First funds came from a known mixer",
    });
  }

  if (features.walletAgeSeconds != null && features.walletAgeSeconds < 3600) {
    reasons.push({
      key: "walletAgeSeconds",
      points: 16,
      detail: walletDetail(features.walletAgeSeconds),
    });
  } else if (features.walletAgeSeconds != null && features.walletAgeSeconds < 86400) {
    reasons.push({
      key: "walletAgeSeconds",
      points: 8,
      detail: walletDetail(features.walletAgeSeconds),
    });
  }

  if (features.flashLoanEntry) {
    reasons.push({
      key: "flashLoanEntry",
      points: 20,
      detail: "Call stack enters through a flash-loan callback",
    });
  }

  if (features.newContractTarget) {
    reasons.push({
      key: "newContractTarget",
      points: 10,
      detail: "Call came from a contract deployed less than 1 hour ago",
    });
  }

  let score = Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0));
  // No pause-level score without reentrancy or at least a 5% simulated loss.
  if (!features.reentrancyDetected && features.vaultBalanceDeltaBps < 500) {
    score = Math.min(score, 60);
  }

  return { score, reasons };
}

function walletDetail(seconds: number): string {
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return "Attacker wallet is less than 1 minute old";
    return `Attacker wallet is ${minutes} minute${minutes === 1 ? "" : "s"} old`;
  }
  const hours = Math.floor(seconds / 3600);
  return `Attacker wallet is ${hours} hour${hours === 1 ? "" : "s"} old`;
}
