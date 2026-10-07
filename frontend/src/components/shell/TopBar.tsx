"use client";

import { Bell, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useIncidents } from "@/hooks/useSentinel";
import { usePageTitleState } from "@/providers/Providers";
import { useSystem } from "@/providers/SystemProvider";
import { ChainPill } from "../ui/ChainPill";
import { StatusPill } from "../ui/StatusPill";
import { WalletButton } from "./WalletButton";

const titles: Record<string, string> = {
  "/app": "Overview",
  "/app/protocols": "Protocols",
  "/app/incidents": "Incidents",
  "/app/activity": "Live activity",
  "/app/policy": "Detection policy",
  "/app/integrations": "Alerts & integrations",
  "/app/team": "Team",
  "/app/billing": "Billing",
  "/app/settings": "Settings",
  "/app/demo": "Attack Simulator",
};

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { title } = usePageTitleState();
  const { health } = useSystem();
  const { data: incidents = [] } = useIncidents();
  const [open, setOpen] = useState(false);
  const active = incidents.filter((incident) => incident.active);
  const fallback = titles[pathname] ?? (pathname.startsWith("/app/protocols/") ? "Protocol" : pathname.startsWith("/app/incidents/") ? "Incident" : "SENTINEL");

  return (
    <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur lg:px-8">
      <button type="button" aria-label="Open menu" onClick={onMenu} className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-border lg:hidden">
        <Menu className="h-4 w-4" aria-hidden />
      </button>
      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-medium">{title || fallback}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <ChainPill chain="base" health={health.base} />
        <ChainPill chain="bsc" health={health.bsc} />
        <StatusPill
          tone={health.cre === "unreachable" ? "danger" : health.creMode ? "info" : "muted"}
          label={health.creMode ? `Chainlink CRE · ${health.creMode}` : health.cre === "unreachable" ? "CRE unreachable" : "Chainlink CRE"}
        />
        <div className="relative">
          <button type="button" aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative inline-flex h-11 w-11 items-center justify-center rounded-control border border-border bg-panel">
            <Bell className="h-4 w-4" aria-hidden />
            {active.length > 0 ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" aria-hidden /> : null}
          </button>
          {open ? (
            <div className="absolute right-0 z-40 mt-2 w-72 rounded-card border border-border bg-panel p-3">
              {active.length === 0 ? (
                <p className="text-sm text-textMuted">No active incidents.</p>
              ) : (
                active.map((incident) => (
                  <Link key={incident.id} href={`/app/incidents/${incident.id}`} onClick={() => setOpen(false)} className="block rounded-control px-2 py-2 text-sm hover:bg-panel2">
                    Active incident · score {incident.score}
                  </Link>
                ))
              )}
            </div>
          ) : null}
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
