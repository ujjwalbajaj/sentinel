import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const toneClass: Record<Tone, string> = {
  safe: "border-safeBorder bg-safeBg text-safe",
  warn: "border-[#6A5420] bg-warnBg text-warn",
  danger: "border-dangerBorder bg-dangerBg text-dangerText",
  info: "border-[#2C4478] bg-infoBg text-info",
  muted: "border-border bg-panel2 text-textMuted",
};

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
