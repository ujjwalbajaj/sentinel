"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { normalizeActivity, normalizeIncident, normalizeProtocol, normalizeStats, type Stats } from "@/lib/normalize";
import type { ActivityRow, Channel, Incident, Policy, PolicyChange, Protocol, TeamMember } from "@/lib/types";

const keys = {
  protocols: ["protocols"] as const,
  incidents: ["incidents"] as const,
  activity: ["activity"] as const,
  team: ["team"] as const,
  channels: ["channels"] as const,
  changelog: ["changelog"] as const,
  stats: ["stats"] as const,
};

async function list<T>(path: string, key: string, map: (row: Record<string, unknown>) => T) {
  const body = await api<Record<string, unknown>>(path);
  const rows = Array.isArray(body) ? body : ((body[key] ?? body.items ?? []) as unknown[]);
  return rows.map((row) => map(row as Record<string, unknown>));
}

export function useProtocols() {
  return useQuery({
    queryKey: keys.protocols,
    queryFn: () => list("/protocols", "protocols", normalizeProtocol),
    placeholderData: (previous) => previous,
  });
}

export function useProtocol(id: string) {
  const query = useProtocols();
  return { ...query, data: query.data?.find((protocol) => protocol.id === id) };
}

export function useIncidents() {
  return useQuery({
    queryKey: keys.incidents,
    queryFn: () => list("/incidents", "incidents", normalizeIncident),
    placeholderData: (previous) => previous,
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: async () => normalizeIncident((await api<Record<string, unknown>>(`/incidents/${id}`)) ?? {}),
    enabled: Boolean(id),
  });
}

export function useActivity() {
  return useQuery({
    queryKey: keys.activity,
    queryFn: () => list("/activity", "activity", normalizeActivity),
    placeholderData: (previous) => previous,
  });
}

export function useStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: async () => normalizeStats((await api<Record<string, unknown>>("/stats")) ?? {}),
    placeholderData: (previous) => previous,
  });
}

export function useTeam() {
  return useQuery({
    queryKey: keys.team,
    queryFn: () => api<TeamMember[]>("/team"),
  });
}

export function useChannels() {
  return useQuery({
    queryKey: keys.channels,
    queryFn: () => api<Channel[]>("/integrations"),
  });
}

export function useChangelog(protocolId?: string) {
  return useQuery({
    queryKey: [...keys.changelog, protocolId ?? "all"],
    queryFn: () => api<PolicyChange[]>(protocolId ? `/protocols/${protocolId}/policy/history` : "/policy/history"),
  });
}

export function useConsole() {
  const qc = useQueryClient();

  return {
    async updatePolicy(id: string, policy: Policy, _change: Omit<PolicyChange, "id">) {
      await api(`/protocols/${id}/policy`, { method: "PUT", body: JSON.stringify(policy) });
      await qc.invalidateQueries({ queryKey: keys.protocols });
    },
    async markFalsePositive(id: string) {
      // TODO: backend has no POST /incidents/:id/false-positive yet.
      void id;
      throw new ApiError("Marking a false positive is not available yet.", 501);
    },
    async removeProtocol(id: string) {
      await api(`/protocols/${id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: keys.protocols });
    },
    async saveChannels(channels: Channel[]) {
      await api("/integrations", { method: "PUT", body: JSON.stringify(channels) });
      qc.setQueryData(keys.channels, channels);
    },
    async invite(member: TeamMember) {
      await api("/team", { method: "POST", body: JSON.stringify(member) });
      await qc.invalidateQueries({ queryKey: keys.team });
    },
    async setProtocolStatus() {
      throw new ApiError("Status changes come from the chain and the backend.", 0);
    },
    pushActivity(row: ActivityRow) {
      qc.setQueryData<ActivityRow[]>(keys.activity, (current = []) => [row, ...current].slice(0, 80));
    },
  };
}

export { keys as sentinelKeys };
export type { Stats, Incident, Protocol };
