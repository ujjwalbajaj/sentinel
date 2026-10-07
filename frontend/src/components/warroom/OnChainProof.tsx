"use client";

import { chainFromId, chainMeta } from "@/lib/chains";
import baseDeployment from "@/shared/deployments/8453.json";
import bscDeployment from "@/shared/deployments/56.json";
import { addressHref, shortHash, type ChainId, type PauseState, type StrikeState, type SuspectState } from "@/lib/warroom";

export function OnChainProof({
  chainId,
  suspect,
  pause,
  strike,
  vaultAddress,
  guardianAddress,
}: {
  chainId: ChainId | null;
  suspect: SuspectState | null;
  pause: PauseState | null;
  strike: StrikeState | null;
  vaultAddress: string | null;
  guardianAddress?: string | null;
}) {
  const chain = chainId ? chainFromId(chainId) : null;
  const explorerName = chainId === 8453 ? "Basescan" : "BscScan";
  const deployedGuardian = chainId === 8453 ? baseDeployment.guardian : bscDeployment.guardian;
  const guardian = guardianAddress || deployedGuardian || null;
  const vaultHref = addressHref(chainId, vaultAddress);
  const guardianHref = addressHref(chainId, guardian);
  const seconds = pause?.onchainSeconds;
  const probeBlock = suspect?.blockNumber;
  const pauseBlock = pause?.blockNumber;
  const onchain =
    seconds == null || probeBlock == null || pauseBlock == null
      ? null
      : `${seconds.toFixed(1)}s · blocks ${probeBlock}→${pauseBlock}`;

  return (
    <div className="wr-panel wr-proof">
      <div className="wr-ph">
        <h3>ON-CHAIN PROOF</h3>
        {chain ? <span className="sub">{chainMeta[chain].short}</span> : null}
      </div>
      <ProofRow label="Probe tx" hash={suspect?.txHash} block={suspect?.blockNumber ?? null} href={suspect?.explorerUrl} explorerName={explorerName} />
      <ProofRow label="Pause tx" hash={pause?.txHash} block={pause?.blockNumber ?? null} href={pause?.explorerUrl} explorerName={explorerName} />
      <ProofRow label="Strike tx" hash={strike?.txHash} block={strike?.blockNumber ?? null} href={strike?.explorerUrl} explorerName={explorerName} reverted={Boolean(strike?.txHash)} />
      <div className="row" title="block timestamps, verifiable">
        <span className="wr-muted">Probe→pause on-chain</span>
        <span className="wr-mono">{onchain ?? "—"}</span>
      </div>
      <div className="wr-proof-foot">
        <span>Vault </span>
        {vaultAddress && vaultHref ? (
          <a href={vaultHref} target="_blank" rel="noreferrer">
            {shortHash(vaultAddress)}
          </a>
        ) : (
          <span>—</span>
        )}
        <span> · Guardian </span>
        {guardian && guardianHref ? (
          <a href={guardianHref} target="_blank" rel="noreferrer">
            {shortHash(guardian)}
          </a>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  );
}

function ProofRow({
  label,
  hash,
  block,
  href,
  explorerName,
  reverted,
}: {
  label: string;
  hash?: string | null;
  block: number | null;
  href?: string | null;
  explorerName: string;
  reverted?: boolean;
}) {
  return (
    <div className="row">
      <span className="wr-muted">{label}</span>
      {hash ? (
        <span className="wr-mono">
          {reverted ? <span style={{ color: "var(--red)" }}>reverted · </span> : null}
          {shortHash(hash)}
          {" · "}
          {block == null ? "—" : `#${block}`}
          {" · "}
          {href ? (
            <a href={href} target="_blank" rel="noreferrer">
              ↗ {explorerName}
            </a>
          ) : (
            "—"
          )}
        </span>
      ) : (
        <span className="wr-mono wr-muted">—</span>
      )}
    </div>
  );
}
