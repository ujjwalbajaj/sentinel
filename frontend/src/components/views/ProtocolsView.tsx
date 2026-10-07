"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChainPill } from "@/components/ui/ChainPill";
import { LocalTime } from "@/components/ui/LocalTime";
import { StatusPill } from "@/components/ui/StatusPill";
import { ErrorCard, EmptyState } from "@/components/ui/EmptyState";
import { usePageTitle } from "@/hooks/usePageTitle";
import { SignInButton } from "@/components/auth/SignInButton";
import { useIncidents, useProtocols } from "@/hooks/useSentinel";
import { isSignInMessage } from "@/lib/api";
import { pauseMethodLabel, protocolLabel, protocolPill } from "@/lib/labels";
import { PUBLIC_MODE } from "@/lib/chains";
import { buttonClass, formatUsd } from "@/lib/utils";
import { ReadOnlyDemo } from "@/components/ui/ReadOnlyDemo";
import { useAuth } from "@/providers/AuthProvider";
import { useSystem } from "@/providers/SystemProvider";

export function ProtocolsView() {
  usePageTitle("Protocols");
  const router = useRouter();
  const protocolsQuery = useProtocols();
  const incidentsQuery = useIncidents();
  const protocols = protocolsQuery.data ?? [];
  const incidents = incidentsQuery.data ?? [];
  const failed = [protocolsQuery.error, incidentsQuery.error].find(
    (error) => error && !(error instanceof Error && isSignInMessage(error.message)),
  );
  const { session } = useAuth();
  const { health } = useSystem();

  return (
    <div className="space-y-4">
      {protocolsQuery.isPending ? <EmptyState title="Loading" body="Reading protocols from the backend." /> : null}
      {failed ? <ErrorCard message={failed instanceof Error ? failed.message : "Backend request failed."} onRetry={() => void protocolsQuery.refetch()} /> : null}
      <div className="flex justify-end">
        {PUBLIC_MODE ? (
          <ReadOnlyDemo />
        ) : session ? (
          <Link href="/onboarding?chain=bsc" className={buttonClass.primary}>
            Add protocol
          </Link>
        ) : (
          <SignInButton />
        )}
      </div>
      <div className="overflow-x-auto rounded-card border border-border bg-panel">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-textMuted">
            <tr>
              {["Protocol", "Chains", "Contracts", "TVL", "Pause method", "Status", "Last incident"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {protocols.map((protocol) => {
              const pill = protocolPill(protocol.status);
              const last = incidents.find((incident) => incident.protocolId === protocol.id);
              return (
                <tr
                  key={protocol.id}
                  tabIndex={0}
                  className="cursor-pointer border-t border-border hover:bg-panel2"
                  onClick={() => router.push(`/app/protocols/${protocol.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(`/app/protocols/${protocol.id}`);
                  }}
                >
                  <td className="px-4 py-3 font-medium">{protocolLabel(protocol.name, protocol.chains)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {protocol.chains.map((chain) => (
                        <ChainPill key={chain} chain={chain} health={chain === "bsc" ? health.bsc : health.base} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono">{protocol.contracts.length}</td>
                  <td className="px-4 py-3">
                    <span className="block">{protocol.tvlNative ? `${protocol.tvlNative} ${protocol.nativeSymbol ?? ""}` : formatUsd(protocol.tvlUsd)}</span>
                    <span className="text-xs text-textMuted">Allowlisted demo vault on mainnet</span>
                  </td>
                  <td className="px-4 py-3">{pauseMethodLabel[protocol.pauseMethod]}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={protocol.protectedVault ? "safe" : pill.tone} label={protocol.protectedVault ? "Protected" : pill.label} />
                  </td>
                  <td className="px-4 py-3">
                    {last ? (
                      <span className="inline-flex items-center gap-2">
                        <LocalTime at={last.timeline[0]?.at ?? protocol.lastEventAt} block={last.timeline[0]?.block ?? protocol.lastEventBlock} withDate />
                        <span className="text-textMuted">score {last.score}</span>
                      </span>
                    ) : (
                      <span className="text-textMuted">None</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
