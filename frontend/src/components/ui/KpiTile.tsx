import { Card } from "./Card";

export function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-textMuted">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium tabular-nums text-text">{value}</p>
      {hint ? <p className="mt-1 text-xs text-textMuted">{hint}</p> : null}
    </Card>
  );
}
