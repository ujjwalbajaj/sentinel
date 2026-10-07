export type Chain = "base" | "bsc";

export type ProtocolStatus = "watching" | "paused" | "alert-only" | "action-needed";

export type PauseMethod = "pauser-role" | "safe-module" | "owner-wrapper" | "alert-only";

export type Policy = {
  pauseThreshold: number;
  alertThreshold: number;
  autoPause: boolean;
  protectedHours: { start: string; end: string } | null;
  allowlist: string[];
  cooldownMin: number;
};

export type ProtectedContract = {
  id: string;
  label: string;
  address: string;
  chain: Chain;
  pauseMethod: PauseMethod;
  guardianGranted: boolean;
};

export type Protocol = {
  id: string;
  name: string;
  website: string;
  logoUrl?: string;
  chains: Chain[];
  tvlUsd: number;
  tvlNative?: string;
  nativeSymbol?: string;
  protectedVault?: boolean;
  admin?: string;
  guardian?: string;
  status: ProtocolStatus;
  pauseMethod: PauseMethod;
  contracts: ProtectedContract[];
  lastEventAt: string;
  lastEventBlock: number;
  risk24h: number[];
  risk7d: { day: string; score: number }[];
  tvl7d: { day: string; tvl: number }[];
  policy: Policy;
};

export type SignalKey = "reentrancy" | "balanceDelta" | "mixerGas" | "freshWallet" | "flashLoan" | "newContract";

export type Signal = {
  key: SignalKey;
  label: string;
  detail: string;
  points: number;
};

export type TraceNode = {
  id: string;
  call: string;
  note?: string;
  depth: number;
  flag?: "reentry" | "late-write";
};

export type TimelineStage =
  | "setup"
  | "fund"
  | "allowlist"
  | "deploy"
  | "probe"
  | "detected"
  | "cre"
  | "test"
  | "simulate"
  | "pause"
  | "strike";

export type IncidentOutcome = "blocked" | "alerted" | "false-positive" | "open";

export type Incident = {
  id: string;
  protocolId: string;
  source: string;
  status: string;
  protocolName: string;
  resent: boolean;
  chain: Chain;
  score: number;
  outcome: IncidentOutcome;
  valueAtRiskUsd: number;
  valueAtRiskWei: string;
  valueAtRiskNative?: string;
  vaultBalanceWei: string;
  fundsLostWei: string;
  strikeLossWei?: string;
  probeCostWei?: string;
  strikeBalanceBeforeWei?: string | null;
  strikeBalanceAfterWei?: string | null;
  probeBalanceBeforeWei?: string | null;
  probeBalanceAfterWei?: string | null;
  vaultDeltaBps: number | null;
  nativeSymbol?: string;
  vaultAddress?: string;
  active: boolean;
  testToPauseSec: number | null;
  fundsLostUsd: number;
  timeline: {
    at: string;
    block: number;
    stage: TimelineStage;
    text: string;
    txHash?: string;
    offChain?: boolean;
  }[];
  signals: Signal[];
  trace: TraceNode[];
  probeTrace?: TraceNode[];
  strikeTrace?: TraceNode[];
  threshold?: number;
  explanation: string;
  cre: { step: string; at: string; block: number; txHash?: string; result?: string }[];
  attacker: {
    address: string;
    age: string;
    fundingSource: string;
    contractsDeployed: string[];
    otherProtocols: string[];
  };
  balanceChange: string;
  fundsDestination: string;
};

export type ActivityResult = "normal" | "watch" | "risk" | "paused" | "reverted";

export type ActivityRow = {
  id: string;
  at: string;
  block: number;
  chain: Chain;
  protocolId: string;
  event: string;
  from: string;
  txHash: string;
  score: number | null;
  result: ActivityResult;
};

export type TeamRole = "Owner" | "Admin" | "Responder" | "Viewer";

export type TeamMember = {
  id: string;
  name: string;
  contact: string;
  role: TeamRole;
  you?: boolean;
};

export type ChannelId = "telegram" | "discord" | "slack" | "email" | "webhook";

export type Channel = {
  id: ChannelId;
  label: string;
  connected: boolean;
  target: string;
};

export type PolicyChange = {
  id: string;
  protocolId: string;
  at: string;
  block: number;
  who: string;
  text: string;
};

export type Invoice = {
  id: string;
  at: string;
  block: number;
  amountUsd: number;
  status: "Paid" | "Open";
};

export type AccountRole = "Founder" | "Developer" | "Security" | "Other";
