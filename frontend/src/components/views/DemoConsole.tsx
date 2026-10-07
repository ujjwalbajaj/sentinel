"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { usePageTitle } from "@/hooks/usePageTitle";
import { demoApi } from "@/lib/api";
import { chainFromId, chainMeta } from "@/lib/chains";
import { explorerAddress, txUrl } from "@/lib/explorer";
import { liveSocket } from "@/lib/socket";
import type { Chain } from "@/lib/types";
import { buttonClass, formatWei, shortAddress } from "@/lib/utils";
import baseDeployment from "@/shared/deployments/8453.json";
import bscDeployment from "@/shared/deployments/56.json";

const STRIKE_DELAY = 40;

type StepId = "fund-fresh-wallet" | "allowlist-fresh-wallet" | "deploy-attacker" | "probe" | "strike";
type ExtraId = "control-withdraw" | "reset" | "recycle" | "refill-vault" | "status";
type StepStatus = "idle" | "pending" | "confirmed" | "reverted" | "failed";
type PartStatus = "pending" | "running" | "done" | "failed";
type SentinelPhase = "watching" | "threat" | "verdict" | "paused";

const manualOrder: StepId[] = ["fund-fresh-wallet", "allowlist-fresh-wallet", "deploy-attacker", "probe", "strike"];

const manualLabels: Record<StepId, string> = {
  "fund-fresh-wallet": "Fund fresh wallet",
  "allowlist-fresh-wallet": "Allowlist fresh wallet",
  "deploy-attacker": "Deploy attacker",
  probe: "Send probe",
  strike: "Send strike",
};

const extraLabels: Record<ExtraId, string> = {
  "control-withdraw": "Control withdraw",
  reset: "Reset (unpause)",
  recycle: "Recycle",
  "refill-vault": "Refill vault",
  status: "Wallet balances",
};

const simulator = [
  {
    id: "launder",
    n: 1,
    title: "Attacker launders gas",
    sources: ["recycle", "fund-fresh-wallet"],
  },
  {
    id: "allowlist",
    n: 2,
    title: "Demo safety: allowlist",
    sources: ["allowlist-fresh-wallet"],
  },
  {
    id: "deploy",
    n: 3,
    title: "Attacker deploys the exploit",
    sources: ["deploy-attacker"],
  },
  {
    id: "probe",
    n: 4,
    title: "Attacker tests it (probe)",
    sources: ["probe"],
  },
  {
    id: "clock",
    n: 5,
    title: "Attacker's clock",
    sources: ["countdown"],
  },
  {
    id: "strike",
    n: 6,
    title: "Strike!",
    sources: ["strike"],
  },
] as const;

type SimId = (typeof simulator)[number]["id"];

const phaseRank: Record<SentinelPhase, number> = { watching: 0, threat: 1, verdict: 2, paused: 3 };

const phaseCopy: { id: SentinelPhase; label: string }[] = [
  { id: "watching", label: "Watching" },
  { id: "threat", label: "Threat" },
  { id: "verdict", label: "CRE verdict" },
  { id: "paused", label: "PAUSED ✓" },
];

type ShownTx = { label: string; hash: string; fee: string; status: string; explorerUrl?: string };

type ManualState = {
  status: StepStatus;
  line?: string;
  txs?: ShownTx[];
  detail?: string;
};

type DemoTx = { label: string; hash: string; explorerUrl: string; gasCostNative: string; status: "confirmed" | "reverted" | "failed" };

type DemoActionBody = {
  action?: string;
  chainId?: number;
  status?: "confirmed" | "reverted" | "failed" | "pending";
  label?: string;
  txs?: DemoTx[];
  result?: { freshWallet?: string | null; attackerContract?: string | null; revertReason?: string | null };
  error?: string;
  line?: string;
};

type DemoStepEvent = {
  runId: string;
  step: string;
  status: PartStatus;
  title?: string;
  detail?: string;
  txHashes?: string[];
  explorerUrls?: string[];
  feeWei?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  countdownEndsAt?: string;
  vaultBeforeWei?: string;
  vaultAfterWei?: string;
};

type Part = {
  status: PartStatus;
  detail: string;
  hashes: string[];
  urls: string[];
  feeWei: string;
  startedAt: number | null;
  endedAt: number | null;
  countdownEndsAt: number | null;
  vaultBeforeWei: string | null;
  vaultAfterWei: string | null;
};

type WalletBalance = { address: string; balanceWei: string };
type DemoProgress = {
  chainId: number;
  step: string | null;
  freshWallet: WalletBalance | null;
  attackerContract: WalletBalance | null;
  allowlisted: boolean;
  native: string;
  vault: { address: string; balanceWei: string; paused: boolean } | null;
  balances: Record<string, WalletBalance>;
};

function isAddress(value: unknown) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

const chainReady: Record<Chain, boolean> = {
  base: isAddress(baseDeployment.vault) && isAddress(baseDeployment.guardian),
  bsc: isAddress((bscDeployment as { vault?: string }).vault) && isAddress(bscDeployment.guardian),
};

function payloadChain(payload: Record<string, unknown>) {
  if (typeof payload.chainId === "number") return chainFromId(payload.chainId);
  if (typeof payload.chainId === "string") return chainFromId(Number(payload.chainId));
  return null;
}

function millis(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addWei(left: string, right: string) {
  try {
    return (BigInt(left || "0") + BigInt(right || "0")).toString();
  } catch {
    return left || right || "0";
  }
}

function isStepEvent(value: unknown): value is DemoStepEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DemoStepEvent>;
  return typeof row.runId === "string" && typeof row.step === "string" && (row.status === "pending" || row.status === "running" || row.status === "done" || row.status === "failed");
}

function partFrom(event: DemoStepEvent): Part {
  return {
    status: event.status,
    detail: event.detail ?? "",
    hashes: event.txHashes ?? [],
    urls: event.explorerUrls ?? [],
    feeWei: event.feeWei || "0",
    startedAt: millis(event.startedAt),
    endedAt: millis(event.endedAt),
    countdownEndsAt: millis(event.countdownEndsAt),
    vaultBeforeWei: event.vaultBeforeWei ?? null,
    vaultAfterWei: event.vaultAfterWei ?? null,
  };
}

function onchainSecondsOf(data: Record<string, unknown>) {
  const raw = data.onchainSeconds;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function lostAmount(before: string | null | undefined, after: string | null | undefined) {
  if (!before || !after) return null;
  try {
    const drop = BigInt(before) - BigInt(after);
    if (drop < BigInt(0)) return null;
    const text = formatWei(drop.toString());
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

function elapsedLabel(start: number | null, end: number | null, now: number) {
  if (start == null) return "";
  const seconds = Math.max(0, ((end ?? now) - start) / 1000);
  if (end == null) return `${seconds.toFixed(1)}s`;
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

function groupOf(sources: readonly string[], parts: Record<string, Part>) {
  const rows = sources.map((id) => parts[id]).filter((row): row is Part => Boolean(row));
  const failed = rows.find((row) => row.status === "failed");
  const last = parts[sources[sources.length - 1]];
  let status: "idle" | PartStatus = "idle";
  if (failed) status = "failed";
  else if (last?.status === "done") status = "done";
  else if (rows.some((row) => row.status === "running" || row.status === "pending" || row.status === "done")) status = "running";
  const started = rows.reduce<number | null>((min, row) => (row.startedAt == null ? min : min == null ? row.startedAt : Math.min(min, row.startedAt)), null);
  const ended = status === "done" || status === "failed" ? rows.reduce<number | null>((max, row) => (row.endedAt == null ? max : max == null ? row.endedAt : Math.max(max, row.endedAt)), null) : null;
  const hashes = rows.flatMap((row) => row.hashes);
  const urls = rows.flatMap((row) => row.urls);
  const feeWei = rows.reduce((sum, row) => addWei(sum, row.feeWei), "0");
  const countdownEndsAt = rows.reduce<number | null>((value, row) => row.countdownEndsAt ?? value, null);
  return { status, detail: failed?.detail || last?.detail || "", hashes, urls, feeWei, started, ended, countdownEndsAt };
}

function bounced(detail: string) {
  return /enforcedpause/i.test(detail) || /reverted/i.test(detail);
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function StatusMark({ n, status, bad }: { n: number; status: "idle" | PartStatus; bad?: boolean }) {
  const failed = status === "failed" || bad;
  const done = status === "done" && !bad;
  const running = status === "running" || status === "pending";
  return (
    <span
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
        failed ? "border-dangerBorder bg-dangerBg text-dangerText" : done ? "border-safeBorder bg-safeBg text-safe" : running ? "border-info text-info" : "border-border text-textMuted"
      }`}
      aria-hidden
    >
      {running ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {done ? <Check className="h-3.5 w-3.5" /> : null}
      {failed ? <X className="h-3.5 w-3.5" /> : null}
      {!running && !done && !failed ? n : null}
    </span>
  );
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const size = 88;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const frac = total <= 0 ? 0 : Math.max(0, Math.min(1, remaining / total));
  const shown = Math.max(0, Math.ceil(remaining));
  return (
    <div className="relative h-[76px] w-[76px] shrink-0 sm:h-[96px] sm:w-[96px]" role="timer" aria-label={`Strike in ${shown} seconds`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#3A1519" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FF4D5E"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * frac} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
        <span className="text-[8px] font-semibold leading-none tracking-wide text-[#FF8A95] sm:text-[9px]">STRIKE IN</span>
        <span className="font-display text-lg font-semibold leading-none tabular-nums text-[#FF4D5E] sm:text-2xl">{shown}s</span>
      </div>
    </div>
  );
}

function SentinelTrack({ phase }: { phase: SentinelPhase }) {
  return (
    <ol className="min-w-0 space-y-0.5" aria-label="SENTINEL status">
      {phaseCopy.map((item) => {
        const current = item.id === phase;
        const passed = phaseRank[item.id] < phaseRank[phase];
        return (
          <li key={item.id} className={`text-xs leading-4 ${current ? (item.id === "paused" ? "font-semibold text-safe" : item.id === "threat" ? "font-semibold text-warn" : "font-semibold text-text") : passed ? "text-textMuted" : "text-[#4C586A]"}`}>
            {item.label}
          </li>
        );
      })}
    </ol>
  );
}

export function DemoConsole() {
  usePageTitle("Attack Simulator");
  const [chain, setChain] = useState<Chain>("bsc");
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [phase, setPhase] = useState<SentinelPhase>("watching");
  const [pauseSeconds, setPauseSeconds] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [armed, setArmed] = useState(false);
  const [manual, setManual] = useState<Partial<Record<StepId | ExtraId, ManualState>>>({});
  const [balances, setBalances] = useState<DemoProgress | null>(null);
  const [fresh, setFresh] = useState("");
  const [attacker, setAttacker] = useState("");

  const chainRef = useRef(chain);
  const runIdRef = useRef("");
  const expectRun = useRef(false);
  const launchedAt = useRef(0);
  const incidentRef = useRef("");
  chainRef.current = chain;

  const now = useNow(armed);
  const meta = chainMeta[chain];
  const ready = chainReady[chain];
  const manualBusy = Object.values(manual).some((item) => item?.status === "pending");
  const running = armed || launching || manualBusy;

  useEffect(() => {
    expectRun.current = false;
    runIdRef.current = "";
    incidentRef.current = "";
    launchedAt.current = 0;
    setParts({});
    setPhase("watching");
    setPauseSeconds(null);
    setError("");
    setArmed(false);
    setLaunching(false);
    setManual({});
    setBalances(null);
    setFresh("");
    setAttacker("");
  }, [chain]);

  useEffect(() => {
    const socket = liveSocket();
    if (!socket) return undefined;

    const onStep = (payload: unknown) => {
      if (!isStepEvent(payload) || !expectRun.current) return;
      if (runIdRef.current && payload.runId !== runIdRef.current) return;
      if (!runIdRef.current) runIdRef.current = payload.runId;
      if (payload.step === "run" && payload.status === "failed") {
        setError(payload.detail || "Attack run failed");
        expectRun.current = false;
        setArmed(false);
        setLaunching(false);
        return;
      }
      setParts((current) => ({ ...current, [payload.step]: partFrom(payload) }));
      if (payload.status === "failed" || (payload.step === "strike" && payload.status === "done")) {
        expectRun.current = false;
        setArmed(false);
        setLaunching(false);
      }
    };

    const onStage = (payload: Record<string, unknown>) => {
      if (!launchedAt.current) return;
      if (payloadChain(payload) !== chainRef.current) return;
      const at = typeof payload.at === "string" ? Date.parse(payload.at) : NaN;
      if (Number.isFinite(at) && at < launchedAt.current - 2000) return;
      const incidentId = typeof payload.incidentId === "string" ? payload.incidentId : "";
      const stage = typeof payload.stage === "string" ? payload.stage : "";
      if (stage === "probe_detected" && incidentId && !incidentRef.current) incidentRef.current = incidentId;
      if (incidentRef.current && incidentId && incidentId !== incidentRef.current) return;
      const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
      if (stage === "probe_detected" || stage === "trace_complete" || stage === "simulation_complete") {
        setPhase((current) => (phaseRank.threat > phaseRank[current] ? "threat" : current));
      }
      if (stage === "cre_submitted" || stage === "cre_verdict") {
        setPhase((current) => (phaseRank.verdict > phaseRank[current] ? "verdict" : current));
      }
      if (stage === "pause_confirmed") {
        setPhase("paused");
        const seconds = onchainSecondsOf(data);
        if (seconds != null) setPauseSeconds(seconds);
      }
    };

    socket.on("demo:step", onStep);
    socket.on("warroom:stage", onStage);
    return () => {
      socket.off("demo:step", onStep);
      socket.off("warroom:stage", onStage);
    };
  }, []);

  async function launch() {
    setError("");
    setParts({});
    setPhase("watching");
    setPauseSeconds(null);
    setLaunching(true);
    setArmed(true);
    expectRun.current = true;
    runIdRef.current = "";
    incidentRef.current = "";
    launchedAt.current = Date.now();
    try {
      const body = await demoApi<{ runId: string }>(`/demo/${meta.chainId}/run-attack`, {
        method: "POST",
        body: JSON.stringify({ strikeDelaySec: STRIKE_DELAY }),
      });
      if (!runIdRef.current) runIdRef.current = body.runId;
      setLaunching(false);
    } catch (err) {
      expectRun.current = false;
      launchedAt.current = 0;
      setArmed(false);
      setLaunching(false);
      setError(err instanceof Error ? err.message : "Could not launch the attack.");
    }
  }

  function applyManual(body: DemoActionBody) {
    if (!body.action) return;
    const status: StepStatus =
      body.status === "confirmed" ? "confirmed" : body.status === "reverted" ? "reverted" : body.status === "pending" ? "pending" : body.status === "failed" ? "failed" : "idle";
    const state: ManualState = {
      status,
      line: body.line,
      detail: body.error || body.result?.revertReason || undefined,
      txs: (body.txs ?? []).map((tx) => ({
        label: tx.label,
        hash: tx.hash,
        fee: tx.gasCostNative,
        status: tx.status,
        explorerUrl: tx.explorerUrl,
      })),
    };
    setManual((current) => ({ ...current, [body.action as StepId | ExtraId]: state }));
    if (body.result?.freshWallet) setFresh(body.result.freshWallet);
    if (body.result?.attackerContract) setAttacker(body.result.attackerContract);
  }

  async function runManual(action: StepId | ExtraId) {
    setError("");
    setManual((current) => ({ ...current, [action]: { status: "pending" } }));
    try {
      if (action === "status") {
        const progress = await demoApi<DemoProgress>(`/demo/${meta.chainId}/status`);
        setBalances(progress);
        setFresh(progress.freshWallet?.address ?? "");
        setAttacker(progress.attackerContract?.address ?? "");
        applyManual({ action, chainId: meta.chainId, status: "confirmed", line: "Wallet balances loaded" });
        return;
      }
      const body = await demoApi<DemoActionBody>(`/demo/${meta.chainId}/${action}`, { method: "POST" });
      applyManual(body.action ? body : { ...body, action });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo request failed.";
      applyManual({ action, chainId: meta.chainId, status: "failed", error: message, line: message });
      setError(message);
    }
  }

  const strike = groupOf(["strike"], parts);
  const strikeBad = strike.status === "done" && !bounced(strike.detail);
  const showSummary = strike.status === "done";
  const pauseText = pauseSeconds == null ? "—" : Number.isInteger(pauseSeconds) ? String(pauseSeconds) : pauseSeconds.toFixed(1);
  const lostText = lostAmount(parts.strike?.vaultBeforeWei, parts.strike?.vaultAfterWei) ?? "—";
  const lines: Record<SimId, string> = {
    launder: "Fresh wallet funded through a mixer (2 tx)",
    allowlist: "Our demo vault only accepts allowlisted wallets so strangers can't drain it. Real attackers don't need this.",
    deploy: "Puts the exploit contract on chain.",
    probe: `A small re-entrancy test: takes 0.0005 ${meta.symbol}`,
    clock: "The strike is scheduled. SENTINEL has until then.",
    strike: "The attacker sends the real withdrawal.",
  };

  return (
    <Card className="mx-auto max-w-xl p-3 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {(["bsc", "base"] as Chain[]).map((item) => (
            <button
              key={item}
              type="button"
              disabled={running || !chainReady[item]}
              title={chainReady[item] ? chainMeta[item].label : "Not deployed"}
              onClick={() => setChain(item)}
              className={`h-9 rounded-control px-3 text-sm font-medium ${item === chain ? "bg-text text-bg" : "border border-border text-textMuted"} disabled:opacity-50`}
            >
              {chainMeta[item].short}
            </button>
          ))}
        </div>
        <button type="button" disabled={!ready || running} onClick={() => void launch()} className={`${buttonClass.danger} h-12 w-full px-5 text-base sm:w-auto`}>
          {armed || launching ? "Attack running…" : "▶ Launch attack"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-dangerText">{error}</p> : null}

      <ol className="mt-3" aria-live="polite">
        {simulator.map((step) => {
          const group = groupOf(step.sources, parts);
          const bad = step.id === "strike" && strikeBad;
          const fee = formatWei(group.feeWei);
          const markStatus = bad ? "failed" : group.status;
          return (
            <li key={step.id} className="flex gap-2.5 border-t border-border py-2 first:border-t-0">
              <StatusMark n={step.n} status={markStatus} bad={bad} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium leading-5">{step.title}</h3>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-textMuted">{elapsedLabel(group.started, group.ended, now)}</span>
                </div>
                {step.id !== "clock" && step.id !== "strike" ? <p className="text-xs leading-snug text-textMuted">{lines[step.id]}</p> : null}
                {step.id === "clock" && group.status === "idle" ? <p className="text-xs leading-snug text-textMuted">{lines.clock}</p> : null}
                {step.id === "strike" && group.status === "idle" ? <p className="text-xs leading-snug text-textMuted">{lines.strike}</p> : null}
                {step.id === "clock" && group.status !== "idle" ? (
                  <div className="mt-1.5 flex items-center gap-3">
                    <CountdownRing
                      remaining={group.countdownEndsAt == null ? STRIKE_DELAY : Math.max(0, (group.countdownEndsAt - now) / 1000)}
                      total={group.started != null && group.countdownEndsAt != null ? Math.max(1, (group.countdownEndsAt - group.started) / 1000) : STRIKE_DELAY}
                    />
                    <SentinelTrack phase={phase} />
                  </div>
                ) : null}
                {step.id === "strike" && group.status === "done" ? (
                  <p className={`mt-1 text-sm font-medium ${bad ? "text-dangerText" : "text-safe"}`}>{bad ? "Vault drained" : "Bounced: EnforcedPause()"}</p>
                ) : null}
                {group.status === "failed" ? <p className="mt-1 text-xs text-dangerText">{group.detail || "Step failed"}</p> : null}
                {group.hashes.length > 0 ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    {group.hashes.map((hash, index) => (
                      <a key={`${hash}-${index}`} href={group.urls[index] || txUrl(chain, hash)} target="_blank" rel="noreferrer" className="font-mono text-info hover:underline">
                        {shortAddress(hash)}
                      </a>
                    ))}
                    {fee && fee !== "0" ? (
                      <span className="font-mono text-textMuted">
                        fee {fee} {meta.symbol}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {showSummary ? (
        <div className={`mt-2 rounded-control border px-3 py-2 text-sm ${strikeBad ? "border-dangerBorder bg-dangerBg text-dangerText" : "border-safeBorder bg-safeBg text-safe"}`}>
          SENTINEL paused in {pauseText}s · attacker struck at {STRIKE_DELAY}s · lost {lostText}
          {lostText !== "—" ? ` ${meta.symbol}` : ""}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-textMuted">
        <Link href={`/app/war-room?chain=${meta.chainId}`} className="text-info hover:underline">
          War room
        </Link>
        {fresh ? (
          <a href={explorerAddress(chain, fresh)} target="_blank" rel="noreferrer" className="font-mono text-info hover:underline">
            Fresh {shortAddress(fresh)}
          </a>
        ) : null}
        {attacker ? (
          <a href={explorerAddress(chain, attacker)} target="_blank" rel="noreferrer" className="font-mono text-info hover:underline">
            Exploit {shortAddress(attacker)}
          </a>
        ) : null}
      </div>

      <details className="mt-3 rounded-control border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm text-textMuted">Advanced</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {manualOrder.map((action) => (
            <Button key={action} variant="secondary" className="h-9 px-3 text-xs" disabled={!ready || running} onClick={() => void runManual(action)}>
              {manualLabels[action]}
            </Button>
          ))}
          {(Object.keys(extraLabels) as ExtraId[]).map((action) => (
            <Button key={action} variant="ghost" className="h-9 px-3 text-xs" disabled={!ready || running} onClick={() => void runManual(action)}>
              {extraLabels[action]}
            </Button>
          ))}
        </div>
        <div className="mt-2 space-y-2">
          {(Object.keys(manual) as (StepId | ExtraId)[]).map((action) => {
            const state = manual[action];
            if (!state || state.status === "idle") return null;
            const failed = state.status === "reverted" || state.status === "failed";
            const label = action in manualLabels ? manualLabels[action as StepId] : extraLabels[action as ExtraId];
            return (
              <div key={action} className="text-xs">
                <p className={failed ? "text-dangerText" : state.status === "pending" ? "text-info" : "text-safe"}>
                  {state.status === "pending" ? `${label}…` : state.line || state.detail || label}
                </p>
                {state.txs?.map((tx) => (
                  <a key={tx.hash} href={tx.explorerUrl || txUrl(chain, tx.hash)} target="_blank" rel="noreferrer" className="mt-0.5 block font-mono text-info hover:underline">
                    {shortAddress(tx.hash)}
                    {tx.fee ? ` · fee ${tx.fee} ${meta.symbol}` : ""}
                  </a>
                ))}
              </div>
            );
          })}
        </div>
        {balances?.vault ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-textMuted">
            Vault
            <a href={explorerAddress(chain, balances.vault.address)} target="_blank" rel="noreferrer" className="font-mono text-info hover:underline">
              {shortAddress(balances.vault.address)}
            </a>
            <span className="font-mono">
              {formatWei(balances.vault.balanceWei)} {balances.native || meta.symbol}
            </span>
          </p>
        ) : null}
      </details>
    </Card>
  );
}
