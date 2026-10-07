"use client";

import type { LaneBlock } from "@/lib/warroom";

export function ChainLanes({
  bsc,
  base,
  eventCount,
}: {
  bsc: LaneBlock[];
  base: LaneBlock[];
  eventCount: number;
}) {
  return (
    <div className="wr-panel">
      <div className="wr-ph">
        <span className="wr-tag eyes">EYES</span>
        <h3>Live chains via NOWNodes</h3>
      </div>
      <Lane name="BNB Chain" color="var(--amber)" blocks={bsc} />
      <Lane name="Base" color="var(--blue)" blocks={base} />
      <div className="wr-lanefoot">
        <span>WSS · newHeads + logs</span>
        <span>
          {eventCount} vault event{eventCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function Lane({ name, color, blocks }: { name: string; color: string; blocks: LaneBlock[] }) {
  return (
    <div className="wr-lane">
      <span className="nm" style={{ color }}>
        {name}
      </span>
      <div className="wr-track">
        <div className="wr-strip">
          {blocks.map((block) => (
            <div key={block.n} className={`wr-blk new${block.hot ? " hot" : ""}${block.paused ? " pz" : ""}`} title={`#${block.n}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
