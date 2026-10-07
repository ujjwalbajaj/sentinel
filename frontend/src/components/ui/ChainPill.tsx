import { chainMeta } from "@/lib/chains";
import type { Chain } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChainPill({ chain, health = "live" }: { chain: Chain; health?: "live" | "down" }) {
  const down = health === "down";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel2 px-2 py-0.5 text-xs text-text">
      <span className={cn("h-1.5 w-1.5 rounded-full", down ? "bg-danger" : "bg-safe")} aria-hidden />
      {chainMeta[chain].label}
      <span className={down ? "text-dangerText" : "text-safe"}>{down ? "Down" : "Live"}</span>
    </span>
  );
}
