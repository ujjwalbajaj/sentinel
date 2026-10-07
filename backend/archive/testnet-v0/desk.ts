import type { CallFrame } from "./analyze.js";
import type { SignalHit } from "../cre/sentinel-workflow/score.js";

export interface ProtocolView {
  name: string;
  chainId: number;
  chainLabel: string;
  vault: string;
  guardian: string;
  tvlUsd: number;
}

export interface DeskEvent {
  id: string;
  clock: string;
  createdAt: string;
  chainId: number;
  chainLabel: string;
  protocolName: string;
  vault: string;
  guardian: string;
  kind: "simulation" | "pause" | "reverted" | "watch";
  title: string;
  body: string;
  probability?: number;
  explanation?: string;
  signals?: SignalHit[];
  drainedUsd?: number;
  drainBps?: number;
  trace?: CallFrame;
  calldata?: string;
  txHash?: string;
}

export interface DeskState {
  mode: "tabletop" | "live";
  protocols: ProtocolView[];
  events: DeskEvent[];
}

export class Desk {
  private protocols: ProtocolView[] = [];
  private events: DeskEvent[] = [];
  private listeners = new Set<(event: DeskEvent) => void>();
  mode: DeskState["mode"] = "tabletop";

  reset(mode: DeskState["mode"]): void {
    this.mode = mode;
    this.events = [];
    this.protocols = [];
  }

  addProtocol(protocol: ProtocolView): void {
    const exists = this.protocols.some(
      (item) => item.chainId === protocol.chainId && item.vault.toLowerCase() === protocol.vault.toLowerCase(),
    );
    if (!exists) this.protocols.push(protocol);
  }

  push(event: DeskEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  snapshot(): DeskState {
    return {
      mode: this.mode,
      protocols: this.protocols,
      events: this.events,
    };
  }

  subscribe(listener: (event: DeskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
