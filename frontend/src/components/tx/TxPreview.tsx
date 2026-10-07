"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function TxPreview({
  open,
  chainName,
  action,
  fee,
  symbol,
  busy,
  error,
  onClose,
  onSend,
}: {
  open: boolean;
  chainName: string;
  action: string;
  fee: string;
  symbol: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <Modal open={open} title="Send transaction" onClose={onClose}>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-textMuted">Chain</dt>
          <dd>{chainName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-textMuted">Action</dt>
          <dd className="text-right">{action}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-textMuted">Estimated fee</dt>
          <dd className="font-mono">
            {fee} {symbol}
          </dd>
        </div>
      </dl>
      {error ? <p className="mt-3 text-sm text-dangerText">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSend} disabled={busy}>
          {busy ? "Waiting for wallet…" : "Send transaction"}
        </Button>
      </div>
    </Modal>
  );
}
