export function RiskRing({ score, threshold = 80 }: { score: number; threshold?: number }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(score, 100) / 100) * circ;
  const color = score >= threshold ? "#FF6B6B" : score >= 40 ? "#F5B942" : "#3DD68C";
  const label = score >= threshold ? `Risk ${score}` : score >= 40 ? "Watch" : "Normal";
  const mark = ((-90 + (threshold / 100) * 360) * Math.PI) / 180;
  const x1 = 70 + Math.cos(mark) * (radius - 8);
  const y1 = 70 + Math.sin(mark) * (radius - 8);
  const x2 = 70 + Math.cos(mark) * (radius + 10);
  const y2 = 70 + Math.sin(mark) * (radius + 10);

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`${label}, score ${score}`}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#1C222C" strokeWidth="8" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="butt"
          transform="rotate(-90 70 70)"
        />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E6E9EF" strokeWidth="2" />
        <text x="70" y="76" textAnchor="middle" fill="#E6E9EF" fontSize="32" fontFamily="var(--font-display), sans-serif">
          {score}
        </text>
      </svg>
      <p className="text-sm font-medium" style={{ color }}>
        {label}
      </p>
      <p className="text-xs text-textMuted">Threshold {threshold}</p>
    </div>
  );
}
