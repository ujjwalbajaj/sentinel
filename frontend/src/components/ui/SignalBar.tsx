import type { Signal } from "@/lib/types";

export function SignalBar({ signal }: { signal: Signal }) {
  const width = Math.min(100, (signal.points / 30) * 100);
  const bar = signal.points >= 20 ? "bg-danger" : signal.points > 0 ? "bg-warn" : "bg-border";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span>{signal.label}</span>
        <span className="font-mono text-textMuted">+{signal.points}</span>
      </div>
      <div className="h-2 rounded-full bg-panel2">
        <div className={`h-2 rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-xs text-textMuted">{signal.detail}</p>
    </div>
  );
}
