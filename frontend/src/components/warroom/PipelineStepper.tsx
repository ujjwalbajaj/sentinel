"use client";

import { PIPELINE_STEPS, type WarRoomState } from "@/lib/warroom";

export function PipelineStepper({ steps }: { steps: WarRoomState["steps"] }) {
  return (
    <div className="wr-steps">
      {PIPELINE_STEPS.map(([id, label], index) => {
        const step = steps[id];
        const done = step.status === "done" || step.status === "bad";
        return (
          <div key={id} className={`wr-step${step.status === "active" ? " active" : ""}${done ? " done" : ""}${step.status === "bad" ? " bad" : ""}`}>
            <div className="fill" />
            <div className="dot">{index + 1}</div>
            <div className="nm">{label}</div>
            <div className="tm">{step.time}</div>
          </div>
        );
      })}
      <p className="wr-step-cap">times since detection</p>
    </div>
  );
}
