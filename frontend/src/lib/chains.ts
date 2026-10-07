import { keccak256, toBytes } from "viem";
import type { Chain } from "./types";

export const chainMeta: Record<Chain, { label: string; short: string; explorer: string; chainId: number; symbol: string }> = {
  base: {
    label: "Base",
    short: "Base",
    explorer: "https://basescan.org",
    chainId: 8453,
    symbol: "ETH",
  },
  bsc: {
    label: "BNB Chain",
    short: "BNB",
    explorer: "https://bscscan.com",
    chainId: 56,
    symbol: "BNB",
  },
};

export const CHAINS: Chain[] = ["base", "bsc"];

export function chainFromId(chainId: number): Chain | null {
  if (chainId === 8453) return "base";
  if (chainId === 56) return "bsc";
  return null;
}

export function healthFor(chain: Chain, health: { base: "live" | "down"; bsc: "live" | "down" }) {
  return chain === "bsc" ? health.bsc : health.base;
}

export const PAUSER_ROLE = keccak256(toBytes("PAUSER_ROLE"));

export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO === "true";
export const DEMO_TOKEN = process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "";
