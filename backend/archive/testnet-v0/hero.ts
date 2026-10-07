import { keccak256, toBytes, toFunctionSelector, toHex, type Hex } from "viem";
import { analyze, type CallFrame, type StateDiff } from "./analyze.js";
import type { ChainConfig } from "./chains.js";
import { isMixerAddress, type Observation, type Rulebook } from "../cre/sentinel-workflow/score.js";

export const HERO_TVL_USD = 14_200_000 / 0.38;
export const VAULT: Hex = "0x1111111111111111111111111111111111111111";
export const EXPLOIT: Hex = "0x2222222222222222222222222222222222222222";
export const ATTACKER: Hex = "0x3333333333333333333333333333333333333333";
export const MIXER: Hex = "0x4444444444444444444444444444444444444444";

const ETHER = 10n ** 18n;
const WITHDRAW = toFunctionSelector("withdraw(uint256)");
const STRIKE = toFunctionSelector("strike()");
const PROBE = toFunctionSelector("probe()");

export function heroTrace(): CallFrame {
  return {
    type: "CALL",
    from: ATTACKER,
    to: EXPLOIT,
    input: STRIKE,
    calls: [nestedWithdraw(38)],
  };
}

function nestedWithdraw(remaining: number): CallFrame {
  return {
    type: "CALL",
    from: EXPLOIT,
    to: VAULT,
    input: WITHDRAW,
    calls: [
      {
        type: "CALL",
        from: VAULT,
        to: EXPLOIT,
        value: toHex(ETHER),
        calls: remaining > 1 ? [nestedWithdraw(remaining - 1)] : [],
      },
    ],
  };
}

export function heroStateDiff(): StateDiff {
  return {
    pre: { [VAULT]: { balance: toHex(100n * ETHER) } },
    post: { [VAULT]: { balance: toHex(62n * ETHER) } },
  };
}

export interface HeroObservation extends Observation {
  chainId: number;
  chainSelectorName: string;
  chainLabel: string;
  vault: Hex;
  guardian: Hex;
  attacker: Hex;
  contractAddress: Hex;
  txHash: Hex;
  alertId: Hex;
  fundingSource: Hex;
  trace: CallFrame;
  clock: string;
}

export function buildHeroObservation(chain: ChainConfig, rulebook: Rulebook): HeroObservation {
  const trace = heroTrace();
  const findings = analyze({
    trace,
    stateDiff: heroStateDiff(),
    vault: VAULT,
    vaultBalanceWei: 100n * ETHER,
    observedWei: 0n,
    maxTestToDrainRatioBps: rulebook.testBeforeStrike.maxTestToDrainRatioBps,
  });
  const txHash = keccak256(toBytes(`sentinel-test:${chain.id}`));
  return {
    protocolName: "VaultX",
    vaultTvlUsd: HERO_TVL_USD,
    walletAgeSeconds: 19 * 60,
    deployerNonce: 1,
    fundedByMixer: isMixerAddress(MIXER, rulebook),
    flashLoanEntry: findings.flashLoanEntry,
    reentrancy: findings.reentrancy,
    vaultBalanceDropBps: findings.vaultBalanceDropBps,
    testSizedCall: findings.testSizedCall,
    chainId: chain.id,
    chainSelectorName: chain.selectorName,
    chainLabel: chain.label,
    vault: VAULT,
    guardian: chain.key === "bnb" ? "0x5555555555555555555555555555555555555555" : "0x6666666666666666666666666666666666666666",
    attacker: ATTACKER,
    contractAddress: EXPLOIT,
    txHash,
    alertId: keccak256(toBytes(`${chain.id}:${txHash}`)),
    fundingSource: MIXER,
    trace,
    clock: "11:38:02 PM",
  };
}

export const PROBE_SELECTOR = PROBE;
export const STRIKE_SELECTOR = STRIKE;
