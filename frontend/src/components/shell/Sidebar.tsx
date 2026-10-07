"use client";

import {
  Activity,
  ChevronsUpDown,
  CreditCard,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Plug,
  Radar,
  Settings,
  Siren,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_ENABLED, PUBLIC_MODE } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { Logo } from "./Logo";

const items = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/protocols", label: "Protocols", icon: Layers },
  { href: "/app/incidents", label: "Incidents", icon: Siren },
  { href: "/app/war-room", label: "War room", icon: Radar },
  { href: "/app/activity", label: "Live activity", icon: Activity },
  { href: "/app/policy", label: "Detection policy", icon: SlidersHorizontal },
  { href: "/app/integrations", label: "Alerts & integrations", icon: Plug },
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout, ready } = useAuth();
  const [orgOpen, setOrgOpen] = useState(false);
  const nav = DEMO_ENABLED && !PUBLIC_MODE ? [...items, { href: "/app/demo", label: "Attack Simulator", icon: FlaskConical }] : items;

  return (
    <div className={cn("flex h-full flex-col bg-panel", className)}>
      <div className="border-b border-border px-4 py-5">
        <Logo href="/app" />
      </div>
      <nav className="flex-1 space-y-1 overflow-auto px-3 py-4" aria-label="Console">
        {nav.map((item) => {
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (!onNavigate) return;
                event.preventDefault();
                onNavigate();
                router.push(item.href);
              }}
              className={cn(
                "flex h-11 items-center gap-3 rounded-control px-3 text-sm",
                active ? "bg-panel2 font-medium text-text" : "text-textMuted hover:bg-panel2 hover:text-text",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="relative border-t border-border p-3">
        <button
          type="button"
          className="flex h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm hover:bg-panel2"
          aria-expanded={orgOpen}
          aria-haspopup="menu"
          onClick={() => setOrgOpen((open) => !open)}
        >
          <ChevronsUpDown className="h-4 w-4 text-textMuted" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium">{ready && session ? session.org : "USquare"}</span>
            <span className="block truncate text-xs text-textMuted">{ready && session ? session.name : "Demo console"}</span>
          </span>
        </button>
        {orgOpen ? (
          <div role="menu" className="absolute bottom-16 left-3 right-3 rounded-control border border-border bg-panel2 p-2">
            <p className="px-2 py-1 text-xs text-textMuted">Organisation</p>
            <p className="px-2 py-1 text-sm">{ready && session ? session.org : "USquare"}</p>
            {session ? (
              <button
                type="button"
                role="menuitem"
                className="mt-1 flex h-11 w-full items-center rounded-control px-2 text-left text-sm hover:bg-panel"
                onClick={() => {
                  logout();
                  setOrgOpen(false);
                  onNavigate?.();
                  router.push("/");
                }}
              >
                Log out
              </button>
            ) : (
              <Link href="/login" role="menuitem" onClick={onNavigate} className="mt-1 flex h-11 items-center rounded-control px-2 text-sm hover:bg-panel">
                Log in
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
