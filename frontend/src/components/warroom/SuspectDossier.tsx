"use client";

import { addressHref, shortHash, type ChainId, type SuspectState } from "@/lib/warroom";

export function SuspectDossier({ suspect, chainId }: { suspect: SuspectState | null; chainId: ChainId | null }) {
  if (!suspect) return null;
  const fromHref = addressHref(chainId, suspect.from);
  const viaHref = addressHref(chainId, suspect.attackerContract);
  return (
    <div className="wr-panel">
      <div className="wr-ph">
        <h3 style={{ color: "var(--redT)" }}>Suspect wallet</h3>
        <span className="sub">{fromHref ? <a href={fromHref} target="_blank" rel="noreferrer">{shortHash(suspect.from)}</a> : shortHash(suspect.from)}</span>
      </div>
      <dl className="wr-kv">
        <dt>Wallet age</dt>
        <dd>{suspect.walletAgeSec == null ? "unknown" : <span className="wr-flag">{ageLabel(suspect.walletAgeSec)}</span>}</dd>
        <dt>Age source</dt>
        <dd>{suspect.walletSource ?? "unknown"}</dd>
        <dt>Detected via</dt>
        <dd>{suspect.detectedVia ?? "—"}</dd>
        <dt>Gas funded by</dt>
        <dd>{suspect.mixerFunded ? <span className="wr-flag">mixer</span> : "direct"}</dd>
        <dt>Called vault via</dt>
        <dd>
          {suspect.attackerContract ? (
            viaHref ? (
              <a href={viaHref} target="_blank" rel="noreferrer">
                {shortHash(suspect.attackerContract)}
              </a>
            ) : (
              shortHash(suspect.attackerContract)
            )
          ) : (
            "—"
          )}
        </dd>
        <dt>Probe tx</dt>
        <dd>
          {suspect.explorerUrl ? (
            <a href={suspect.explorerUrl} target="_blank" rel="noreferrer">
              {shortHash(suspect.txHash)}
            </a>
          ) : (
            shortHash(suspect.txHash)
          )}
        </dd>
      </dl>
    </div>
  );
}

function ageLabel(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h`;
}
