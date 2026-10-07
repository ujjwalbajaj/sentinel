"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSystem } from "@/providers/SystemProvider";
import { LiveBridge } from "./LiveBridge";
import { NavigationLoader } from "./NavigationLoader";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { health, recheck, checking } = useSystem();
  if (pathname.startsWith("/app/war-room")) {
    return (
      <div className="box-border flex h-screen w-full flex-col overflow-hidden bg-[#06090E]">
        <LiveBridge />
        <div className="min-h-0 w-full flex-1">{children}</div>
      </div>
    );
  }
  const chainsDown = [
    health.base === "down" ? "Base" : null,
    health.bsc === "down" ? "BNB Chain" : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-bg lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border lg:block">
        <Sidebar />
      </aside>
      {menu ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMenu(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto rounded-t-card border border-border">
            <Sidebar onNavigate={() => setMenu(false)} />
          </div>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <LiveBridge />
        <TopBar onMenu={() => setMenu(true)} />
        {health.backend === "offline" ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-dangerBorder bg-dangerBg px-4 py-3 text-sm text-dangerText lg:px-8">
            <p>Backend offline. Live totals stay hidden until the API responds.</p>
            <button type="button" onClick={() => void recheck()} className="inline-flex h-11 items-center rounded-control border border-dangerBorder px-4 text-sm font-medium text-text">
              {checking ? "Checking…" : "Retry"}
            </button>
          </div>
        ) : null}
        {health.rpcChecked && chainsDown.length > 0 ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-[#6A5420] bg-warnBg px-4 py-3 text-sm text-warn lg:px-8">
            <p>Chain RPC down: {chainsDown.join(", ")}. New calls cannot be simulated.</p>
            <button type="button" onClick={() => void recheck()} className="inline-flex h-11 items-center rounded-control border border-[#6A5420] px-4 text-sm font-medium text-text">
              {checking ? "Checking…" : "Retry"}
            </button>
          </div>
        ) : null}
        {health.creTimeout ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-dangerBorder bg-dangerBg px-4 py-3 text-sm text-dangerText lg:px-8">
            <p>Pause not confirmed — alert sent</p>
            <button type="button" onClick={() => void recheck()} className="inline-flex h-11 items-center rounded-control border border-dangerBorder px-4 text-sm font-medium text-text">
              {checking ? "Checking…" : "Retry"}
            </button>
          </div>
        ) : null}
        <NavigationLoader />
        <main className={pathname.startsWith("/app/demo") ? "px-3 py-3 lg:px-8 lg:py-6" : "px-4 py-5 lg:px-8 lg:py-7"}>{children}</main>
      </div>
    </div>
  );
}
