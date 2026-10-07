"use client";

import Link from "next/link";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDangerModal } from "@/components/ui/ConfirmDangerModal";
import { CreStepper } from "@/components/ui/CreStepper";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { RiskRing } from "@/components/ui/RiskRing";
import { SignalBar } from "@/components/ui/SignalBar";
import { StatusPill } from "@/components/ui/StatusPill";
import { Timeline } from "@/components/ui/Timeline";
import { TraceTree } from "@/components/ui/TraceTree";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useIncident, useProtocols, useStats } from "@/hooks/useSentinel";
import { chainMeta, PUBLIC_MODE } from "@/lib/chains";
import { ReadOnlyDemo } from "@/components/ui/ReadOnlyDemo";
import { exploitTitle, incidentStatusPill } from "@/lib/labels";
import { downloadPostMortem } from "@/lib/pdf";
import { explainTxError } from "@/lib/txError";
import { vaultAbi } from "@/lib/abi";
import { formatUsd, formatWei, weiToUsd } from "@/lib/utils";
import { ChainPill } from "@/components/ui/ChainPill";
import { useSystem } from "@/providers/SystemProvider";
import { TxPreview } from "@/components/tx/TxPreview";
import { SignInButton } from "@/components/auth/SignInButton";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { formatEther, isAddress } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";

export function IncidentView({ id }: { id: string }) {
  const { data: incident, isLoading, isError } = useIncident(id);
  const { data: protocols = [] } = useProtocols();
  const protocol = protocols.find((item) => item.id === incident?.protocolId);
  const { data: stats } = useStats();
  const { health } = useSystem();
  const { session } = useAuth();
  const toast = useToast();
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [unpause, setUnpause] = useState(false);
  const [falsePositive, setFalsePositive] = useState(false);
  const [traceTab, setTraceTab] = useState<"probe" | "strike">("probe");
  const [preview, setPreview] = useState<{ fee: string } | null>(null);
  const [txError, setTxError] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const protocolName = protocol?.name || incident?.protocolName || "";
  const blockedTitle = incident?.status === "paused" || incident?.status === "reverted_strike";
  usePageTitle(incident && protocolName ? (blockedTitle ? exploitTitle(protocolName) : protocolName) : "Incident");

  if (isLoading) {
    return <EmptyState title="Loading incident" body="Fetching this post-mortem from the backend." />;
  }

  if (isError || !incident) {
    return <EmptyState title="Incident not found" body="The backend has no post-mortem with that id." action={<Link href="/app/incidents" className="text-info">Back to incidents</Link>} />;
  }

  const named = protocolName || incident.protocolId;
  const vault = (incident.vaultAddress || protocol?.contracts[0]?.address || "") as `0x${string}`;
  const admin = (protocol?.admin || "").toLowerCase();
  const isAdmin = Boolean(address && admin && address.toLowerCase() === admin);
  const symbol = incident.nativeSymbol ?? chainMeta[incident.chain].symbol;
  const price = stats?.valueProtectedNative.find((item) => item.chain === incident.chain);
  const riskNative = formatWei(incident.valueAtRiskWei);
  const riskUsd = weiToUsd(incident.valueAtRiskWei, price);
  const lostNative = formatWei(incident.strikeLossWei || incident.fundsLostWei || "0") || "0";
  const lostUsd = weiToUsd(incident.strikeLossWei || incident.fundsLostWei || "0", price);
  const probeNative = formatWei(incident.probeCostWei || "0") || "0";
  const probeUsd = weiToUsd(incident.probeCostWei || "0", price);
  const vaultPct = incident.vaultDeltaBps == null ? null : formatBps(incident.vaultDeltaBps);
  const before = formatWei(incident.vaultBalanceWei);
  const afterWei = subtractWei(incident.vaultBalanceWei, incident.valueAtRiskWei);
  const after = formatWei(afterWei);
  const pauseLabel = incident.testToPauseSec == null ? "Probe → pause not recorded" : `${incident.testToPauseSec}s probe → pause`;
  const traceNodes = traceTab === "strike" ? incident.strikeTrace ?? [] : incident.probeTrace ?? incident.trace;
  const statusPill = incidentStatusPill(incident.status);
  const blocked = incident.status === "paused" || incident.status === "reverted_strike";
  const headline = blocked ? exploitTitle(named) : incident.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs text-textMuted">{incident.id}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-3xl font-medium">{headline}</h2>
            {incident.source === "test" ? <StatusPill tone="muted" label="Test" /> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ChainPill chain={incident.chain} health={incident.chain === "bsc" ? health.bsc : health.base} />
            <StatusPill tone={statusPill.tone} label={statusPill.label} />
            <StatusPill tone={incident.score >= (incident.threshold ?? 80) ? "danger" : "warn"} label={`Score ${incident.score}`} />
          </div>
          <p className="mt-3 font-display text-xl tabular-nums">
            {riskNative ? `${riskNative} ${symbol}` : "—"}
            {riskUsd == null ? "" : ` · ${formatUsd(riskUsd)}`}
            {vaultPct ? ` · ${vaultPct} of vault` : ""}
          </p>
          <p className="mt-1 text-sm text-textMuted">
            Value at risk · Lost to the strike: {lostNative} {symbol}
            {lostUsd == null ? "" : ` (${formatUsd(lostUsd)})`}
            {" · "}Probe cost: {probeNative} {symbol}
            {probeUsd == null ? "" : ` (${formatUsd(probeUsd)})`}
            {" · "}Allowlisted demo vault on mainnet
          </p>
          <p className="mt-1 font-mono text-sm">
            {pauseLabel}
            {incident.resent ? <span className="ml-2 text-xs text-textMuted">· re-sent after payload fix</span> : null}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!protocol} onClick={() => protocol && downloadPostMortem(incident, protocol)}>
            Download post-mortem (PDF)
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                toast("Link copied");
              } catch {
                toast("Could not copy the link");
              }
            }}
          >
            Copy link
          </Button>
          {PUBLIC_MODE ? (
            <ReadOnlyDemo />
          ) : session ? (
            <>
              <Button variant="secondary" onClick={() => setFalsePositive(true)} disabled={incident.outcome === "false-positive"}>
                Mark as false positive
              </Button>
              <Button variant="danger" onClick={() => setUnpause(true)} disabled={!isAdmin || !isAddress(vault)}>
                Unpause
              </Button>
            </>
          ) : (
            <SignInButton />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <h3 className="mb-4 font-display text-lg font-medium">Attack timeline</h3>
          <Timeline items={incident.timeline} chain={incident.chain} />
        </Card>
        <Card>
          <h3 className="mb-4 font-display text-lg font-medium">Risk score</h3>
          <RiskRing score={incident.score} threshold={incident.threshold ?? 80} />
          <div className="mt-5 space-y-4">
            {incident.signals.map((signal) => (
              <SignalBar key={signal.key} signal={signal} />
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1">
          <h3 className="mb-4 font-display text-lg font-medium">Execution trace</h3>
          <div className="mb-3 flex gap-2">
            <Button variant={traceTab === "probe" ? "primary" : "secondary"} onClick={() => setTraceTab("probe")}>
              Probe (on-chain)
            </Button>
            <Button variant={traceTab === "strike" ? "primary" : "secondary"} onClick={() => setTraceTab("strike")}>
              Simulated strike
            </Button>
          </div>
          {traceNodes.length === 0 ? <p className="text-sm text-textMuted">No trace stored for this incident.</p> : <TraceTree nodes={traceNodes} />}
          {traceTab === "strike" && before ? (
            <p className="mt-4 font-mono text-sm">
              {before} {symbol} → {after} {symbol}
              {vaultPct ? ` · ${vaultPct} loss` : ""}
            </p>
          ) : null}
        </Card>
      </div>

      <Card>
        <h3 className="font-display text-lg font-medium">What happened</h3>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-text">{incident.explanation}</p>
      </Card>

      <Card>
        <h3 className="mb-4 flex items-center font-display text-lg font-medium">
          CRE verdict
          <Tip text="Runs in the CRE simulator (single node) today; DON consensus when deployed." />
        </h3>
        {incident.cre.length === 0 ? <p className="text-sm text-textMuted">No CRE verdict recorded.</p> : <CreStepper steps={incident.cre} chain={incident.chain} />}
      </Card>

      <Card>
        <h3 className="mb-4 font-display text-lg font-medium">Attacker profile</h3>
        <div className="mb-4">
          <Address address={incident.attacker.address} chain={incident.chain} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Wallet age" value={incident.attacker.age} />
          <Info label="Funding source" value={incident.attacker.fundingSource} />
          <Info label="Contracts deployed" value={incident.attacker.contractsDeployed.join(", ")} />
          <Info label="Other protocols touched" value={incident.attacker.otherProtocols.join(", ")} />
        </dl>
      </Card>

      <ConfirmDangerModal
        open={unpause}
        title="Unpause"
        description={`SENTINEL cannot unpause. This sends vault.unpause() from the connected admin wallet on ${chainMeta[incident.chain].label}. Type ${named} to continue.`}
        expected={named}
        confirmLabel="Review fee"
        onClose={() => setUnpause(false)}
        onConfirm={() => {
          setUnpause(false);
          void (async () => {
            if (!address || !publicClient || !isAddress(vault)) return;
            setTxError("");
            setTxBusy(true);
            try {
              if (chainId !== chainMeta[incident.chain].chainId) await switchChainAsync({ chainId: chainMeta[incident.chain].chainId });
              const gas = await publicClient.estimateContractGas({ address: vault, abi: vaultAbi, functionName: "unpause", account: address });
              const gasPrice = await publicClient.getGasPrice();
              setPreview({ fee: formatEther(gas * gasPrice) });
            } catch (err) {
              setTxError(explainTxError(err));
              toast(explainTxError(err));
            } finally {
              setTxBusy(false);
            }
          })();
        }}
      />
      <TxPreview
        open={Boolean(preview)}
        chainName={chainMeta[incident.chain].label}
        action="vault.unpause()"
        fee={preview?.fee ?? "—"}
        symbol={chainMeta[incident.chain].symbol}
        busy={txBusy}
        error={txError}
        onClose={() => setPreview(null)}
        onSend={() => {
          if (!address || !publicClient || !isAddress(vault)) return;
          setTxBusy(true);
          void writeContractAsync({ address: vault, abi: vaultAbi, functionName: "unpause", account: address })
            .then(async (hash) => {
              const receipt = await publicClient.waitForTransactionReceipt({ hash });
              if (receipt.status === "reverted") throw new Error("Transaction reverted.");
              toast("Unpause confirmed");
              setPreview(null);
            })
            .catch((err: unknown) => setTxError(explainTxError(err)))
            .finally(() => setTxBusy(false));
        }}
      />

      <Modal open={falsePositive} title="Mark as false positive" onClose={() => setFalsePositive(false)}>
        <p className="mt-2 text-sm text-textMuted">
          TODO: the backend has no POST /incidents/:id/false-positive yet. This does not change the incident.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setFalsePositive(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function formatBps(bps: number) {
  const pct = bps / 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}

function subtractWei(left: string, right: string) {
  try {
    const value = BigInt(left || "0") - BigInt(right || "0");
    return (value > BigInt(0) ? value : BigInt(0)).toString();
  } catch {
    return "0";
  }
}

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative ml-2 inline-flex">
      <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs text-textMuted" aria-label={text}>
        ?
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-72 rounded-control border border-border bg-panel2 px-2 py-1 text-xs font-sans normal-case tracking-normal text-textMuted group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-textMuted">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
