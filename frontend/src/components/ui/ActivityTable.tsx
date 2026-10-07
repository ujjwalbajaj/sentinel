import { protocolLabel, resultPill } from "@/lib/labels";
import type { ActivityRow, Protocol } from "@/lib/types";
import { Address } from "./Address";
import { ChainPill } from "./ChainPill";
import { LocalTime } from "./LocalTime";
import { RiskScore } from "./RiskScore";
import { StatusPill } from "./StatusPill";

export function ActivityTable({
  rows,
  protocols,
  flashIds = [],
  freshId,
  showProtocol = false,
  chainHealth,
}: {
  rows: ActivityRow[];
  protocols: Protocol[];
  flashIds?: string[];
  freshId?: string | null;
  showProtocol?: boolean;
  chainHealth?: { bsc: "live" | "down"; base: "live" | "down" };
}) {
  const nameFor = (id: string) => {
    const protocol = protocols.find((item) => item.id === id);
    return protocol ? protocolLabel(protocol.name, protocol.chains) : id;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-textMuted">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Chain</th>
            {showProtocol ? <th className="px-3 py-2 font-medium">Protocol</th> : null}
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">From</th>
            <th className="px-3 py-2 font-medium">Risk</th>
            <th className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pill = resultPill(row.result, row.score);
            const health = row.chain === "bsc" ? chainHealth?.bsc : chainHealth?.base;
            return (
              <tr
                key={row.id}
                className={`border-t border-border ${flashIds.includes(row.id) ? "animate-flash-risk" : ""} ${freshId === row.id ? "animate-slide-in" : ""}`}
              >
                <td className="px-3 py-3">
                  <LocalTime at={row.at} block={row.block} withDate />
                </td>
                <td className="px-3 py-3">
                  <ChainPill chain={row.chain} health={health} />
                </td>
                {showProtocol ? <td className="px-3 py-3">{nameFor(row.protocolId)}</td> : null}
                <td className="px-3 py-3">{row.event}</td>
                <td className="px-3 py-3">
                  <Address address={row.from} chain={row.chain} />
                </td>
                <td className="px-3 py-3">
                  <RiskScore score={row.score} />
                </td>
                <td className="px-3 py-3">
                  <StatusPill tone={pill.tone} label={pill.label} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
