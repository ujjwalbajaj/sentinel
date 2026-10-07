"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { LocalTime } from "@/components/ui/LocalTime";
import { StatusPill } from "@/components/ui/StatusPill";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useProtocols } from "@/hooks/useSentinel";
import { api } from "@/lib/api";
import { PUBLIC_MODE } from "@/lib/chains";
import { ReadOnlyDemo } from "@/components/ui/ReadOnlyDemo";
import { formatUsd } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { buttonClass } from "@/lib/utils";

export function BillingView() {
  usePageTitle("Billing");
  const { data: protocols = [] } = useProtocols();
  const { data: billing } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api<{ formula?: string; monthlyUsd?: number; invoices?: { id: string; at: string; block: number; amountUsd: number; status: "Paid" | "Open" }[] }>("/billing"),
  });
  const [method, setMethod] = useState<"usdc" | "card">("usdc");
  const tvl = protocols.reduce((sum, protocol) => sum + protocol.tvlUsd, 0);
  const invoices = billing?.invoices ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-textMuted">Current plan</p>
          <p className="mt-2 font-display text-3xl font-medium">Shield</p>
        </Card>
        <Card>
          <p className="text-sm text-textMuted">Protected TVL</p>
          <p className="mt-2 font-display text-3xl font-medium tabular-nums">{protocols.length === 0 && !billing ? "—" : formatUsd(tvl)}</p>
        </Card>
        <Card>
          <p className="text-sm text-textMuted">Monthly fee</p>
          <p className="mt-2 font-display text-3xl font-medium tabular-nums">{billing?.monthlyUsd == null ? "—" : formatUsd(billing.monthlyUsd)}</p>
          <p className="mt-2 text-xs text-textMuted">{billing?.formula ?? "Monthly fee comes from the backend."}</p>
        </Card>
      </div>
      <Card>
        <h2 className="font-display text-lg font-medium">Payment method</h2>
        {PUBLIC_MODE ? (
          <ReadOnlyDemo className="mt-4" />
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={method === "usdc" ? buttonClass.primary : buttonClass.secondary} onClick={() => setMethod("usdc")}>
              USDC
            </button>
            <button type="button" className={method === "card" ? buttonClass.primary : buttonClass.secondary} onClick={() => setMethod("card")}>
              Card
            </button>
          </div>
        )}
        <p className="mt-3 text-sm text-textMuted">
          {method === "usdc" ? "USDC on Base or BNB Chain, once a treasury address is returned by the backend." : "Card checkout is not connected."}
        </p>
      </Card>
      <div className="overflow-x-auto rounded-card border border-border bg-panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-textMuted">
            <tr>
              {["Invoice", "Date", "Amount", "Status"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono">{invoice.id}</td>
                <td className="px-4 py-3">
                  <LocalTime at={invoice.at} block={invoice.block} withDate />
                </td>
                <td className="px-4 py-3">{formatUsd(invoice.amountUsd)}</td>
                <td className="px-4 py-3">
                  <StatusPill tone={invoice.status === "Paid" ? "safe" : "warn"} label={invoice.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
