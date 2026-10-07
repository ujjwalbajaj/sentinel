export interface Rulebook {
  pauseThreshold: number;
  freshWallet: { weight: number; maxAgeSeconds: number; maxNonce: number };
  mixerFunding: { weight: number; addresses: string[] };
  flashLoan: { weight: number };
  reentrancy: { weight: number };
  abnormalDelta: { weight: number; minDropBps: number };
  testBeforeStrike: { weight: number; maxTestToDrainRatioBps: number };
  instructions?: string;
}

export interface Observation {
  protocolName: string;
  vaultTvlUsd: number;
  walletAgeSeconds: number | null;
  deployerNonce: number | null;
  fundedByMixer: boolean;
  flashLoanEntry: boolean;
  reentrancy: boolean;
  vaultBalanceDropBps: number;
  testSizedCall: boolean;
}

export interface SignalHit {
  id: string;
  weight: number;
  fired: boolean;
  detail: string;
}

export interface Verdict {
  probability: number;
  pause: boolean;
  signals: SignalHit[];
  drainBps: number;
  drainedUsd: number;
  explanation: string;
}

export function parseRulebook(value: unknown): Rulebook {
  if (!value || typeof value !== "object") {
    throw new Error("Rulebook must be a JSON object");
  }
  const book = value as Rulebook;
  const required = [
    "pauseThreshold",
    "freshWallet",
    "mixerFunding",
    "flashLoan",
    "reentrancy",
    "abnormalDelta",
    "testBeforeStrike",
  ] as const;
  for (const key of required) {
    if (book[key] === undefined) throw new Error(`Rulebook is missing ${key}`);
  }
  return book;
}

export function assess(obs: Observation, rulebook: Rulebook): Verdict {
  const minutes =
    obs.walletAgeSeconds === null ? null : Math.max(1, Math.round(obs.walletAgeSeconds / 60));
  const fresh =
    (obs.walletAgeSeconds !== null && obs.walletAgeSeconds <= rulebook.freshWallet.maxAgeSeconds) ||
    (obs.deployerNonce !== null && obs.deployerNonce <= rulebook.freshWallet.maxNonce);

  const freshDetail =
    minutes !== null && obs.walletAgeSeconds !== null && obs.walletAgeSeconds <= rulebook.freshWallet.maxAgeSeconds
      ? `Wallet created ${minutes} minutes ago`
      : `Deployer nonce ${obs.deployerNonce ?? "unknown"}`;

  const signals: SignalHit[] = [
    { id: "fresh_wallet", weight: rulebook.freshWallet.weight, fired: fresh, detail: freshDetail },
    {
      id: "mixer_funding",
      weight: rulebook.mixerFunding.weight,
      fired: obs.fundedByMixer,
      detail: "Gas and capital arrived from a mixer",
    },
    {
      id: "flash_loan",
      weight: rulebook.flashLoan.weight,
      fired: obs.flashLoanEntry,
      detail: "Call stack enters through a flash-loan callback",
    },
    {
      id: "reentrancy",
      weight: rulebook.reentrancy.weight,
      fired: obs.reentrancy,
      detail: "Vault is re-entered before it updates balances",
    },
    {
      id: "abnormal_balance_delta",
      weight: rulebook.abnormalDelta.weight,
      fired: obs.vaultBalanceDropBps >= rulebook.abnormalDelta.minDropBps,
      detail: `Simulated vault balance drop is ${(obs.vaultBalanceDropBps / 100).toFixed(0)}%`,
    },
    {
      id: "test_before_strike",
      weight: rulebook.testBeforeStrike.weight,
      fired: obs.testSizedCall && obs.vaultBalanceDropBps >= rulebook.abnormalDelta.minDropBps,
      detail: "The live transaction is a small test; another function on the same contract drains the vault",
    },
  ];

  const probability = Math.min(
    100,
    signals.reduce((sum, signal) => sum + (signal.fired ? signal.weight : 0), 0),
  );
  const drainBps = obs.vaultBalanceDropBps;
  const drainedUsd = (obs.vaultTvlUsd * drainBps) / 10_000;
  const pause = probability >= rulebook.pauseThreshold;

  return {
    probability,
    pause,
    signals,
    drainBps,
    drainedUsd,
    explanation: explain(obs, signals, probability, drainBps, drainedUsd, rulebook),
  };
}

function explain(
  obs: Observation,
  signals: SignalHit[],
  probability: number,
  drainBps: number,
  drainedUsd: number,
  rulebook: Rulebook,
): string {
  const fired = new Set(signals.filter((signal) => signal.fired).map((signal) => signal.id));
  const parts: string[] = [];

  if (fired.has("abnormal_balance_delta")) {
    const pct = Math.round(drainBps / 100);
    parts.push(
      `This contract can drain ${pct}% of the vault (${formatUsd(drainedUsd)}) in one transaction. Attack probability: ${probability}%.`,
    );
  } else {
    parts.push(`Attack probability: ${probability}%.`);
  }

  if (fired.has("fresh_wallet") && fired.has("mixer_funding")) {
    const minutes =
      obs.walletAgeSeconds === null ? null : Math.max(1, Math.round(obs.walletAgeSeconds / 60));
    const age = minutes === null ? "a fresh wallet" : `a wallet created ${minutes} minutes ago`;
    parts.push(`The caller is a contract deployed by ${age} and funded through a mixer.`);
  } else if (fired.has("fresh_wallet")) {
    parts.push("The caller is a contract deployed by a fresh wallet.");
  } else if (fired.has("mixer_funding")) {
    parts.push("The caller was funded through a mixer.");
  }

  if (fired.has("reentrancy")) {
    parts.push("Simulation shows a reentrant call that moves the funds out before the vault updates balances.");
  }
  if (fired.has("flash_loan")) {
    parts.push("The trace enters through a flash-loan callback.");
  }
  if (fired.has("test_before_strike")) {
    parts.push("The transaction on-chain is a small test call. The draining call is another function on the same contract.");
  }
  if (!fired.has("abnormal_balance_delta") && probability < rulebook.pauseThreshold) {
    parts.push("The call does not move a meaningful share of the vault.");
  }
  if (!parts.some((part) => part.includes("Attack probability"))) {
    parts.push(`Attack probability: ${probability}%.`);
  }
  return parts.join(" ");
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0";
  if (Math.abs(amount) >= 1_000_000) {
    const millions = Math.round((amount / 1_000_000) * 10) / 10;
    return `$${millions.toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `$${Math.round(amount).toLocaleString("en-US")}`;
  }
  return `$${amount.toFixed(2)}`;
}

export function isMixerAddress(address: string | null | undefined, rulebook: Rulebook): boolean {
  if (!address) return false;
  const needle = address.toLowerCase();
  return rulebook.mixerFunding.addresses.some((candidate) => candidate.toLowerCase() === needle);
}
