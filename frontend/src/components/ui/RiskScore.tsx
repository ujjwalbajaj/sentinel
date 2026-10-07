export function RiskScore({ score }: { score: number | null }) {
  if (score == null) return <span className="text-textMuted">—</span>;
  if (score >= 80) return <span className="font-mono text-dangerText">{score}</span>;
  if (score >= 40) return <span className="font-mono text-warn">{score}</span>;
  return <span className="text-textMuted">normal</span>;
}
