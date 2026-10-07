"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type LinkHealth = "live" | "down";

type Health = {
  bsc: LinkHealth;
  base: LinkHealth;
  cre: "connected" | "unreachable" | "unknown";
  creMode: string | null;
  nownodes: "streaming" | "down" | "unknown";
  backend: "online" | "offline";
  rpcChecked: boolean;
  creTimeout: boolean;
};

type SystemContextValue = {
  health: Health;
  setHealth: (patch: Partial<Health>) => void;
  recheck: () => Promise<void>;
  checking: boolean;
  flashIds: string[];
  freshId: string | null;
  streamPaused: boolean;
  setStreamPaused: (value: boolean | ((current: boolean) => boolean)) => void;
  noteActivity: (id: string, score: number | null) => void;
};

const SystemContext = createContext<SystemContextValue | null>(null);

const initial: Health = {
  bsc: "down",
  base: "down",
  cre: "unknown",
  creMode: null,
  nownodes: "unknown",
  backend: "offline",
  rpcChecked: false,
  creTimeout: false,
};

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealthState] = useState<Health>(initial);
  const [checking, setChecking] = useState(false);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [streamPaused, setStreamPaused] = useState(false);

  const setHealth = useCallback((patch: Partial<Health>) => {
    setHealthState((current) => ({ ...current, ...patch }));
  }, []);

  const noteActivity = useCallback((id: string, score: number | null) => {
    setFreshId(id);
    if (score == null || score < 80) return;
    setFlashIds((current) => [...current, id]);
    window.setTimeout(() => setFlashIds((current) => current.filter((item) => item !== id)), 1200);
  }, []);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const body = await api<{
        ok?: boolean;
        creMode?: string;
        cre?: { mode?: string } | string;
        chains?: Record<string, { rpc?: string }>;
      }>("/health");
      const baseUp = body.chains?.["8453"]?.rpc === "up";
      const bscUp = body.chains?.["56"]?.rpc === "up";
      const creMode =
        body.creMode ||
        (typeof body.cre === "string" ? body.cre : body.cre?.mode) ||
        null;
      setHealthState((current) => ({
        ...current,
        base: baseUp ? "live" : "down",
        bsc: bscUp ? "live" : "down",
        rpcChecked: true,
        backend: "online",
        creMode: creMode ?? current.creMode,
        cre: creMode ? "connected" : current.cre,
      }));
    } catch {
      setHealthState((current) => ({ ...current, backend: "offline", rpcChecked: true }));
    } finally {
      setChecking(false);
    }
  }, []);

  const value: SystemContextValue = {
    health,
    checking,
    flashIds,
    freshId,
    streamPaused,
    setStreamPaused,
    setHealth,
    noteActivity,
    recheck,
  };

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("useSystem must be used inside SystemProvider");
  return ctx;
}
