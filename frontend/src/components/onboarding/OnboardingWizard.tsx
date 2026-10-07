"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, isAddress, type PublicClient } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { SignInButton } from "@/components/auth/SignInButton";
import { AppShell } from "@/components/shell/AppShell";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { TxPreview } from "@/components/tx/TxPreview";
import { api, isSignInMessage } from "@/lib/api";
import { guardianAbi, vulnerableVaultAbi } from "@/lib/abi";
import { chainMeta, PUBLIC_MODE } from "@/lib/chains";
import { ReadOnlyDemo } from "@/components/ui/ReadOnlyDemo";
import { protocolLabel } from "@/lib/labels";
import { checkBytecode } from "@/lib/chainRead";
import { txUrl } from "@/lib/explorer";
import { liveSocket } from "@/lib/socket";
import { explainTxError } from "@/lib/txError";
import type { Chain } from "@/lib/types";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/providers/AuthProvider";
import baseDeployment from "@/shared/deployments/8453.json";
import bscDeployment from "@/shared/deployments/56.json";

const steps = ["Add protocol", "Grant pause permission", "Register with Guardian", "Protected"];

type Created = {
  id: string;
  name: string;
  chain: Chain;
  address: `0x${string}`;
  guardian: `0x${string}`;
  pauserGranted: boolean;
};

type ProtocolBody = {
  protocol?: { id?: string; status?: string } | null;
  guardianAddress?: string;
  isAdmin?: boolean;
  protectedVault?: boolean;
  pauserRoleGranted?: boolean;
};

type TxPhase = "idle" | "pending" | "confirmed";

function deployedGuardian(chain: Chain) {
  const raw = chain === "base" ? baseDeployment.guardian : bscDeployment.guardian;
  return isAddress(raw) ? raw : null;
}

async function pauserRoleOf(client: PublicClient, vault: `0x${string}`) {
  return client.readContract({
    address: vault,
    abi: vulnerableVaultAbi,
    functionName: "PAUSER_ROLE",
  }) as Promise<`0x${string}`>;
}

async function hasRole(client: PublicClient, vault: `0x${string}`, role: `0x${string}`, account: `0x${string}`) {
  return client.readContract({
    address: vault,
    abi: vulnerableVaultAbi,
    functionName: "hasRole",
    args: [role, account],
  }) as Promise<boolean>;
}

function chainFromQuery(): Chain {
  if (typeof window === "undefined") return "bsc";
  const raw = new URLSearchParams(window.location.search).get("chain");
  if (raw === "base" || raw === "8453") return "base";
  return "bsc";
}

export function OnboardingWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, ready, updateSession } = useAuth();
  usePageTitle("Add protocol");
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [chain, setChain] = useState<Chain>("bsc");
  const [vault, setVault] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [already, setAlready] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState("");
  const [txPhase, setTxPhase] = useState<TxPhase>("idle");
  const [preview, setPreview] = useState<{ action: string; fee: string; send: () => Promise<void> } | null>(null);

  useEffect(() => {
    setChain(chainFromQuery());
  }, []);

  const activeChain = created?.chain ?? chain;
  const meta = chainMeta[activeChain];
  const publicClient = usePublicClient({ chainId: meta.chainId });
  const onTargetChain = chainId === meta.chainId;

  async function ensureChain(target: Chain) {
    const id = chainMeta[target].chainId;
    if (chainId === id) return;
    await switchChainAsync({ chainId: id });
  }

  async function addProtocol(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setAlready(false);
    if (!session) return;
    if (!name.trim()) {
      setError("Protocol name is required.");
      return;
    }
    if (!address) {
      setError("Connect the vault admin wallet");
      return;
    }
    const guardianDeployed = deployedGuardian(chain);
    if (!guardianDeployed) {
      setError(`Guardian is not deployed on ${chainMeta[chain].label}.`);
      return;
    }
    const bytecode = await checkBytecode(chain, vault.trim());
    if (bytecode.status !== "contract") {
      setError(bytecode.message);
      return;
    }
    const vaultAddress = vault.trim() as `0x${string}`;
    setBusy(true);
    try {
      const body = await api<ProtocolBody>("/protocols", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), chainId: chainMeta[chain].chainId, vaultAddress }),
      });
      const guardian = String(body.guardianAddress ?? "");
      if (!isAddress(guardian)) {
        setError("Backend did not return a Guardian address.");
        return;
      }
      const client = publicClient;
      let isAdmin = body.isAdmin;
      let protectedVault = body.protectedVault;
      let pauserGranted = body.pauserRoleGranted;
      if (client && (typeof isAdmin !== "boolean" || typeof protectedVault !== "boolean" || typeof pauserGranted !== "boolean")) {
        const adminRole = (await client.readContract({
          address: vaultAddress,
          abi: vulnerableVaultAbi,
          functionName: "DEFAULT_ADMIN_ROLE",
        })) as `0x${string}`;
        if (typeof isAdmin !== "boolean") isAdmin = await hasRole(client, vaultAddress, adminRole, address);
        if (typeof protectedVault !== "boolean") {
          protectedVault = (await client.readContract({
            address: guardian,
            abi: guardianAbi,
            functionName: "protectedVault",
            args: [vaultAddress],
          })) as boolean;
        }
        if (typeof pauserGranted !== "boolean") {
          const role = await pauserRoleOf(client, vaultAddress);
          pauserGranted = await hasRole(client, vaultAddress, role, guardian);
        }
      }
      const next: Created = {
        id: String(body.protocol?.id ?? ""),
        name: name.trim(),
        chain,
        address: vaultAddress,
        guardian,
        pauserGranted: Boolean(pauserGranted),
      };
      if (protectedVault) {
        setCreated(next);
        setAlready(true);
        updateSession({ onboarded: true });
        setStep(4);
        return;
      }
      if (!isAdmin) {
        setError("Connect the vault admin wallet");
        return;
      }
      setCreated(next);
      setHash("");
      setTxPhase("idle");
      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backend offline.";
      if (isSignInMessage(message)) setError("Sign in with Ethereum first.");
      else if (/caller is not the vault admin/i.test(message)) setError("Connect the vault admin wallet");
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(action: "grant" | "register") {
    if (!created || !address || !publicClient) {
      setError("Connect the vault admin wallet");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (action === "grant") {
        const role = await pauserRoleOf(publicClient, created.address);
        const granted = await hasRole(publicClient, created.address, role, created.guardian);
        if (granted) {
          setCreated({ ...created, pauserGranted: true });
          setStep(3);
          return;
        }
      }
      const pauserRole = action === "grant" ? await pauserRoleOf(publicClient, created.address) : undefined;
      const request =
        action === "grant"
          ? {
              address: created.address,
              abi: vulnerableVaultAbi,
              functionName: "grantRole" as const,
              args: [pauserRole!, created.guardian] as const,
              account: address,
              chainId: chainMeta[created.chain].chainId,
            }
          : {
              address: created.guardian,
              abi: guardianAbi,
              functionName: "registerVault" as const,
              args: [created.address] as const,
              account: address,
              chainId: chainMeta[created.chain].chainId,
            };
      const gas = await publicClient.estimateContractGas(request);
      const gasPrice = await publicClient.getGasPrice();
      const fee = formatEther(gas * gasPrice);
      setPreview({
        action: action === "grant" ? "Grant PAUSER_ROLE to the Guardian" : "Register vault with the Guardian",
        fee,
        send: async () => {
          const watch = action === "register" ? watchProtected(created) : null;
          if (watch) void watch.done.catch(() => undefined);
          try {
            await ensureChain(created.chain);
            const tx = await writeContractAsync(request);
            setHash(tx);
            setTxPhase("pending");
            setPreview(null);
            const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
            if (receipt.status === "reverted") throw new Error("Transaction reverted.");
            setTxPhase("confirmed");
            if (action === "grant") {
              setCreated({ ...created, pauserGranted: true });
              setStep(3);
              return;
            }
            await finishProtected(created, watch);
          } catch (err) {
            watch?.cancel();
            throw err;
          }
        },
      });
    } catch (err) {
      setError(explainTxError(err));
    } finally {
      setBusy(false);
    }
  }

  function watchProtected(current: Created) {
    let cancel = () => {};
    const done = new Promise<void>((resolve, reject) => {
      const socket = liveSocket();
      if (!socket) {
        reject(new Error("Live updates are offline."));
        return;
      }
      const live = socket;
      const timer = window.setTimeout(() => {
        live.off("protocol:updated", onUpdate);
        reject(new Error("Waiting for SENTINEL to mark this vault protected."));
      }, 60000);
      function onUpdate(payload: { id?: string; vault?: string; status?: string }) {
        if (!payload || payload.status !== "protected") return;
        const sameId = Boolean(payload.id && current.id && payload.id === current.id);
        const sameVault = Boolean(payload.vault && payload.vault.toLowerCase() === current.address.toLowerCase());
        if (!sameId && !sameVault) return;
        window.clearTimeout(timer);
        live.off("protocol:updated", onUpdate);
        resolve();
      }
      cancel = () => {
        window.clearTimeout(timer);
        live.off("protocol:updated", onUpdate);
      };
      live.on("protocol:updated", onUpdate);
    });
    return { done, cancel };
  }

  async function finishProtected(current: Created, watch: { done: Promise<void>; cancel: () => void } | null) {
    try {
      if (watch) await watch.done;
      else throw new Error("Live updates are offline.");
    } catch (err) {
      if (!current.id) throw err;
      const body = await api<{ status?: string; live?: { protectedVault?: boolean } }>(`/protocols/${current.id}`);
      if (!body.live?.protectedVault && body.status !== "protected") throw err;
    }
    updateSession({ onboarded: true });
    setStep(4);
    await queryClient.invalidateQueries({ queryKey: ["protocols"] });
    router.push("/app/protocols");
  }

  const form = (
    <div className={session ? "mx-auto max-w-xl" : "mx-auto max-w-xl px-4 py-10"}>
        <Stepper steps={steps} current={step} />
        <Card className="mt-4">
          {error ? <p role="alert" className="mb-3 text-sm text-dangerText">{error}</p> : null}
          {txPhase === "pending" && hash ? (
            <p className="mb-3 text-sm">
              Pending.{" "}
              <a className="text-info" href={txUrl(activeChain, hash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            </p>
          ) : null}
          {txPhase === "confirmed" && hash ? (
            <p className="mb-3 text-sm">
              Confirmed.{" "}
              <a className="text-info" href={txUrl(activeChain, hash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            </p>
          ) : null}

          {step === 1 ? (
            <form className="space-y-3" onSubmit={(event) => void addProtocol(event)}>
              <h1 className="font-display text-2xl font-medium">Add protocol</h1>
              <label className="block text-sm">
                Protocol name
                <TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="block text-sm">
                Chain
                <SelectInput className="mt-1" value={chain} onChange={(event) => setChain(event.target.value as Chain)}>
                  <option value="bsc">BNB Chain</option>
                  <option value="base">Base</option>
                </SelectInput>
              </label>
              <label className="block text-sm">
                Vault address
                <TextInput className="mt-1 font-mono" value={vault} onChange={(event) => setVault(event.target.value)} placeholder="0x" />
              </label>
              {PUBLIC_MODE ? (
                <ReadOnlyDemo />
              ) : session ? (
                <Button type="submit" disabled={busy}>
                  {busy ? "Checking…" : "Continue"}
                </Button>
              ) : (
                <SignInButton />
              )}
            </form>
          ) : null}

          {step === 2 && created ? (
            <div className="space-y-3">
              <h1 className="font-display text-2xl font-medium">Grant pause permission</h1>
              <p className="rounded-control border border-border bg-panel2 px-3 py-3 text-sm">
                SENTINEL can: pause. Cannot: unpause, withdraw, upgrade.
              </p>
              <p className="font-mono text-xs text-textMuted">grantRole(PAUSER_ROLE, {created.guardian})</p>
              {created.pauserGranted ? <p className="text-sm text-safe">Pause permission already granted.</p> : null}
              {!isConnected ? <p className="text-sm text-warn">Connect the vault admin wallet</p> : null}
              {isConnected && !onTargetChain ? (
                <div>
                  <p className="text-sm text-warn">Wrong network. Switch to {meta.label}.</p>
                  <Button className="mt-2" variant="secondary" onClick={() => switchChain({ chainId: meta.chainId })}>
                    Switch to {meta.label}
                  </Button>
                </div>
              ) : null}
              {PUBLIC_MODE ? (
                <ReadOnlyDemo />
              ) : created.pauserGranted ? (
                <Button onClick={() => setStep(3)}>Continue</Button>
              ) : (
                <Button onClick={() => void openPreview("grant")} disabled={busy || !isConnected}>
                  Grant pause permission
                </Button>
              )}
            </div>
          ) : null}

          {step === 3 && created ? (
            <div className="space-y-3">
              <h1 className="font-display text-2xl font-medium">Register with Guardian</h1>
              <p className="font-mono text-xs text-textMuted">registerVault({created.address})</p>
              {isConnected && !onTargetChain ? (
                <div>
                  <p className="text-sm text-warn">Wrong network. Switch to {meta.label}.</p>
                  <Button variant="secondary" onClick={() => switchChain({ chainId: meta.chainId })}>
                    Switch to {meta.label}
                  </Button>
                </div>
              ) : null}
              {PUBLIC_MODE ? (
                <ReadOnlyDemo />
              ) : (
                <Button onClick={() => void openPreview("register")} disabled={busy || !isConnected}>
                  {busy ? "Waiting…" : "Register vault"}
                </Button>
              )}
            </div>
          ) : null}

          {step === 4 && created ? (
            <div className="space-y-3">
              {already ? <p className="text-sm text-safe">Already protected</p> : null}
              <h1 className="font-display text-2xl font-medium">
                {protocolLabel(created.name, created.chain)} is protected
              </h1>
              <p className="text-sm text-textMuted">The Guardian can pause this vault. It cannot unpause or move funds.</p>
              <Button onClick={() => router.push("/app/protocols")}>Back to protocols</Button>
            </div>
          ) : null}
        </Card>
        <p className="mt-4 text-sm text-textMuted">
          {session ? (
            <Link href="/app/protocols" className="text-info">
              Back to dashboard
            </Link>
          ) : (
            <Link href="/" className="text-info">
              Leave onboarding
            </Link>
          )}
        </p>
    </div>
  );

  const previewNode = (
    <TxPreview
      open={Boolean(preview)}
      chainName={meta.label}
      action={preview?.action ?? ""}
      fee={preview?.fee ?? "—"}
      symbol={meta.symbol}
      busy={busy}
      error={error}
      onClose={() => setPreview(null)}
      onSend={() => {
        if (!preview) return;
        setBusy(true);
        setError("");
        preview
          .send()
          .catch((err: unknown) => setError(explainTxError(err)))
          .finally(() => setBusy(false));
      }}
    />
  );

  if (!ready) return <div className="min-h-screen bg-bg" />;
  if (session) {
    return (
      <AppShell>
        {form}
        {previewNode}
      </AppShell>
    );
  }
  return (
    <>
      <PublicHeader />
      {form}
      {previewNode}
    </>
  );
}
