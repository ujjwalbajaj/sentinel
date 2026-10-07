"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import type { Chain } from "@/lib/types";
import { shortAddress } from "@/lib/utils";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-control text-textMuted hover:bg-panel2 hover:text-text"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-safe" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

export function Address({ address, chain }: { address: string; chain?: Chain }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="font-mono text-sm" title={address}>
        {shortAddress(address)}
      </span>
      <CopyButton value={address} label="address" />
      {chain ? (
        <a
          href={explorerAddress(chain, address)}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${shortAddress(address)} on explorer`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-textMuted hover:bg-panel2 hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
    </span>
  );
}

export function TxHash({ hash, chain }: { hash: string; chain: Chain }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <a href={explorerTx(chain, hash)} target="_blank" rel="noreferrer" className="font-mono text-sm text-info hover:underline" title={hash}>
        {shortAddress(hash)}
      </a>
      <CopyButton value={hash} label="transaction hash" />
    </span>
  );
}
