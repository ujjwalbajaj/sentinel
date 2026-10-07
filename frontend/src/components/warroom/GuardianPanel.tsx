"use client";

import { shortHash, type PauseState, type StrikeState } from "@/lib/warroom";

export function GuardianPanel({
  reportReady,
  pause,
  strike,
  timedOut,
  rejected,
  livePaused = false,
}: {
  reportReady: boolean;
  pause: PauseState | null;
  strike: StrikeState | null;
  timedOut: boolean;
  rejected: boolean;
  livePaused?: boolean;
}) {
  return (
    <div className="wr-panel wr-hand">
      <div className="wr-ph">
        <span className="wr-tag hand">HAND</span>
        <h3>Guardian → vault.pause()</h3>
      </div>
      <div className="row">
        <span className="wr-muted">Forwarder verification</span>
        <Forwarder pause={pause} reportReady={reportReady} timedOut={timedOut} rejected={rejected} />
      </div>
      <div className="row">
        <span className="wr-muted">Pause tx</span>
        <PauseCell pause={pause} reportReady={reportReady} timedOut={timedOut} rejected={rejected} />
      </div>
      <div className="row">
        <span className="wr-muted">Vault state</span>
        <span className="wr-mono" style={{ color: pause || livePaused ? "var(--blue)" : "var(--green)" }}>
          {pause || livePaused ? "PAUSED" : "ACTIVE"}
        </span>
      </div>
      <div className="row">
        <span className="wr-muted">Attacker strike</span>
        <span className="wr-mono">
          {strike ? (
            <span style={{ color: "var(--red)" }}>reverted · {shortHash(strike.txHash)}</span>
          ) : (
            <span className="wr-muted">—</span>
          )}
        </span>
      </div>
    </div>
  );
}

function Forwarder({ pause, reportReady, timedOut, rejected }: { pause: PauseState | null; reportReady: boolean; timedOut: boolean; rejected: boolean }) {
  if (rejected && !pause) return <span className="wr-pending">no pause</span>;
  if (pause) return <span style={{ color: "var(--green)" }}>✓ verified</span>;
  if (timedOut && reportReady) return <span className="wr-pending">timed out</span>;
  if (reportReady) {
    return (
      <span className="wr-pending">
        <span className="wr-spin" />
        submitting
      </span>
    );
  }
  return <span className="wr-muted">—</span>;
}

function PauseCell({ pause, reportReady, timedOut, rejected }: { pause: PauseState | null; reportReady: boolean; timedOut: boolean; rejected: boolean }) {
  if (rejected && !pause) return <span className="wr-pending">not sent</span>;
  if (pause?.explorerUrl) {
    return (
      <a className="wr-mono" href={pause.explorerUrl} target="_blank" rel="noreferrer">
        {shortHash(pause.txHash)}
      </a>
    );
  }
  if (pause) return <span className="wr-mono">{shortHash(pause.txHash)}</span>;
  if (timedOut && reportReady) return <span className="wr-pending">not confirmed</span>;
  if (reportReady) {
    return (
      <span className="wr-pending">
        <span className="wr-spin" />
        waiting for block
      </span>
    );
  }
  return <span className="wr-mono wr-muted">—</span>;
}
