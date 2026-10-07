"use client";

import { useMemo, useState } from "react";
import { ActivityTable } from "@/components/ui/ActivityTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorCard } from "@/components/ui/EmptyState";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useActivity, useProtocols } from "@/hooks/useSentinel";
import { isSignInMessage } from "@/lib/api";
import { protocolLabel } from "@/lib/labels";
import type { Chain } from "@/lib/types";
import { useSystem } from "@/providers/SystemProvider";

export function ActivityView() {
  usePageTitle("Live activity");
  const activityQuery = useActivity();
  const protocolsQuery = useProtocols();
  const rows = activityQuery.data ?? [];
  const protocols = protocolsQuery.data ?? [];
  const { health, flashIds, freshId, streamPaused, setStreamPaused } = useSystem();
  const [chain, setChain] = useState<Chain | "all">("all");
  const [protocolId, setProtocolId] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (chain !== "all" && row.chain !== chain) return false;
      if (protocolId !== "all" && row.protocolId !== protocolId) return false;
      if (minScore > 0 && (row.score == null || row.score < minScore)) return false;
      if (!needle) return true;
      return row.from.toLowerCase().includes(needle) || row.txHash.toLowerCase().includes(needle) || row.event.toLowerCase().includes(needle);
    });
  }, [rows, chain, protocolId, minScore, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setStreamPaused((paused) => !paused)}>
          {streamPaused ? "Resume stream" : "Pause stream"}
        </Button>
        <SelectInput className="max-w-[200px]" value={chain} aria-label="Chain" onChange={(event) => setChain(event.target.value as Chain | "all")}>
          <option value="all">All chains</option>
          <option value="base">Base</option>
          <option value="bsc">BNB Chain</option>
        </SelectInput>
        <SelectInput className="max-w-[200px]" value={protocolId} aria-label="Protocol" onChange={(event) => setProtocolId(event.target.value)}>
          <option value="all">All protocols</option>
          {protocols.map((protocol) => (
            <option key={protocol.id} value={protocol.id}>
              {protocolLabel(protocol.name, protocol.chains)}
            </option>
          ))}
        </SelectInput>
        <label className="text-sm text-textMuted">
          Min score
          <input
            className="ml-2 h-11 w-20 rounded-control border border-border bg-bg px-2 font-mono text-text"
            type="number"
            min={0}
            max={100}
            value={minScore}
            aria-label="Minimum score"
            onChange={(event) => setMinScore(Number(event.target.value) || 0)}
          />
        </label>
        <TextInput className="max-w-xs" placeholder="Address or tx hash" aria-label="Search activity" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {activityQuery.isPending ? <EmptyState title="Loading" body="Reading live activity from the backend." /> : null}
      {activityQuery.error && !(activityQuery.error instanceof Error && isSignInMessage(activityQuery.error.message)) ? (
        <ErrorCard message={activityQuery.error instanceof Error ? activityQuery.error.message : "Backend request failed."} onRetry={() => void activityQuery.refetch()} />
      ) : null}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No rows" body="No transactions match these filters." />
        ) : (
          <ActivityTable
            rows={filtered}
            protocols={protocols}
            showProtocol
            flashIds={flashIds}
            freshId={freshId}
            chainHealth={{ bsc: health.bsc, base: health.base }}
          />
        )}
      </Card>
    </div>
  );
}
