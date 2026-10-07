import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createWalletClient,
  encodeAbiParameters,
  encodeDeployData,
  formatEther,
  getAddress,
  http,
  keccak256,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { env, probeWei, strikeReentries, strikeWei } from "../config/env.js";
import { chainById, explorerTx, isSet, repoRoot, type ChainRuntime } from "../config/chains.js";
import { prisma } from "../db/client.js";
import { HttpError } from "../http-error.js";
import { live } from "../live/hub.js";
import { log } from "../log.js";
import { attackerAbi, mixerAbi, vaultAbi } from "../shared/load-abi.js";
import { encodeCall } from "../shared/call.js";
import { readContractValue } from "../shared/call.js";
import { decryptKey, freshKey, namedKey } from "./keys.js";
import { liveVaultWei } from "../vaults.js";
import { describeRevert, isOpaqueRevert, revertFromTrace } from "./revert.js";

export type DemoOutcome = "confirmed" | "reverted" | "failed";

export interface DemoTx {
  label: string;
  hash: string;
  explorerUrl: string;
  gasCostNative: string;
  status: DemoOutcome;
}

export interface DemoFacts {
  freshWallet: string | null;
  attackerContract: string | null;
  vaultBalance: string | null;
  allowlisted: boolean;
  revertReason: string | null;
  paused: boolean | null;
}

export interface DemoConfirmation {
  action: string;
  chainId: number;
  status: DemoOutcome;
  label: string;
  txs: DemoTx[];
  result: DemoFacts;
  error?: string;
  line: string;
}

export type DemoStep = "funded" | "allowlisted" | "deployed" | "probed" | "struck";

export interface DemoProgress {
  chainId: number;
  step: DemoStep | null;
  freshWallet: { address: string; balanceWei: string } | null;
  attackerContract: { address: string; balanceWei: string } | null;
  allowlisted: boolean;
  native: string;
  vault: { address: string; balanceWei: string; paused: boolean } | null;
  balances: Record<string, { address: string; balanceWei: string }>;
  previous: Array<{ fresh: { address: string }; attacker: { address: string } | null }>;
  actions: DemoConfirmation[];
}

const LABELS: Record<string, string> = {
  "fund-fresh-wallet": "Fund fresh wallet",
  "allowlist-fresh-wallet": "Allowlist fresh wallet",
  "deploy-attacker": "Deploy attacker",
  probe: "Probe",
  strike: "Strike",
  "control-withdraw": "Control withdraw",
  reset: "Reset",
  recycle: "Recycle",
  "refill-vault": "Refill vault",
  status: "Status",
};

const remembered = new Map<number, Map<string, DemoConfirmation>>();

function emptyFacts(revertReason: string | null = null): DemoFacts {
  return {
    freshWallet: null,
    attackerContract: null,
    vaultBalance: null,
    allowlisted: false,
    revertReason,
    paused: null,
  };
}

function remember(body: DemoConfirmation) {
  if (body.action === "fund-fresh-wallet" && body.status === "confirmed") remembered.set(body.chainId, new Map());
  const saved = remembered.get(body.chainId) ?? new Map<string, DemoConfirmation>();
  saved.set(body.action, body);
  remembered.set(body.chainId, saved);
}

function announce(chainId: number, action: string, label: string, status: "pending") {
  const line = `[DEMO] ${label} pending`;
  log.info(line);
  live("demo:action", {
    action,
    chainId,
    status,
    label,
    txs: [],
    result: emptyFacts(),
    line,
  });
}

function announceDone(body: DemoConfirmation) {
  remember(body);
  log.info(body.line);
  live("demo:action", body);
}

function fail(chainId: number, action: string, label: string, error: string): DemoConfirmation {
  const body = confirmation(chainId, action, label, "failed", [], emptyFacts(error), error);
  announceDone(body);
  return body;
}

function confirmation(
  chainId: number,
  action: string,
  label: string,
  status: DemoOutcome,
  txs: DemoTx[],
  result: DemoFacts,
  error?: string,
  line?: string,
): DemoConfirmation {
  return {
    action,
    chainId,
    status,
    label,
    txs,
    result,
    error,
    line: demoLine(line || outcomeLine(action, status, result, error)),
  };
}

function demoLine(text: string) {
  const trimmed = text.trim();
  return trimmed.startsWith("[DEMO]") ? trimmed : `[DEMO] ${trimmed}`;
}

function shortAddr(value: string | null) {
  if (!value || value.length < 10) return value ?? "";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function trimAmount(value: string) {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function reasonName(reason: string | null) {
  if (!reason) return "reverted";
  if (reason.startsWith("EnforcedPause (")) return reason;
  const custom = reason.match(/custom error ['"]?([A-Za-z0-9_]+)/i);
  if (custom) return describeRevert(custom[1]);
  const known = reason.match(/\b(EnforcedPause|NotAllowlisted|NotVaultAdmin|PauserRoleMissing)\b/);
  if (known) return describeRevert(known[1]);
  const tail = reason.split(":").pop()?.trim();
  return tail && tail.length < 96 ? tail : reason;
}

function outcomeLine(action: string, status: DemoOutcome, result: DemoFacts, error?: string, detail?: string) {
  if (status === "failed") return error || "Demo action failed";
  if (action === "fund-fresh-wallet" && status === "confirmed" && result.freshWallet) {
    return detail ? `Fresh wallet ${shortAddr(result.freshWallet)} · ${detail}` : `Fresh wallet ${shortAddr(result.freshWallet)}`;
  }
  if (action === "allowlist-fresh-wallet") return status === "confirmed" ? "Allowlisted ✓" : `Allowlist reverted · ${reasonName(result.revertReason)}`;
  if (action === "deploy-attacker" && status === "confirmed" && result.attackerContract) return `Attacker ${shortAddr(result.attackerContract)}`;
  if (action === "probe") {
    return status === "confirmed" ? `Probe mined${detail ? ` · ${detail}` : ""}` : `Probe reverted · ${reasonName(result.revertReason)}`;
  }
  if (action === "strike") {
    return status === "reverted" ? `Strike reverted · ${reasonName(result.revertReason)}` : status === "confirmed" ? "Strike mined" : `Strike failed · ${error || reasonName(result.revertReason)}`;
  }
  if (action === "refill-vault") {
    if (status === "confirmed") return detail ? `Refill vault · ${detail}` : "Refill vault confirmed";
    return `Refill vault ${status === "reverted" ? "reverted" : "failed"} · ${reasonName(result.revertReason) || error || status}`;
  }
  if (status === "reverted") return `${LABELS[action] ?? action} reverted · ${reasonName(result.revertReason)}`;
  return `${LABELS[action] ?? action} confirmed`;
}

export async function runDemo(chainId: number, action: string): Promise<DemoConfirmation | DemoProgress> {
  const chain = chainById(chainId);
  const label = LABELS[action] ?? action;
  if (!chain) return fail(chainId, action, label, "chainId must be 56 or 8453");
  if (!LABELS[action]) return fail(chain.id, action, label, `Unknown demo action ${action}`);
  if (action === "status") return demoProgress(chain);
  announce(chain.id, action, label, "pending");
  try {
    const beforeVault = action === "probe" || action === "strike" || action === "refill-vault" ? await readVaultWei(chain) : null;
    const outcome = await perform(chain, action);
    const facts = await factsOf(chain, outcome.revertReason ?? null);
    const afterVault = beforeVault == null ? null : await readVaultWei(chain, true);
    const detail = action === "fund-fresh-wallet" ? await freshAmount(chain, facts.freshWallet) : vaultMove(beforeVault, afterVault);
    const body = confirmation(chain.id, action, label, outcome.status, outcome.txs, facts, outcome.error, outcomeLine(action, outcome.status, facts, outcome.error, detail));
    announceDone(body);
    return body;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo action failed";
    const facts = await factsOf(chain, null).catch(() => emptyFacts(message));
    const body = confirmation(chain.id, action, label, "failed", [], facts, message, outcomeLine(action, "failed", facts, message));
    announceDone(body);
    return body;
  }
}

async function perform(chain: ChainRuntime, action: string): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  switch (action) {
    case "fund-fresh-wallet":
      return fundFresh(chain);
    case "allowlist-fresh-wallet":
      return allowlistFresh(chain);
    case "deploy-attacker":
      return deployAttacker(chain);
    case "probe":
      return callAttacker(chain, "probe");
    case "strike":
      return callAttacker(chain, "strike");
    case "control-withdraw":
      return controlWithdraw(chain);
    case "reset":
      return resetVault(chain);
    case "recycle":
      return recycle(chain);
    case "refill-vault":
      return refillVault(chain);
    default:
      return { status: "failed", txs: [], error: `Unknown demo action ${action}` };
  }
}

function txOf(sent: Mined): DemoTx {
  return {
    label: sent.label,
    hash: sent.hash,
    explorerUrl: sent.explorerUrl,
    gasCostNative: sent.gasCostNative,
    status: sent.status,
  };
}

function settled(sent: Mined[]): { status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string } {
  const failed = sent.find((item) => item.status !== "confirmed");
  return {
    status: failed?.status === "failed" ? "failed" : failed ? "reverted" : "confirmed",
    txs: sent.map(txOf),
    revertReason: failed?.revertReason,
    error: failed?.error ?? failed?.revertReason,
  };
}

function stopped(sent: Mined[]) {
  return settled(sent);
}

async function factsOf(chain: ChainRuntime, revertReason: string | null): Promise<DemoFacts> {
  const fresh = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "fresh" } } });
  const attacker = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "attacker" } } });
  let allowlisted = false;
  let paused: boolean | null = null;
  let vaultBalance: string | null = null;
  if (isSet(chain.deployment.vault)) {
    const vault = getAddress(chain.deployment.vault);
    vaultBalance = (await liveVaultWei(chain, vault, true)).toString();
    paused = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "paused");
    if (fresh) {
      allowlisted = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "demoAllowlist", [getAddress(fresh.address)]);
    }
  }
  return {
    freshWallet: fresh ? getAddress(fresh.address) : null,
    attackerContract: attacker ? getAddress(attacker.address) : null,
    vaultBalance,
    allowlisted,
    revertReason,
    paused,
  };
}

async function readVaultWei(chain: ChainRuntime, fresh = false) {
  if (!isSet(chain.deployment.vault)) return null;
  return liveVaultWei(chain, getAddress(chain.deployment.vault), fresh);
}

async function freshAmount(chain: ChainRuntime, address: string | null) {
  if (!address) return undefined;
  const wei = await chain.http().getBalance({ address: getAddress(address) });
  return `${trimAmount(formatEther(wei))} ${chain.native}`;
}

function vaultMove(before: bigint | null, after: bigint | null) {
  if (before == null || after == null) return undefined;
  return `vault ${formatVaultAmount(before)} → ${formatVaultAmount(after)}`;
}

function formatVaultAmount(wei: bigint): string {
  const [whole, frac = ""] = formatEther(wei).split(".");
  return `${whole}.${frac.padEnd(4, "0").slice(0, 4)}`;
}

async function fundFresh(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const mixer = requireAddress(chain.deployment.mixer, "mixer");
  const funder = signer(chain, namedKey(env.ATTACKER_FUNDER_PRIVATE_KEY, "ATTACKER_FUNDER_PRIVATE_KEY"));
  const note = await readContractValue<bigint>(chain.http(), mixer, mixerAbi, "denom");
  const gasPrice = await chain.http().getGasPrice();
  const gas = 500_000n;
  const needs = note + gas * gasPrice * 2n + floor("ATTACKER_FUNDER_FLOOR_WEI");
  const balance = await chain.http().getBalance({ address: funder.address, blockTag: "latest" });
  if (balance < needs) {
    const have = `${trimAmount(formatEther(balance))} ${chain.native}`;
    const required = `${trimAmount(formatEther(needs))} ${chain.native}`;
    throw new HttpError(`Funder low: ${have}, needs ${required}`, 400);
  }
  const fresh = freshKey();
  const secret = `0x${randomBytes(32).toString("hex")}` as Hex;
  const commitment = keccak256(encodeAbiParameters([{ type: "bytes32" }], [secret]));
  await archiveCurrentPair(chain.id);
  await prisma.demoWallet.create({
    data: { chainId: chain.id, role: "fresh", address: fresh.address, ciphertext: fresh.ciphertext },
  });
  const deposit = await broadcast(chain, funder, "mixer-deposit", floor("ATTACKER_FUNDER_FLOOR_WEI"), {
    to: mixer,
    data: encodeCall(mixerAbi, "deposit", [commitment]),
    value: note,
  });
  if (deposit.status !== "confirmed") return stopped([deposit]);
  const withdraw = await broadcast(chain, funder, "mixer-withdraw", floor("ATTACKER_FUNDER_FLOOR_WEI"), {
    to: mixer,
    data: encodeCall(mixerAbi, "withdraw", [secret, fresh.address]),
  });
  return settled([deposit, withdraw]);
}

async function allowlistFresh(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const vault = requireAddress(chain.deployment.vault, "vault");
  const fresh = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "fresh" } } });
  if (!fresh) throw new HttpError("Fund a fresh wallet first", 400);
  const admin = signer(chain, namedKey(env.VAULT_ADMIN_PRIVATE_KEY, "VAULT_ADMIN_PRIVATE_KEY"));
  const sent = await broadcast(chain, admin, "allowlist", floor("VAULT_ADMIN_FLOOR_WEI"), {
    to: vault,
    data: encodeCall(vaultAbi, "setAllowlist", [[getAddress(fresh.address)], true]),
  });
  return settled([sent]);
}

async function deployAttacker(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const vault = requireAddress(chain.deployment.vault, "vault");
  const fresh = await freshSigner(chain);
  const bytecode = attackerBytecode();
  const data = encodeDeployData({
    abi: attackerAbi,
    bytecode,
    args: [vault],
  } as Parameters<typeof encodeDeployData>[0]);
  const sent = await broadcast(chain, fresh, "deploy", floor("FRESH_WALLET_FLOOR_WEI"), {
    data,
    gas: 3_000_000n,
  });
  if (sent.status !== "confirmed") return settled([sent]);
  const created = sent.receipt?.contractAddress;
  if (!created) return { status: "failed", txs: [txOf(sent)], error: "Deploy transaction did not create a contract" };
  const previous = await prisma.demoWallet.findUnique({
    where: { chainId_role: { chainId: chain.id, role: "attacker" } },
  });
  if (previous) {
    await prisma.demoWallet.update({
      where: { id: previous.id },
      data: { role: `archived:attacker:${previous.id}` },
    });
  }
  await prisma.demoWallet.create({
    data: { chainId: chain.id, role: "attacker", address: getAddress(created), ciphertext: "" },
  });
  return settled([sent]);
}

async function callAttacker(chain: ChainRuntime, action: "probe" | "strike"): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const row = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "attacker" } } });
  if (!row) throw new HttpError("Deploy the attacker contract first", 400);
  const fresh = await freshSigner(chain);
  const value = action === "probe" ? probeWei(chain.id) : strikeWei(chain.id);
  const data = action === "strike" ? encodeCall(attackerAbi, "strike", [strikeReentries()]) : encodeCall(attackerAbi, "probe");
  const sent = await broadcast(chain, fresh, action, floor("FRESH_WALLET_FLOOR_WEI"), {
    to: getAddress(row.address),
    data,
    value,
    gas: 1_500_000n,
  });
  return settled([sent]);
}

async function controlWithdraw(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const vault = requireAddress(chain.deployment.vault, "vault");
  const user = signer(chain, namedKey(env.USER_PRIVATE_KEY, "USER_PRIVATE_KEY"));
  const amount = (await mixerDenom(chain)) / 10n;
  const deposit = await broadcast(chain, user, "control-deposit", floor("USER_FLOOR_WEI"), {
    to: vault,
    data: encodeCall(vaultAbi, "deposit"),
    value: amount,
  });
  if (deposit.status !== "confirmed") return stopped([deposit]);
  const withdraw = await broadcast(chain, user, "control-withdraw", floor("USER_FLOOR_WEI"), {
    to: vault,
    data: encodeCall(vaultAbi, "withdrawAll"),
    gas: 800_000n,
  });
  return settled([deposit, withdraw]);
}

async function recycle(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const skipped = { status: "confirmed" as const, txs: [] as DemoTx[] };
  const row = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "attacker" } } });
  const freshRow = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "fresh" } } });
  if (!row || !freshRow?.ciphertext) return skipped;
  const fresh = privateKeyToAccount(decryptKey(freshRow.ciphertext));
  const funder = signer(chain, namedKey(env.ATTACKER_FUNDER_PRIVATE_KEY, "ATTACKER_FUNDER_PRIVATE_KEY"));
  const client = chain.http();
  const gasPrice = await client.getGasPrice();
  const sweepGas = 200_000n;
  const freshBalance = await client.getBalance({ address: fresh.address, blockTag: "latest" });
  if (freshBalance < sweepGas * gasPrice) return skipped;
  const attacker = getAddress(row.address);
  const attackerBalance = await client.getBalance({ address: attacker, blockTag: "latest" });
  const sent: Mined[] = [];
  if (attackerBalance > 0n) {
    const sweep = await broadcast(chain, fresh, "recycle-sweep", 0n, {
      to: attacker,
      data: encodeCall(attackerAbi, "sweep"),
      gas: sweepGas,
    });
    sent.push(sweep);
    if (sweep.status !== "confirmed") return settled(sent);
  }
  const balance = await client.getBalance({ address: fresh.address, blockTag: "latest" });
  const gas = 21_000n;
  const fee = gas * gasPrice;
  if (balance <= fee) return sent.length === 0 ? skipped : settled(sent);
  const returned = await broadcast(chain, fresh, "recycle-return", 0n, {
    to: funder.address,
    value: balance - fee,
    gas,
  });
  sent.push(returned);
  return settled(sent);
}

function refillTargetWei(chainId: number): bigint {
  return chainId === 8453 ? 2_000_000_000_000_000n : 5_000_000_000_000_000n;
}

async function refillVault(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const vault = requireAddress(chain.deployment.vault, "vault");
  const recycled = await recycle(chain).catch(() => ({ status: "confirmed" as const, txs: [] as DemoTx[] }));
  const txs = [...recycled.txs];
  const paused = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "paused");
  if (paused) {
    const opened = await resetVault(chain);
    txs.push(...opened.txs);
    if (opened.status !== "confirmed") return { status: opened.status, txs, error: opened.error, revertReason: opened.revertReason };
  }
  const cap = await readContractValue<bigint>(chain.http(), vault, vaultAbi, "maxTotalDeposits");
  const target = refillTargetWei(chain.id);
  const ceiling = cap < target ? cap : target;
  const current = await liveVaultWei(chain, vault, true);
  if (current >= ceiling) return { status: "confirmed", txs };
  const amount = ceiling - current;
  const user = signer(chain, namedKey(env.USER_PRIVATE_KEY, "USER_PRIVATE_KEY"));
  const allowed = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "demoAllowlist", [user.address]);
  if (!allowed) {
    const admin = signer(chain, namedKey(env.VAULT_ADMIN_PRIVATE_KEY, "VAULT_ADMIN_PRIVATE_KEY"));
    const listed = await broadcast(chain, admin, "refill-allowlist", floor("VAULT_ADMIN_FLOOR_WEI"), {
      to: vault,
      data: encodeCall(vaultAbi, "setAllowlist", [[user.address], true]),
    });
    txs.push(txOf(listed));
    if (listed.status !== "confirmed") {
      return { status: listed.status === "failed" ? "failed" : "reverted", txs, error: listed.error, revertReason: listed.revertReason };
    }
  }
  const gas = 500_000n;
  const gasPrice = await chain.http().getGasPrice();
  const need = amount + gas * gasPrice + floor("USER_FLOOR_WEI");
  const balance = await chain.http().getBalance({ address: user.address });
  if (balance < need) {
    const funded = await fundUser(chain, user.address, need - balance);
    txs.push(...funded.txs);
    if (funded.status !== "confirmed") return { status: funded.status, txs, error: funded.error, revertReason: funded.revertReason };
  }
  const deposit = await broadcast(chain, user, "refill-deposit", floor("USER_FLOOR_WEI"), {
    to: vault,
    data: encodeCall(vaultAbi, "deposit"),
    value: amount,
    gas,
  });
  txs.push(txOf(deposit));
  if (deposit.status !== "confirmed") {
    return { status: deposit.status === "failed" ? "failed" : "reverted", txs, error: deposit.error, revertReason: deposit.revertReason };
  }
  return { status: "confirmed", txs };
}

async function fundUser(
  chain: ChainRuntime,
  to: Address,
  value: bigint,
): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const donors: Array<{ key: string; label: "ATTACKER_FUNDER_PRIVATE_KEY" | "VAULT_ADMIN_PRIVATE_KEY"; floor: "ATTACKER_FUNDER_FLOOR_WEI" | "VAULT_ADMIN_FLOOR_WEI" }> = [
    { key: env.ATTACKER_FUNDER_PRIVATE_KEY, label: "ATTACKER_FUNDER_PRIVATE_KEY", floor: "ATTACKER_FUNDER_FLOOR_WEI" },
    { key: env.VAULT_ADMIN_PRIVATE_KEY, label: "VAULT_ADMIN_PRIVATE_KEY", floor: "VAULT_ADMIN_FLOOR_WEI" },
  ];
  let last = "neither the funder nor the deployer can cover the user deposit";
  for (const donor of donors) {
    if (!donor.key) continue;
    try {
      const sent = await broadcast(chain, signer(chain, namedKey(donor.key, donor.label)), "refill-fund-user", floor(donor.floor), {
        to,
        value,
        gas: 21_000n,
      });
      return {
        status: sent.status === "failed" ? "failed" : sent.status,
        txs: [txOf(sent)],
        error: sent.error,
        revertReason: sent.revertReason,
      };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new HttpError(last, 400);
}

async function resetVault(chain: ChainRuntime): Promise<{ status: DemoOutcome; txs: DemoTx[]; error?: string; revertReason?: string }> {
  const vault = requireAddress(chain.deployment.vault, "vault");
  const admin = signer(chain, namedKey(env.VAULT_ADMIN_PRIVATE_KEY, "VAULT_ADMIN_PRIVATE_KEY"));
  const sent = await broadcast(chain, admin, "reset", floor("VAULT_ADMIN_FLOOR_WEI"), {
    to: vault,
    data: encodeCall(vaultAbi, "unpause"),
  });
  if (sent.status === "confirmed") {
    await prisma.protocol.updateMany({ where: { chainId: chain.id, vaultAddress: vault }, data: { status: "protected" } });
    live("protocol:updated", { chainId: chain.id, vault, status: "protected" });
  }
  return settled([sent]);
}

export async function demoStatus(chainId: number): Promise<DemoProgress> {
  const chain = chainById(chainId);
  if (!chain) throw new HttpError("chainId must be 56 or 8453", 400);
  return demoProgress(chain);
}

async function demoProgress(chain: ChainRuntime): Promise<DemoProgress> {
  const client = chain.http();
  const balances: Record<string, { address: string; balanceWei: string }> = {};
  const entries: Array<[string, string | undefined]> = [
    ["admin", keyAddress(env.VAULT_ADMIN_PRIVATE_KEY)],
    ["user", keyAddress(env.USER_PRIVATE_KEY)],
    ["funder", keyAddress(env.ATTACKER_FUNDER_PRIVATE_KEY)],
  ];
  const blockNumber = await client.getBlockNumber();
  const fresh = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "fresh" } } });
  const attacker = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "attacker" } } });
  for (const [name, address] of entries) {
    if (!address) continue;
    const account = getAddress(address);
    const balance = await client.getBalance({ address: account, blockNumber });
    balances[name] = { address: account, balanceWei: balance.toString() };
  }
  let vault: DemoProgress["vault"] = null;
  let allowlisted = false;
  if (isSet(chain.deployment.vault)) {
    const balance = await liveVaultWei(chain, chain.deployment.vault, true);
    const paused = await readContractValue<boolean>(client, chain.deployment.vault, vaultAbi, "paused");
    vault = { address: chain.deployment.vault, balanceWei: balance.toString(), paused };
    if (fresh) {
      allowlisted = await readContractValue<boolean>(client, chain.deployment.vault, vaultAbi, "demoAllowlist", [getAddress(fresh.address)]);
    }
  }
  const freshWallet = fresh ? await walletBalance(client, fresh.address, blockNumber) : null;
  const attackerContract = attacker ? await walletBalance(client, attacker.address, blockNumber) : null;
  if (freshWallet) balances.fresh = freshWallet;
  if (attackerContract) balances.attacker = attackerContract;
  const archived = await prisma.demoWallet.findMany({
    where: { chainId: chain.id, role: { startsWith: "archived:" } },
    orderBy: { createdAt: "asc" },
  });
  const facts: DemoFacts = {
    freshWallet: freshWallet?.address ?? null,
    attackerContract: attackerContract?.address ?? null,
    vaultBalance: vault?.balanceWei ?? null,
    allowlisted,
    revertReason: null,
    paused: vault?.paused ?? null,
  };
  const actions = await restoredActions(chain, facts, freshWallet);
  return {
    chainId: chain.id,
    step: stepFrom(actions, facts, freshWallet ? BigInt(freshWallet.balanceWei) : 0n),
    freshWallet,
    attackerContract,
    allowlisted,
    native: chain.native,
    vault,
    balances,
    previous: archivedPairs(archived),
    actions,
  };
}

function stepFrom(actions: DemoConfirmation[], facts: DemoFacts, balanceWei: bigint): DemoStep | null {
  const reached = (action: string) => actions.some((item) => item.action === action && item.status !== "failed");
  if (reached("strike")) return "struck";
  if (reached("probe")) return "probed";
  if (facts.attackerContract) return "deployed";
  if (facts.allowlisted) return "allowlisted";
  if (facts.freshWallet && balanceWei > 0n) return "funded";
  return null;
}

async function restoredActions(chain: ChainRuntime, facts: DemoFacts, freshWallet: { address: string; balanceWei: string } | null) {
  if (!facts.freshWallet) {
    remembered.delete(chain.id);
    return [];
  }
  const saved = remembered.get(chain.id);
  const actions: DemoConfirmation[] = [];
  const keep = (action: string) => {
    const found = saved?.get(action);
    if (!found || (found.status === "reverted" && isOpaqueRevert(found.result.revertReason))) return false;
    actions.push(found);
    return true;
  };
  if (facts.freshWallet && freshWallet && BigInt(freshWallet.balanceWei) > 0n && !keep("fund-fresh-wallet")) {
    const detail = `${trimAmount(formatEther(BigInt(freshWallet.balanceWei)))} ${chain.native}`;
    actions.push(confirmation(chain.id, "fund-fresh-wallet", LABELS["fund-fresh-wallet"], "confirmed", [], facts, undefined, outcomeLine("fund-fresh-wallet", "confirmed", facts, undefined, detail)));
  }
  if (facts.allowlisted && !keep("allowlist-fresh-wallet")) {
    actions.push(confirmation(chain.id, "allowlist-fresh-wallet", LABELS["allowlist-fresh-wallet"], "confirmed", [], facts, undefined, "Allowlisted ✓"));
  }
  if (facts.attackerContract && !keep("deploy-attacker")) {
    actions.push(confirmation(chain.id, "deploy-attacker", LABELS["deploy-attacker"], "confirmed", [], facts, undefined, `Attacker ${shortAddr(facts.attackerContract)}`));
  }
  for (const action of ["probe", "strike", "control-withdraw", "reset", "recycle", "refill-vault"]) {
    if (keep(action) || !facts.freshWallet) continue;
    const log = await prisma.spendLog.findFirst({
      where: { chainId: chain.id, wallet: getAddress(facts.freshWallet), action: action === "control-withdraw" ? "control-withdraw" : action },
      orderBy: { at: "desc" },
    });
    if (!log) continue;
    const receipt = await chain.http().getTransactionReceipt({ hash: log.txHash as Hex }).catch(() => null);
    const status: DemoOutcome = receipt?.status === "reverted" ? "reverted" : "confirmed";
    const traced = status === "reverted" ? await revertFromTrace(chain, log.txHash as Hex) : null;
    const result = { ...facts, revertReason: traced ?? (status === "reverted" ? "reverted" : null) };
    const tx: DemoTx = {
      label: action,
      hash: log.txHash,
      explorerUrl: explorerTx(chain, log.txHash),
      gasCostNative: formatEther(BigInt(log.costWei)),
      status,
    };
    actions.push(confirmation(chain.id, action, LABELS[action] ?? action, status, [tx], result));
  }
  return actions;
}

function archivedPairs(rows: { role: string; address: string; createdAt: Date }[]) {
  const freshes = rows.filter((row) => row.role.startsWith("archived:fresh:"));
  const attackers = rows.filter((row) => row.role.startsWith("archived:attacker:"));
  const used = new Set<number>();
  const pairs = freshes.map((fresh, index) => {
    const next = freshes[index + 1]?.createdAt.getTime() ?? Number.POSITIVE_INFINITY;
    const attackerIndex = attackers.findIndex(
      (row, attackerRow) =>
        !used.has(attackerRow) && row.createdAt.getTime() >= fresh.createdAt.getTime() && row.createdAt.getTime() < next,
    );
    if (attackerIndex !== -1) used.add(attackerIndex);
    const attacker = attackerIndex === -1 ? null : attackers[attackerIndex];
    return {
      fresh: { address: getAddress(fresh.address) },
      attacker: attacker ? { address: getAddress(attacker.address) } : null,
    };
  });
  return pairs.reverse();
}

async function walletBalance(
  client: { getBlockNumber: () => Promise<bigint>; getBalance: (args: { address: Address; blockNumber?: bigint }) => Promise<bigint> },
  address: string,
  blockNumber?: bigint,
) {
  const checksum = getAddress(address);
  const block = blockNumber ?? (await client.getBlockNumber());
  const balance = await client.getBalance({ address: checksum, blockNumber: block });
  return { address: checksum, balanceWei: balance.toString() };
}

export async function archiveCurrentPair(chainId: number): Promise<void> {
  const rows = await prisma.demoWallet.findMany({
    where: { chainId, role: { in: ["fresh", "attacker"] } },
  });
  for (const row of rows) {
    await prisma.demoWallet.update({
      where: { id: row.id },
      data: { role: `archived:${row.role}:${row.id}` },
    });
  }
}

interface Mined {
  label: string;
  hash: string;
  explorerUrl: string;
  gasCostNative: string;
  costWei: string;
  status: DemoOutcome;
  revertReason?: string;
  error?: string;
  receipt?: TransactionReceipt;
}

async function broadcast(
  chain: ChainRuntime,
  account: PrivateKeyAccount,
  label: string,
  minRemainder: bigint,
  tx: { to?: Address; data?: Hex; value?: bigint; gas?: bigint },
): Promise<Mined> {
  const value = tx.value ?? 0n;
  const client = chain.http();
  const balance = await client.getBalance({ address: account.address });
  const gasPrice = await client.getGasPrice();
  const gas = tx.gas ?? 500_000n;
  const fee = gas * gasPrice;
  if (balance < value + fee) {
    throw new HttpError(
      `${label} refused: ${account.address} has ${formatEther(balance)} ${chain.native}, which is below ${formatEther(value)} ${chain.native} plus ${formatEther(fee)} ${chain.native} gas`,
      400,
    );
  }
  const reserve = fee + value;
  if (balance < minRemainder + reserve) {
    throw new HttpError(`${account.address} would drop below its floor for ${label}`, 400);
  }
  const wallet = createWalletClient({
    account,
    chain: chain.viem,
    transport: http(chain.rpcUrl, {
      fetchOptions: { headers: env.NOWNODES_API_KEY ? { "api-key": env.NOWNODES_API_KEY } : undefined },
    }),
  });
  const hash = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value,
    gas,
    chain: chain.viem,
  });
  let receipt: TransactionReceipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch (error) {
    const timedOut = error instanceof Error && /timeout|timed out/i.test(error.message);
    return {
      label,
      hash,
      explorerUrl: explorerTx(chain, hash),
      gasCostNative: "0",
      costWei: "0",
      status: "failed",
      error: timedOut ? "Timed out after 60s waiting for the receipt" : error instanceof Error ? error.message : "Receipt wait failed",
    };
  }
  const cost = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  await prisma.spendLog.create({
    data: {
      chainId: chain.id,
      wallet: account.address,
      action: label,
      gasUsed: receipt.gasUsed.toString(),
      costWei: cost.toString(),
      txHash: hash,
    },
  });
  const reverted = receipt.status === "reverted";
  const revertReason = reverted ? await reasonFor(chain, account.address, tx.to, tx.data, value, hash) : undefined;
  return {
    label,
    hash,
    explorerUrl: explorerTx(chain, hash),
    gasCostNative: formatEther(cost),
    costWei: cost.toString(),
    status: reverted ? "reverted" : "confirmed",
    revertReason,
    receipt,
  };
}

async function reasonFor(
  chain: ChainRuntime,
  from: Address,
  to: Address | undefined,
  data: Hex | undefined,
  value: bigint,
  hash: Hex,
): Promise<string> {
  let message = "reverted";
  try {
    await chain.http().call({ account: from, to, data, value });
  } catch (error) {
    message = error && typeof error === "object" && "shortMessage" in error && typeof error.shortMessage === "string"
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : "reverted";
    const named = reasonName(message);
    if (!isOpaqueRevert(message) && !isOpaqueRevert(named)) return named;
  }
  return (await revertFromTrace(chain, hash)) ?? reasonName(message);
}

function signer(chain: ChainRuntime, key: Hex): PrivateKeyAccount {
  void chain;
  return privateKeyToAccount(key);
}

async function freshSigner(chain: ChainRuntime): Promise<PrivateKeyAccount> {
  const row = await prisma.demoWallet.findUnique({ where: { chainId_role: { chainId: chain.id, role: "fresh" } } });
  if (!row?.ciphertext) throw new HttpError("Fund a fresh wallet first", 400);
  return privateKeyToAccount(decryptKey(row.ciphertext));
}

async function mixerDenom(chain: ChainRuntime): Promise<bigint> {
  const mixer = requireAddress(chain.deployment.mixer, "mixer");
  return readContractValue<bigint>(chain.http(), mixer, mixerAbi, "denom");
}

function floor(name: "VAULT_ADMIN_FLOOR_WEI" | "USER_FLOOR_WEI" | "ATTACKER_FUNDER_FLOOR_WEI" | "FRESH_WALLET_FLOOR_WEI"): bigint {
  return BigInt(env[name]);
}

function attackerBytecode(): Hex {
  const file = join(repoRoot(), "src/shared/bytecode/Attacker.json");
  if (!existsSync(file)) {
    throw new HttpError("src/shared/bytecode/Attacker.json is missing. The contracts repo sync has not delivered the Attacker bytecode.", 400);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { bytecode?: string };
  if (!parsed.bytecode || !parsed.bytecode.startsWith("0x") || parsed.bytecode.length < 10) {
    throw new HttpError("src/shared/bytecode/Attacker.json has no bytecode. Deploy waits for the contracts repo sync.", 400);
  }
  return parsed.bytecode as Hex;
}

function requireAddress(address: string | null, label: string): Address {
  if (!isSet(address)) throw new HttpError(`Set ${label} in src/shared/deployments before this action`, 400);
  return address;
}

function keyAddress(value: string): string | undefined {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) && !/^[0-9a-fA-F]{64}$/.test(value)) return undefined;
  try {
    return privateKeyToAccount(namedKey(value, "key")).address;
  } catch {
    return undefined;
  }
}

