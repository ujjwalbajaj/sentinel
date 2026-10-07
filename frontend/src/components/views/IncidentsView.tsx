"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChainPill } from "@/components/ui/ChainPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocalTime } from "@/components/ui/LocalTime";
import { SelectInput } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useIncidents, useProtocols } from "@/hooks/useSentinel";
import { outcomePill, protocolLabel } from "@/lib/labels";
import type { Chain, IncidentOutcome } from "@/lib/types";
import { formatUsd, inputClass } from "@/lib/utils";
import { useSystem } from "@/providers/SystemProvider";

export function IncidentsView() {
  usePageTitle("Incidents");
  const router = useRouter();
  const { data: incidents = [] } = useIncidents();
  const { data: protocols = [] } = useProtocols();
  const { health } = useSystem();
  const [chain, setChain] = useState<Chain | "all">("all");
  const [protocolId, setProtocolId] = useState("all");
  const [status, setStatus] = useState<IncidentOutcome | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(
    () =>
      incidents.filter((incident) => {
        const day = (incident.timeline[0]?.at ?? "").slice(0, 10);
        if (chain !== "all" && incident.chain !== chain) return false;
        if (protocolId !== "all" && incident.protocolId !== protocolId) return false;
        if (status !== "all" && incident.outcome !== status) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [incidents, chain, protocolId, status, from, to],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SelectInput value={chain} onChange={(event) => setChain(event.target.value as Chain | "all")} aria-label="Chain">
          <option value="all">All chains</option>
          <option value="base">Base</option>
          <option value="bsc">BNB Chain</option>
        </SelectInput>
        <SelectInput value={protocolId} onChange={(event) => setProtocolId(event.target.value)} aria-label="Protocol">
          <option value="all">All protocols</option>
          {protocols.map((protocol) => (
            <option key={protocol.id} value={protocol.id}>
              {protocolLabel(protocol.name, protocol.chains)}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value as IncidentOutcome | "all")} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="blocked">Blocked</option>
          <option value="alerted">Alerted</option>
          <option value="false-positive">False positive</option>
          <option value="open">Open</option>
        </SelectInput>
        <input className={inputClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
        <input className={inputClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No incidents" body="No incidents match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-panel">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-textMuted">
              <tr>
                {["Time", "Incident", "Protocol", "Chain", "Score", "Outcome", "Value at risk"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((incident) => {
                const protocol = protocols.find((item) => item.id === incident.protocolId);
                const pill = outcomePill(incident.outcome);
                const at = incident.timeline[incident.timeline.length - 1] ?? incident.timeline[0];
                return (
                  <tr
                    key={incident.id}
                    tabIndex={0}
                    className="cursor-pointer border-t border-border hover:bg-panel2"
                    onClick={() => router.push(`/app/incidents/${incident.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/app/incidents/${incident.id}`);
                    }}
                  >
                    <td className="px-4 py-3">{at?.at ? <LocalTime at={at.at} block={at.block} withDate /> : "—"}</td>
                    <td className="px-4 py-3 font-mono">{incident.id.slice(0, 6)}…</td>
                    <td className="px-4 py-3">
                      {protocol
                        ? protocolLabel(protocol.name, protocol.chains)
                        : incident.protocolName
                          ? protocolLabel(incident.protocolName, incident.chain)
                          : incident.protocolId}
                    </td>
                    <td className="px-4 py-3">
                      <ChainPill chain={incident.chain} health={incident.chain === "bsc" ? health.bsc : health.base} />
                    </td>
                    <td className="px-4 py-3 font-mono">{incident.score}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {incident.source === "test" ? <StatusPill tone="muted" label="Test" /> : null}
                        <StatusPill tone={pill.tone} label={pill.label} />
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatUsd(incident.valueAtRiskUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
