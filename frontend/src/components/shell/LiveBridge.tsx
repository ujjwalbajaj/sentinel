"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { mergeIncident, normalizeActivity, normalizeIncident } from "@/lib/normalize";
import { liveSocket } from "@/lib/socket";
import type { ActivityRow, Incident } from "@/lib/types";
import { useSystem } from "@/providers/SystemProvider";
import { useToast } from "@/providers/ToastProvider";

export function LiveBridge() {
  const qc = useQueryClient();
  const toast = useToast();
  const { setHealth, noteActivity, streamPaused } = useSystem();

  useEffect(() => {
    const socket = liveSocket();
    if (!socket) {
      setHealth({ backend: "offline" });
      return undefined;
    }

    const online = () => setHealth({ backend: "online" });
    const offline = () => setHealth({ backend: "offline" });

    const onStatus = (payload: {
      base?: "live" | "down";
      bsc?: "live" | "down";
      cre?: "connected" | "unreachable";
      nownodes?: "streaming" | "down";
    }) => {
      setHealth({
        backend: "online",
        ...(payload.base ? { base: payload.base } : {}),
        ...(payload.bsc ? { bsc: payload.bsc } : {}),
        ...(payload.cre ? { cre: payload.cre, creTimeout: payload.cre === "unreachable" } : {}),
        ...(payload.nownodes ? { nownodes: payload.nownodes } : {}),
      });
    };

    const onActivity = (payload: Record<string, unknown>) => {
      if (streamPaused) return;
      const row = normalizeActivity(payload);
      qc.setQueryData<ActivityRow[]>(["activity"], (current = []) => [row, ...current.filter((item) => item.id !== row.id)].slice(0, 80));
      noteActivity(row.id, row.score);
    };

    const refreshIncidents = () => {
      void qc.invalidateQueries({ queryKey: ["incidents"] });
      void qc.invalidateQueries({ queryKey: ["protocols"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
    };

    const onIncident = (payload: Record<string, unknown>) => {
      const incident = normalizeIncident(payload);
      if (incident.id) {
        qc.setQueryData<Incident>(["incident", incident.id], (current) => mergeIncident(current, incident));
        void qc.invalidateQueries({ queryKey: ["incident", incident.id] });
      }
      refreshIncidents();
    };

    socket.on("connect", online);
    socket.on("disconnect", offline);
    socket.on("chain:status", onStatus);
    socket.on("activity:new", onActivity);
    socket.on("protocol:updated", refreshIncidents);
    socket.on("incident:detected", (payload: Record<string, unknown>) => {
      onIncident(payload);
      toast("Incident detected");
    });
    socket.on("incident:sent_to_cre", (payload: Record<string, unknown>) => {
      onIncident(payload);
      toast("Incident sent to CRE");
    });
    socket.on("incident:cre_rejected", (payload: Record<string, unknown>) => {
      onIncident(payload);
      setHealth({ cre: "unreachable", creTimeout: true });
      toast("CRE rejected the pause");
    });
    socket.on("incident:paused", (payload: Record<string, unknown>) => {
      onIncident(payload);
      toast("Protocol paused");
    });
    socket.on("incident:strike_reverted", (payload: Record<string, unknown>) => {
      onIncident(payload);
      toast("Strike reverted");
    });
    socket.on("incident:cre_attempt", (payload: { id?: string }) => {
      if (payload?.id) void qc.invalidateQueries({ queryKey: ["incident", payload.id] });
    });
    socket.on("incident:cre_timeout", () => {
      setHealth({ cre: "unreachable", creTimeout: true });
      toast("Pause not confirmed — alert sent");
    });

    if (socket.connected) online();

    return () => {
      socket.off("connect", online);
      socket.off("disconnect", offline);
      socket.off("chain:status", onStatus);
      socket.off("activity:new", onActivity);
      socket.off("protocol:updated", refreshIncidents);
      socket.off("incident:detected");
      socket.off("incident:sent_to_cre");
      socket.off("incident:cre_rejected");
      socket.off("incident:paused");
      socket.off("incident:strike_reverted");
      socket.off("incident:cre_attempt");
      socket.off("incident:cre_timeout");
    };
  }, [noteActivity, qc, setHealth, streamPaused, toast]);

  return null;
}
