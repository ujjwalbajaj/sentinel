import { getContractAddress, keccak256, toBytes, type Hex } from "viem";
import { analyze, extractSelectors, truncateTrace, valueLeftVault, type CallFrame, type StateDiff } from "./analyze.js";
import { AccountBook } from "./accounts.js";
import type { ChainConfig } from "./chains.js";
import { getBalance, getCode, traceCall, type RpcClient, type RpcTx } from "./nownodes.js";
import { assess, isMixerAddress, type Rulebook, type Verdict } from "../cre/sentinel-workflow/score.js";

export interface Protocol {
  name: string;
  chainId: number;
  chainLabel: string;
  chainSelectorName: string;
  vault: Hex;
  guardian: Hex;
  tvlUsd: number;
}

export interface Assessment {
  protocol: Protocol;
  tx: RpcTx;
  attacker: Hex;
  contractAddress: Hex;
  verdict: Verdict;
  trace: CallFrame;
  alertId: Hex;
  walletAgeSeconds: number | null;
  fundingSource: Hex | null;
}

const ZERO_SELECTOR = "0x00000000";

export async function assessTransaction(input: {
  chain: ChainConfig;
  rpc: RpcClient;
  tx: RpcTx;
  timestamp: number;
  book: AccountBook;
  protocols: Protocol[];
  rulebook: Rulebook;
}): Promise<Assessment | null> {
  const { tx, book, protocols, rulebook, chain } = input;
  book.observe(tx, input.timestamp, rulebook);

  if (tx.to === null) {
    const contract = getContractAddress({ from: tx.from, nonce: BigInt(tx.nonce) });
    book.noteDeployment(contract, tx.from, input.timestamp, tx.nonce);
    return null;
  }

  const direct = protocols.find((protocol) => protocol.vault.toLowerCase() === tx.to?.toLowerCase());
  const deployment = book.deployment(tx.to);
  if (!direct && !deployment) return null;

  const code = await getCode(input.rpc, tx.to);
  const selectors = extractSelectors(code).filter((selector) => selector !== ZERO_SELECTOR);
  const candidates = [{ input: tx.input, value: tx.value }, ...selectors.map((selector) => ({ input: selector, value: 0n }))];

  let best: { trace: CallFrame; diff?: StateDiff; drop: bigint; vault: Protocol } | null = null;
  for (const protocol of direct ? [direct] : protocols) {
    for (const candidate of candidates) {
      let trace: CallFrame;
      let diff: StateDiff | undefined;
      try {
        trace = (await traceCall(input.rpc, { from: tx.from, to: tx.to, input: candidate.input, value: candidate.value }, "callTracer")) as CallFrame;
      } catch {
        continue;
      }
      try {
        diff = (await traceCall(input.rpc, { from: tx.from, to: tx.to, input: candidate.input, value: candidate.value }, "prestateTracer")) as StateDiff;
      } catch {
        diff = undefined;
      }
      const touches = direct ? true : traceMentions(trace, protocol.vault);
      if (!touches) continue;
      const drop = diff ? dropOf(diff, protocol.vault) : valueLeftVault(trace, protocol.vault);
      if (!best || drop > best.drop) best = { trace, diff, drop, vault: protocol };
    }
  }
  if (!best) return null;

  const balance = await getBalance(input.rpc, best.vault.vault);
  const findings = analyze({
    trace: best.trace,
    stateDiff: best.diff,
    vault: best.vault.vault,
    vaultBalanceWei: balance > 0n ? balance : best.drop,
    observedWei: tx.value,
    maxTestToDrainRatioBps: rulebook.testBeforeStrike.maxTestToDrainRatioBps,
  });

  const attacker = deployment?.deployer ?? tx.from;
  const fundingSource = book.fundingSource(attacker) ?? book.fundingSource(tx.from) ?? null;
  const verdict = assess(
    {
      protocolName: best.vault.name,
      vaultTvlUsd: best.vault.tvlUsd,
      walletAgeSeconds: book.ageSeconds(attacker, input.timestamp),
      deployerNonce: deployment?.nonce ?? tx.nonce,
      fundedByMixer: isMixerAddress(fundingSource, rulebook),
      flashLoanEntry: findings.flashLoanEntry,
      reentrancy: findings.reentrancy,
      vaultBalanceDropBps: findings.vaultBalanceDropBps,
      testSizedCall: findings.testSizedCall,
    },
    rulebook,
  );

  return {
    protocol: best.vault,
    tx,
    attacker,
    contractAddress: tx.to,
    verdict,
    trace: truncateTrace(best.trace, 8),
    alertId: keccak256(toBytes(`${chain.id}:${tx.hash}`)),
    walletAgeSeconds: book.ageSeconds(attacker, input.timestamp),
    fundingSource,
  };
}

function traceMentions(frame: CallFrame, vault: Hex): boolean {
  if ((frame.to ?? "").toLowerCase() === vault.toLowerCase()) return true;
  return (frame.calls ?? []).some((child) => traceMentions(child, vault));
}

function dropOf(diff: StateDiff, vault: Hex): bigint {
  const key = Object.keys(diff.pre ?? {}).find((candidate) => candidate.toLowerCase() === vault.toLowerCase());
  if (!key || !diff.pre?.[key]?.balance || !diff.post?.[key]?.balance) return 0n;
  const pre = BigInt(diff.pre[key].balance);
  const post = BigInt(diff.post[key].balance);
  return post < pre ? pre - post : 0n;
}
