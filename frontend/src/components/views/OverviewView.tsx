"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityTable } from "@/components/ui/ActivityTable";
import { Card } from "@/components/ui/Card";
import { ChainPill } from "@/components/ui/ChainPill";
import { ConfirmDangerModal } from "@/components/ui/ConfirmDangerModal";
import { EmptyState, ErrorCard } from "@/components/ui/EmptyState";
import { KpiTile } from "@/components/ui/KpiTile";
import { LocalTime } from "@/components/ui/LocalTime";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatusPill } from "@/components/ui/StatusPill";
import { usePageTitle } from "@/hooks/usePageTitle";
import { SignInButton } from "@/components/auth/SignInButton";
import { useActivity, useIncidents, useProtocols, useStats } from "@/hooks/useSentinel";
import { isSignInMessage } from "@/lib/api";
import { healthFor } from "@/lib/chains";
import { exploitTitle, outcomePill, protocolLabel, protocolPill } from "@/lib/labels";
import { formatUsd, weiToUsd } from "@/lib/utils";
import { buttonClass } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useSystem } from "@/providers/SystemProvider";

export function OverviewView() {
  usePageTitle("Overview");
  const router = useRouter();
  const { health } = useSystem();
  const { session } = useAuth();
  const protocolsQuery = useProtocols();
  const incidentsQuery = useIncidents();
  const activityQuery = useActivity();
  const statsQuery = useStats();
  const protocols = protocolsQuery.data ?? [];
  const incidents = incidentsQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const stats = statsQuery.data;
  const hasData = Boolean(protocolsQuery.data || incidentsQuery.data || activityQuery.data || statsQuery.data);
  const loading = !hasData && (protocolsQuery.isPending || incidentsQuery.isPending || activityQuery.isPending || statsQuery.isPending);
  const failed = [protocolsQuery.error, incidentsQuery.error, activityQuery.error, statsQuery.error].find(
    (error) => error && !(error instanceof Error && isSignInMessage(error.message)),
  );
  const [unpauseId, setUnpauseId] = useState<string | null>(null);

  const active = incidents.find((incident) => incident.active);
  const activeProtocol = protocols.find((protocol) => protocol.id === active?.protocolId);
  const activePrice = stats?.valueProtectedNative.find((item) => item.chain === active?.chain);
  const activeStrikeUsd = active ? weiToUsd(active.strikeLossWei || active.fundsLostWei || "0", activePrice) : null;
  const activeProbeUsd = active ? weiToUsd(active.probeCostWei || "0", activePrice) : null;
  const contracts = protocols.reduce((sum, protocol) => sum + protocol.contracts.length, 0);
  const recent = [...incidents].slice(0, 3);

  return (
    <div className="space-y-4">
      {loading ? <EmptyState title="Loading" body="Reading protocols, incidents, and activity from the backend." /> : null}
      {failed ? (
        <ErrorCard
          message={failed instanceof Error ? failed.message : "Backend request failed."}
          onRetry={() => {
            void protocolsQuery.refetch();
            void incidentsQuery.refetch();
            void activityQuery.refetch();
            void statsQuery.refetch();
          }}
        />
      ) : null}
      {active && activeProtocol ? (
        <div className="flex flex-col gap-3 rounded-card border border-dangerBorder bg-dangerBg p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-medium text-dangerText">{exploitTitle(activeProtocol.name)}</h2>
            <p className="mt-1 text-sm text-text">
              Score {active.score}. Pause landed {active.testToPauseSec}s after probe(). Strike reverted. Lost to the strike: {activeStrikeUsd == null ? "—" : formatUsd(activeStrikeUsd)}. Probe cost: {activeProbeUsd == null ? "—" : formatUsd(activeProbeUsd)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/incidents/${active.id}`} className={buttonClass.danger}>
              View incident
            </Link>
            {session ? (
              <button type="button" className={buttonClass.secondary} onClick={() => setUnpauseId(activeProtocol.id)}>
                Unpause via multisig
              </button>
            ) : (
              <SignInButton />
            )}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Value protected"
          value={stats?.valueProtectedUsd == null ? "—" : stats.valueProtectedUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          hint={stats?.valueProtectedNative.map((item) => `${item.amount} ${item.symbol}`).join(" · ") || "From the backend"}
        />
        <KpiTile label="Attacks blocked" value={stats ? String(stats.attacksBlocked) : "—"} />
        <KpiTile
          label="Median test-call-to-pause"
          value={stats?.medianTestToPauseSec == null ? "—" : `${stats.medianTestToPauseSec}s`}
          hint={stats?.lastIncidentSeconds == null ? "Blocked incidents only" : `Last incident ${stats.lastIncidentSeconds}s`}
        />
        <KpiTile label="Funds lost" value={stats?.fundsLostUsd == null ? "—" : formatUsd(stats.fundsLostUsd)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {protocols.map((protocol) => {
          const pill = protocolPill(protocol.status);
          return (
            <Link key={protocol.id} href={`/app/protocols/${protocol.id}`} className="rounded-card border border-border bg-panel p-5 hover:bg-panel2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-medium">{protocolLabel(protocol.name, protocol.chains)}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {protocol.chains.map((chain) => (
                      <ChainPill key={chain} chain={chain} health={healthFor(chain, health)} />
                    ))}
                  </div>
                </div>
                <StatusPill tone={protocol.protectedVault ? "safe" : pill.tone} label={protocol.protectedVault ? "Protected" : pill.label} />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-display text-2xl tabular-nums">
                    {protocol.tvlNative ? `${protocol.tvlNative} ${protocol.nativeSymbol ?? ""}` : formatUsd(protocol.tvlUsd)}
                  </p>
                  <p className="mt-1 text-xs text-textMuted">Allowlisted demo vault on mainnet</p>
                  <p className="mt-1 text-xs text-textMuted">Protected {protocol.protectedVault ? "yes" : "no"}</p>
                </div>
                <Sparkline values={protocol.risk24h} />
              </div>
            </Link>
          );
        })}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">Live activity</h2>
          <Link href="/app/activity" className="text-sm text-info">
            View all
          </Link>
        </div>
        <ActivityTable rows={activity.slice(0, 10)} protocols={protocols} chainHealth={{ bsc: health.bsc, base: health.base }} />
      </Card>

      {recent.length === 0 ? (
        <EmptyState title="All quiet." body={`SENTINEL is watching ${contracts} contracts.`} />
      ) : (
        <Card>
          <h2 className="mb-3 font-display text-lg font-medium">Recent incidents</h2>
          <ul className="divide-y divide-border">
            {recent.map((incident) => {
              const protocol = protocols.find((item) => item.id === incident.protocolId);
              const pill = outcomePill(incident.outcome);
              return (
                <li key={incident.id}>
                  <Link href={`/app/incidents/${incident.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium">
                        {incident.outcome === "blocked" && (protocol?.name || incident.protocolName)
                          ? exploitTitle(protocol?.name || incident.protocolName)
                          : protocol
                            ? protocolLabel(protocol.name, protocol.chains)
                            : incident.protocolName || incident.protocolId}
                      </span>
                      <span className="mt-1 block text-sm text-textMuted">
                        {incident.timeline[0]?.at ? <LocalTime at={incident.timeline[0].at} block={incident.timeline[0].block} withDate /> : "—"}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-sm">Score {incident.score}</span>
                      {incident.source === "test" ? <StatusPill tone="muted" label="Test" /> : null}
                      <StatusPill tone={pill.tone} label={pill.label} />
                      <span className="text-sm">{formatUsd(incident.valueAtRiskUsd)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ConfirmDangerModal
        open={Boolean(unpauseId)}
        title="Unpause via multisig"
        description="SENTINEL cannot unpause or move funds. Open the incident and send unpause() from the vault admin wallet."
        expected={activeProtocol?.name ?? ""}
        confirmLabel="Open incident"
        onClose={() => setUnpauseId(null)}
        onConfirm={() => {
          if (active) router.push(`/app/incidents/${active.id}`);
          setUnpauseId(null);
        }}
      />
    </div>
  );
}
