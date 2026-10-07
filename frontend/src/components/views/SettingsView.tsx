"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDangerModal } from "@/components/ui/ConfirmDangerModal";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { AccountRole } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";

const roles: AccountRole[] = ["Founder", "Developer", "Security", "Other"];

export function SettingsView() {
  usePageTitle("Settings");
  const { session, updateSession, deleteAccount } = useAuth();
  const { address, isConnected } = useAccount();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(session?.name ?? "");
  const [org, setOrg] = useState(session?.org ?? "");
  const [role, setRole] = useState<AccountRole>(session?.role ?? "Founder");
  const [keys, setKeys] = useState<string[]>([]);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg font-medium">Profile</h2>
        {session ? (
          <form
            className="mt-4 grid max-w-lg gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              updateSession({ name, org, role });
              toast("Profile saved in this browser");
            }}
          >
            <label className="text-sm">
              Full name
              <TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="text-sm">
              Organisation
              <TextInput className="mt-1" value={org} onChange={(event) => setOrg(event.target.value)} />
            </label>
            <label className="text-sm">
              Role
              <SelectInput className="mt-1" value={role} onChange={(event) => setRole(event.target.value as AccountRole)}>
                {roles.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectInput>
            </label>
            <Button type="submit">Save profile</Button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-textMuted">Sign in to edit a profile. The demo console still loads without an account.</p>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-medium">Connected wallets</h2>
        <div className="mt-3">
          {isConnected && address ? <Address address={address} /> : <p className="text-sm text-textMuted">No wallet connected in this browser.</p>}
          {session?.address ? (
            <p className="mt-2 text-sm text-textMuted">
              Account wallet <Address address={session.address} />
            </p>
          ) : null}
        </div>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-medium">2FA</h2>
        <p className="mt-2 text-sm text-textMuted">Authenticator checks are not connected yet.</p>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={!session}
          onClick={() => {
            if (!session) return;
            updateSession({ twoFactor: !session.twoFactor });
            toast(session.twoFactor ? "2FA disabled" : "2FA enabled");
          }}
        >
          {session?.twoFactor ? "Disable 2FA" : "Enable 2FA"}
        </Button>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-medium">API keys</h2>
        <p className="mt-2 text-sm text-textMuted">For webhooks and programmatic access. The full key is shown once.</p>
        <Button
          className="mt-3"
          onClick={() => {
            const key = `snl_${crypto.randomUUID().replace(/-/g, "")}`;
            setFreshKey(key);
            setKeys((current) => [`snl_…${key.slice(-4)}`, ...current]);
          }}
        >
          Create key
        </Button>
        {freshKey ? <p className="mt-3 break-all rounded-control bg-panel2 p-3 font-mono text-sm">{freshKey}</p> : null}
        <ul className="mt-3 space-y-1 font-mono text-sm text-textMuted">
          {keys.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </Card>
      <Card className="border-dangerBorder">
        <h2 className="font-display text-lg font-medium text-dangerText">Delete account</h2>
        <p className="mt-2 text-sm text-textMuted">Removes the browser account. Protocols in this demo stay on the device.</p>
        <Button variant="danger" className="mt-3" disabled={!session} onClick={() => setRemoveOpen(true)}>
          Delete account
        </Button>
      </Card>
      <ConfirmDangerModal
        open={removeOpen}
        title="Delete account"
        description="Type DELETE to remove this browser account."
        expected="DELETE"
        confirmLabel="Delete account"
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => {
          deleteAccount();
          toast("Account deleted");
          router.push("/");
        }}
      />
    </div>
  );
}
