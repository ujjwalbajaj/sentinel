"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LocalTime } from "@/components/ui/LocalTime";
import { TextInput } from "@/components/ui/Field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useChangelog, useConsole, useProtocols } from "@/hooks/useSentinel";
import { protocolLabel } from "@/lib/labels";
import type { Protocol } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";

export function PolicyView() {
  usePageTitle("Detection policy");
  const { data: protocols = [] } = useProtocols();
  const { data: changelog = [] } = useChangelog();

  return (
    <div className="space-y-4">
      <p className="text-sm text-textMuted">Detection rules run inside a Chainlink CRE confidential workflow and are not shown.</p>
      {protocols.map((protocol) => (
        <PolicyEditor key={`${protocol.id}-${protocol.policy.pauseThreshold}-${protocol.policy.alertThreshold}-${protocol.policy.autoPause}-${protocol.policy.allowlist.join()}`} protocol={protocol} />
      ))}
      <Card>
        <h2 className="mb-3 font-display text-lg font-medium">Changelog</h2>
        <ul className="space-y-3">
          {changelog.map((change) => (
            <li key={change.id} className="border-t border-border pt-3 text-sm">
              <p>{change.text}</p>
              <p className="mt-1 text-textMuted">
                {change.who} · <LocalTime at={change.at} block={change.block} withDate />
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PolicyEditor({ protocol }: { protocol: Protocol }) {
  const consoleApi = useConsole();
  const { session } = useAuth();
  const toast = useToast();
  const [pauseAt, setPauseAt] = useState(protocol.policy.pauseThreshold);
  const [alertAt, setAlertAt] = useState(protocol.policy.alertThreshold);
  const [autoPause, setAutoPause] = useState(protocol.policy.autoPause);
  const [draft, setDraft] = useState("");

  function commit(text: string, allowlist = protocol.policy.allowlist) {
    consoleApi.updatePolicy(
      protocol.id,
      {
        ...protocol.policy,
        pauseThreshold: pauseAt,
        alertThreshold: Math.min(alertAt, pauseAt),
        autoPause,
        allowlist,
      },
      {
        protocolId: protocol.id,
        at: new Date().toISOString(),
        block: protocol.lastEventBlock + 1,
        who: session?.name ?? "You",
        text,
      },
    );
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-medium">{protocolLabel(protocol.name, protocol.chains)}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          Pause threshold <span className="font-mono">{pauseAt}</span>
          <input className="mt-2 w-full" type="range" min={50} max={100} value={pauseAt} onChange={(event) => setPauseAt(Number(event.target.value))} />
        </label>
        <label className="text-sm">
          Alert threshold <span className="font-mono">{Math.min(alertAt, pauseAt)}</span>
          <input className="mt-2 w-full" type="range" min={1} max={pauseAt} value={Math.min(alertAt, pauseAt)} onChange={(event) => setAlertAt(Number(event.target.value))} />
        </label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autoPause} onChange={(event) => setAutoPause(event.target.checked)} />
        Auto-pause {autoPause ? "ON" : "OFF — alerts only, humans decide"}
      </label>
      <p className="mt-3 text-sm text-textMuted">Cooldown after pause: {protocol.policy.cooldownMin} minutes</p>
      <Button
        className="mt-4"
        onClick={() => {
          commit(`Pause threshold ${pauseAt}, alert threshold ${Math.min(alertAt, pauseAt)}, auto-pause ${autoPause ? "on" : "off"}.`);
          toast("Policy saved");
        }}
      >
        Save policy
      </Button>
      <div className="mt-4">
        <h3 className="text-sm font-medium">Allowlist</h3>
        <ul className="mt-2 space-y-2">
          {protocol.policy.allowlist.length === 0 ? <li className="text-sm text-textMuted">No addresses yet.</li> : null}
          {protocol.policy.allowlist.map((address) => (
            <li key={address} className="flex items-center justify-between gap-2">
              <Address address={address} chain={protocol.chains[0]} />
              <Button
                variant="ghost"
                onClick={() => commit(`Removed ${address} from the allowlist.`, protocol.policy.allowlist.filter((item) => item !== address))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (!isAddress(value)) {
              toast("Enter a valid 0x address.");
              return;
            }
            commit(`Allowlisted ${value}.`, [...protocol.policy.allowlist, value]);
            setDraft("");
          }}
        >
          <TextInput className="max-w-md" placeholder="0x keeper or multisig" aria-label={`Allowlist address for ${protocolLabel(protocol.name, protocol.chains)}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <Button type="submit">Add address</Button>
        </form>
      </div>
    </Card>
  );
}
