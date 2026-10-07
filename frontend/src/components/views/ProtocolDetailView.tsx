"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityTable } from "@/components/ui/ActivityTable";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChainPill } from "@/components/ui/ChainPill";
import { ConfirmDangerModal } from "@/components/ui/ConfirmDangerModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { TrendChart } from "@/components/ui/TrendChart";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useVaultReads } from "@/hooks/useVaultReads";
import { useActivity, useConsole, useIncidents, useProtocols } from "@/hooks/useSentinel";
import { healthFor } from "@/lib/chains";
import type { Chain } from "@/lib/types";
import { outcomePill, pauseMethodLabel, protocolLabel, protocolPill } from "@/lib/labels";
import { formatUsd } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useSystem } from "@/providers/SystemProvider";
import { useToast } from "@/providers/ToastProvider";
import { LocalTime } from "@/components/ui/LocalTime";

const tabs = ["Overview", "Contracts", "Activity", "Settings"] as const;

export function ProtocolDetailView({ id }: { id: string }) {
  const { data: protocols = [] } = useProtocols();
  const protocol = protocols.find((item) => item.id === id);
  const { data: incidents = [] } = useIncidents();
  const { data: activity = [] } = useActivity();
  const consoleApi = useConsole();
  const { session } = useAuth();
  const { health } = useSystem();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [pauseOpen, setPauseOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pauseAt, setPauseAt] = useState(protocol?.policy.pauseThreshold ?? 80);
  const [alertAt, setAlertAt] = useState(protocol?.policy.alertThreshold ?? 40);
  const [autoPause, setAutoPause] = useState(protocol?.policy.autoPause ?? true);
  usePageTitle(protocol ? protocolLabel(protocol.name, protocol.chains) : "Protocol");

  if (!protocol) {
    return <EmptyState title="Protocol not found" body="It may have been removed from this browser." action={<Link href="/app/protocols" className="text-info">Back to protocols</Link>} />;
  }

  const pill = protocolPill(protocol.status);
  const protocolIncidents = incidents.filter((incident) => incident.protocolId === protocol.id);
  const rows = activity.filter((row) => row.protocolId === protocol.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark name={protocol.name} logoUrl={protocol.logoUrl} />
          <div>
            <h2 className="font-display text-3xl font-medium">{protocolLabel(protocol.name, protocol.chains)}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {protocol.chains.map((chain) => (
                <ChainPill key={chain} chain={chain} health={healthFor(chain, health)} />
              ))}
              <StatusPill tone={pill.tone} label={pill.label} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => setPauseOpen(true)}>
            Pause now
          </Button>
          <Button variant="secondary" onClick={() => setTab("Settings")}>
            Settings
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Protocol sections" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={`h-11 rounded-control px-4 text-sm ${tab === item ? "bg-text text-bg" : "border border-border bg-panel text-text"}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 font-display text-lg font-medium">TVL, 7 days</h3>
            <TrendChart data={protocol.tvl7d} dataKey="tvl" name="TVL" color="#8FB0FF" currency />
          </Card>
          <Card>
            <h3 className="mb-3 font-display text-lg font-medium">Risk score, 7 days</h3>
            <TrendChart data={protocol.risk7d} dataKey="score" name="Score" color="#FF6B6B" />
          </Card>
          <Card className="lg:col-span-2">
            <h3 className="mb-3 font-display text-lg font-medium">Incidents</h3>
            {protocolIncidents.length === 0 ? (
              <p className="text-sm text-textMuted">No incidents for this protocol.</p>
            ) : (
              <ul className="divide-y divide-border">
                {protocolIncidents.map((incident) => {
                  const outcome = outcomePill(incident.outcome);
                  return (
                    <li key={incident.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <Link href={`/app/incidents/${incident.id}`} className="font-medium text-info">
                        Score {incident.score}
                      </Link>
                      <StatusPill tone={outcome.tone} label={outcome.label} />
                      <span>{formatUsd(incident.valueAtRiskUsd)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "Contracts" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-textMuted">
                <tr>
                  {["Contract", "Address", "Chain", "Pause method", "Guardian"].map((heading) => (
                    <th key={heading} className="px-3 py-2 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {protocol.contracts.map((contract) => (
                  <tr key={contract.id} className="border-t border-border">
                    <td className="px-3 py-3">{contract.label}</td>
                    <td className="px-3 py-3">
                      <Address address={contract.address} chain={contract.chain} />
                    </td>
                    <td className="px-3 py-3">
                      <ChainPill chain={contract.chain} health={healthFor(contract.chain, health)} />
                    </td>
                    <td className="px-3 py-3">{pauseMethodLabel[contract.pauseMethod]}</td>
                    <td className="px-3 py-3">
                      <VaultGrant chain={contract.chain} vault={contract.address} guardian={protocol.guardian} fallback={contract.guardianGranted} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "Activity" ? (
        <Card>
          <ActivityTable rows={rows} protocols={protocols} showProtocol chainHealth={{ bsc: health.bsc, base: health.base }} />
        </Card>
      ) : null}

      {tab === "Settings" ? (
        <div className="space-y-4">
          <Card>
            <h3 className="font-display text-lg font-medium">Thresholds</h3>
            <label className="mt-4 block text-sm">
              Pause threshold <span className="font-mono">{pauseAt}</span>
              <input className="mt-2 w-full" type="range" min={50} max={100} value={pauseAt} onChange={(event) => setPauseAt(Number(event.target.value))} />
            </label>
            <label className="mt-4 block text-sm">
              Alert threshold <span className="font-mono">{alertAt}</span>
              <input
                className="mt-2 w-full"
                type="range"
                min={1}
                max={pauseAt}
                value={Math.min(alertAt, pauseAt)}
                onChange={(event) => setAlertAt(Number(event.target.value))}
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoPause} onChange={(event) => setAutoPause(event.target.checked)} />
              Auto-pause {autoPause ? "ON" : "OFF"}
            </label>
            <p className="mt-2 text-xs text-textMuted">Detection rules run inside a Chainlink CRE confidential workflow and are not shown.</p>
            <Button
              className="mt-4"
              onClick={() => {
                consoleApi.updatePolicy(
                  protocol.id,
                  { ...protocol.policy, pauseThreshold: pauseAt, alertThreshold: Math.min(alertAt, pauseAt), autoPause },
                  {
                    protocolId: protocol.id,
                    at: new Date().toISOString(),
                    block: protocol.lastEventBlock + 1,
                    who: session?.name ?? "You",
                    text: `Pause threshold ${pauseAt}, alert threshold ${Math.min(alertAt, pauseAt)}, auto-pause ${autoPause ? "on" : "off"}.`,
                  },
                );
                toast("Policy saved");
              }}
            >
              Save policy
            </Button>
          </Card>
          <Card className="border-dangerBorder">
            <h3 className="font-display text-lg font-medium text-dangerText">Danger zone</h3>
            <p className="mt-2 text-sm text-textMuted">Removing a protocol stops watching. It does not unpause contracts.</p>
            <Button variant="danger" className="mt-4" onClick={() => setRemoveOpen(true)}>
              Remove protocol
            </Button>
          </Card>
        </div>
      ) : null}

      <ConfirmDangerModal
        open={pauseOpen}
        title="Pause now"
        description="This asks the Guardian to pause. SENTINEL still cannot unpause or move funds."
        expected={protocol.name}
        confirmLabel="Pause now"
        onClose={() => setPauseOpen(false)}
        onConfirm={() => {
          setPauseOpen(false);
          toast("Pause is sent by the Guardian after a CRE verdict.");
        }}
      />
      <ConfirmDangerModal
        open={removeOpen}
        title="Remove protocol"
        description="SENTINEL will stop watching these contracts."
        expected={protocol.name}
        confirmLabel="Remove protocol"
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => {
          consoleApi.removeProtocol(protocol.id);
          toast(`${protocolLabel(protocol.name, protocol.chains)} removed`);
          router.push("/app/protocols");
        }}
      />
      {protocol.lastEventAt ? (
        <p className="sr-only">
          Last event <LocalTime at={protocol.lastEventAt} block={protocol.lastEventBlock} />
        </p>
      ) : null}
    </div>
  );
}

function VaultGrant({ chain, vault, guardian, fallback }: { chain: Chain; vault: string; guardian?: string; fallback: boolean }) {
  const { data } = useVaultReads(chain, vault, guardian);
  const granted = data?.pauserGranted ?? fallback;
  return (
    <span className={granted ? "text-safe" : "text-dangerText"}>
      PAUSER_ROLE {granted ? "✓" : "✗"}
      {data?.paused == null ? "" : data.paused ? " · paused" : " · not paused"}
      {data?.balance != null ? ` · ${data.balance} ${data.symbol}` : ""}
    </span>
  );
}

function LogoMark({ name, logoUrl }: { name: string; logoUrl?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="h-12 w-12 rounded-control border border-border object-cover" />;
  }
  return <span className="flex h-12 w-12 items-center justify-center rounded-control border border-border bg-panel2 font-display text-lg">{name.slice(0, 1)}</span>;
}
