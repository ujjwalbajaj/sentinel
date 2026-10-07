"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useConsole, useTeam } from "@/hooks/useSentinel";
import type { TeamRole } from "@/lib/types";
import { PUBLIC_MODE } from "@/lib/chains";
import { ReadOnlyDemo } from "@/components/ui/ReadOnlyDemo";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { isAddress } from "viem";

const roles: TeamRole[] = ["Owner", "Admin", "Responder", "Viewer"];

export function TeamView() {
  usePageTitle("Team");
  const { data: team = [] } = useTeam();
  const consoleApi = useConsole();
  const { session } = useAuth();
  const toast = useToast();
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<TeamRole>("Viewer");

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg font-medium">Invite</h2>
        <p className="mt-1 text-sm text-textMuted">Responder can request an unpause and mark a false positive. Viewer can only read.</p>
        {PUBLIC_MODE ? <ReadOnlyDemo className="mt-4" /> : null}
        {PUBLIC_MODE ? null : (
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = contact.trim();
            const email = value.includes("@");
            if (!email && !isAddress(value)) {
              toast("Enter an email or a wallet address.");
              return;
            }
            consoleApi.invite({
              id: crypto.randomUUID(),
              name: email ? value.split("@")[0] : "Wallet member",
              contact: value,
              role,
            });
            setContact("");
            toast("Invite recorded in this browser");
          }}
        >
          <TextInput className="max-w-sm" placeholder="Email or 0x address" aria-label="Invite contact" value={contact} onChange={(event) => setContact(event.target.value)} />
          <SelectInput className="max-w-[180px]" aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>
            {roles.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectInput>
          <Button type="submit">Invite</Button>
        </form>
        )}
      </Card>
      <div className="overflow-x-auto rounded-card border border-border bg-panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-textMuted">
            <tr>
              {["Member", "Contact", "Role"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {member.you && session ? session.name : member.name}
                  {member.you ? <span className="ml-2 text-xs text-textMuted">You</span> : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{member.contact}</td>
                <td className="px-4 py-3">{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
