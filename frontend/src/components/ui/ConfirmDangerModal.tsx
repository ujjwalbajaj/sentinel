"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { TextInput } from "./Field";
import { Modal } from "./Modal";

export function ConfirmDangerModal({
  open,
  title,
  description,
  expected,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  expected: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="mt-2 text-sm text-textMuted">{description}</p>
      <label className="mt-4 block text-sm text-text">
        Type <span className="font-mono">{expected}</span> to confirm
        <TextInput className="mt-2" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={value !== expected}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
