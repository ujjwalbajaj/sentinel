"use client";

import type { Phase } from "@/lib/warroom";
import { formatWatch } from "@/lib/warroom";

const STATUS: Record<Phase, string> = {
  calm: "ALL CLEAR",
  threat: "THREAT DETECTED",
  contained: "CONTAINED",
};

export function WarRoomHeader({
  phase,
  seconds,
  watchLabel,
  watchTip,
  bscBlock,
  baseBlock,
  latencyMs,
  sfxOn,
  replayLabel,
  replayDisabled,
  lastIncident,
  onToggleSfx,
  onReplay,
}: {
  phase: Phase;
  seconds: number | null;
  watchLabel: string;
  watchTip?: string;
  bscBlock: number | null;
  baseBlock: number | null;
  latencyMs: number | null;
  sfxOn: boolean;
  replayLabel: string;
  replayDisabled: boolean;
  lastIncident: string | null;
  onToggleSfx: () => void;
  onReplay: () => void;
}) {
  return (
    <header className="wr-header" title="Press F to toggle fullscreen">
      <div className="wr-brand">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3DD68C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <b>SENTINEL</b>
        <span className="wr-chip" style={{ color: "var(--muted)" }}>
          WAR ROOM
        </span>
        <span className={`wr-chip wr-status ${phase}`}>
          <span className="d" />
          <span>{STATUS[phase]}</span>
        </span>
        {lastIncident ? (
          <span className="wr-chip wr-last">
            {lastIncident}
            <button type="button" onClick={onReplay} disabled={replayDisabled}>
              Replay
            </button>
          </span>
        ) : null}
      </div>
      <div className="wr-watch">
        <div className="t" aria-live="polite" title={watchTip}>
          {formatWatch(seconds)}
        </div>
        <div className="l">{watchLabel}</div>
      </div>
      <div className="wr-hright">
        <ChainChip color="var(--amber)" name="BNB" block={bscBlock} />
        <ChainChip color="var(--blue)" name="Base" block={baseBlock} />
        <span className="wr-chip" style={{ color: "var(--teal)" }}>
          NOWNodes <span className="wr-mono">{latencyMs != null && latencyMs > 0 ? `${Math.round(latencyMs)} ms` : "— ms"}</span>
        </span>
        <button type="button" className="wr-btn" onClick={onToggleSfx} aria-pressed={sfxOn}>
          SFX {sfxOn ? "on" : "off"}
        </button>
        <button type="button" className="wr-btn primary" onClick={onReplay} disabled={replayDisabled}>
          {replayLabel}
        </button>
      </div>
    </header>
  );
}

function ChainChip({ color, name, block }: { color: string; name: string; block: number | null }) {
  return (
    <span className="wr-chip live" style={{ color }}>
      <span className="d" />
      {name} <span className="wr-mono">{block == null ? "#—" : `#${block.toLocaleString("en-US")}`}</span>
    </span>
  );
}
