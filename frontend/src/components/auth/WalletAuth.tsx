"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiweMessage } from "siwe";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { base, bsc } from "wagmi/chains";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { WalletButton } from "@/components/shell/WalletButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { AccountRole } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

const roles: AccountRole[] = ["Founder", "Developer", "Security", "Other"];

export function WalletAuth({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const { verifySiwe, saveProfile } = useAuth();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync, isPending } = useSignMessage();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState<AccountRole>("Founder");
  const [needProfile, setNeedProfile] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const supported = chainId === base.id || chainId === bsc.id;

  async function signIn() {
    if (!address || !chainId) return;
    setError("");
    setBusy(true);
    try {
      const nonceBody = await api<{ nonce: string }>(`/auth/nonce?address=${address}`);
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to SENTINEL. This signature does not grant pause rights.",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce: nonceBody.nonce,
      }).prepareMessage();
      const signature = await signMessageAsync({ message });
      const result = await verifySiwe(message, signature);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.profileComplete) {
        setNeedProfile(true);
        return;
      }
      router.push("/app");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not sign in.";
      if (/reject|denied/i.test(text)) setError("Wallet rejected the signature.");
      else if (/backend offline|failed to fetch|network/i.test(text)) setError("Backend offline.");
      else setError(text);
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !org.trim()) {
      setError("Name and organisation are required.");
      return;
    }
    setBusy(true);
    const message = await saveProfile({ name: name.trim(), org: org.trim(), role });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    router.push("/onboarding");
  }

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-10">
        <Card className="w-full">
          <h1 className="font-display text-3xl font-medium">{mode === "signup" ? "Create account" : "Log in"}</h1>
          <p className="mt-2 text-sm text-textMuted">Connect a wallet on Base or BNB Chain and sign in with Ethereum.</p>
          {error ? (
            <p role="alert" className="mt-4 rounded-control border border-dangerBorder bg-dangerBg px-3 py-2 text-sm text-dangerText">
              {error}
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            <WalletButton />
            {isConnected && !supported ? (
              <div>
                <p className="text-sm text-warn">Wrong network. Switch to Base or BNB Chain.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={switching} onClick={() => switchChain({ chainId: base.id })}>
                    Switch to Base
                  </Button>
                  <Button variant="secondary" disabled={switching} onClick={() => switchChain({ chainId: bsc.id })}>
                    Switch to BNB Chain
                  </Button>
                </div>
              </div>
            ) : null}
            {isConnected && supported ? (
              <Button onClick={() => void signIn()} disabled={isPending || busy}>
                {isPending || busy ? "Waiting for signature…" : "Sign in with Ethereum"}
              </Button>
            ) : null}
            {needProfile ? (
              <form className="space-y-3 border-t border-border pt-4" onSubmit={(event) => void submitProfile(event)}>
                <p className="text-sm text-textMuted">First time on this wallet. Tell SENTINEL who you are.</p>
                <label className="block text-sm">
                  Full name
                  <TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="block text-sm">
                  Organisation / protocol name
                  <TextInput className="mt-1" value={org} onChange={(event) => setOrg(event.target.value)} />
                </label>
                <label className="block text-sm">
                  Role
                  <SelectInput className="mt-1" value={role} onChange={(event) => setRole(event.target.value as AccountRole)}>
                    {roles.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </SelectInput>
                </label>
                <Button type="submit" disabled={busy}>
                  Continue
                </Button>
              </form>
            ) : null}
            <p className="text-sm text-textMuted">Email and password are coming soon.</p>
            <p className="text-sm text-textMuted">
              {mode === "signup" ? (
                <>
                  Already have an account? <Link href="/login" className="text-info">Log in</Link>
                </>
              ) : (
                <>
                  New protocol? <Link href="/signup" className="text-info">Create an account</Link>
                </>
              )}
            </p>
          </div>
        </Card>
      </main>
    </>
  );
}
