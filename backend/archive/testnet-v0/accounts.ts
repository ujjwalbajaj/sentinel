import { decodeAbiParameters, toFunctionSelector, type Hex } from "viem";
import type { RpcTx } from "./nownodes.js";
import { isMixerAddress, type Rulebook } from "../cre/sentinel-workflow/score.js";

const FUND = toFunctionSelector("fund(address)");

export interface Deployment {
  deployer: Hex;
  at: number;
  nonce: number;
}

export class AccountBook {
  readonly firstSeen = new Map<string, number>();
  readonly funder = new Map<string, Hex>();
  readonly deployments = new Map<string, Deployment>();

  observe(tx: RpcTx, timestamp: number, rulebook: Rulebook): void {
    this.mark(tx.from, timestamp);
    if (tx.to) this.mark(tx.to, timestamp);

    if (tx.to && tx.value > 0n && !this.funder.has(tx.to.toLowerCase())) {
      this.funder.set(tx.to.toLowerCase(), tx.from);
    }

    if (tx.to && isMixerAddress(tx.to, rulebook) && tx.input.toLowerCase().startsWith(FUND)) {
      try {
        const [recipient] = decodeAbiParameters([{ type: "address" }], `0x${tx.input.slice(10)}` as Hex);
        this.funder.set(recipient.toLowerCase(), tx.to);
        this.mark(recipient, timestamp);
      } catch {
        // Not a fund() payload. Ignore.
      }
    }
  }

  noteDeployment(contract: Hex, deployer: Hex, timestamp: number, nonce: number): void {
    this.deployments.set(contract.toLowerCase(), { deployer, at: timestamp, nonce });
    this.mark(contract, timestamp);
    this.mark(deployer, timestamp);
  }

  deployment(address: Hex): Deployment | undefined {
    return this.deployments.get(address.toLowerCase());
  }

  fundingSource(address: Hex): Hex | undefined {
    return this.funder.get(address.toLowerCase());
  }

  ageSeconds(address: Hex, now: number): number | null {
    const seen = this.firstSeen.get(address.toLowerCase());
    if (seen === undefined) return null;
    return Math.max(0, now - seen);
  }

  private mark(address: string, timestamp: number): void {
    const key = address.toLowerCase();
    if (!this.firstSeen.has(key)) this.firstSeen.set(key, timestamp);
  }
}
