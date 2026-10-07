import { stageLabel } from "@/lib/labels";
import type { Chain, Incident } from "@/lib/types";
import { LocalTime } from "./LocalTime";
import { TxHash } from "./Address";

const dot: Record<string, string> = {
  setup: "bg-textMuted",
  fund: "bg-textMuted",
  allowlist: "bg-textMuted",
  deploy: "bg-textMuted",
  probe: "bg-warn",
  detected: "bg-warn",
  cre: "bg-info",
  test: "bg-warn",
  simulate: "bg-info",
  pause: "bg-info",
  strike: "bg-safe",
};

export function Timeline({ items, chain }: { items: Incident["timeline"]; chain: Chain }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((item, index) => (
        <li key={`${item.stage}-${item.text}-${index}`} className="relative">
          <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${dot[item.stage]}`} aria-hidden />
          <p className="text-xs font-medium uppercase tracking-wide text-textMuted">{stageLabel[item.stage]}</p>
          <p className="mt-0.5 text-sm text-text">{item.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.at ? <LocalTime at={item.at} block={item.block} /> : null}
            {item.txHash ? <TxHash hash={item.txHash} chain={chain} /> : item.offChain ? null : <span className="text-xs text-textMuted">Simulation, no transaction</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
