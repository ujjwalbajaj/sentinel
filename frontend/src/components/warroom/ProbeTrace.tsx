"use client";

import { useEffect, useState } from "react";
import type { TraceState } from "@/lib/warroom";

export function ProbeTrace({ trace, motion, onTick }: { trace: TraceState | null; motion: boolean; onTick?: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!trace) {
      setShown(0);
      return undefined;
    }
    if (!motion) {
      setShown(trace.frames.length);
      return undefined;
    }
    setShown(0);
    const timers = trace.frames.map((_, index) =>
      window.setTimeout(() => {
        setShown(index + 1);
        onTick?.();
      }, index * 140),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [trace, motion, onTick]);

  if (!trace) return null;

  return (
    <div className="wr-panel">
      <div className="wr-ph">
        <h3>Probe trace</h3>
        <span className="sub">debug_traceTransaction</span>
      </div>
      <div className="wr-trace">
        {trace.frames.map((frame, index) => {
          const on = !motion || index < shown;
          return (
          <div key={`${frame.depth}-${frame.label}-${index}`} className={`${on ? "on" : ""} ${frame.reentry ? "re" : ""}`} style={{ paddingLeft: frame.depth * 16 }}>
            {frame.depth ? "└ " : ""}
            {frame.label}
            {frame.reentry ? <b>↻ re-entered</b> : null}
          </div>
          );
        })}
      </div>
    </div>
  );
}
