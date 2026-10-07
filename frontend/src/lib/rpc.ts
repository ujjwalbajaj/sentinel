import { custom, type Chain as ViemChain } from "viem";
import { base, bsc } from "viem/chains";

export type RpcSlug = "base" | "bsc";

const publicRpc: Record<RpcSlug, string> = {
  base: "https://mainnet.base.org",
  bsc: "https://bsc-dataseed.bnbchain.org",
};

export function rpcUrl(slug: RpcSlug) {
  const override = slug === "base" ? process.env.NEXT_PUBLIC_BASE_RPC : process.env.NEXT_PUBLIC_BSC_RPC;
  return override || publicRpc[slug];
}

export function sentinelTransport(slug: RpcSlug) {
  return custom({
    async request({ method, params }) {
      const response = await fetch(rpcUrl(slug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message || "RPC error");
      return json.result;
    },
  });
}

export const viemChain: Record<RpcSlug, ViemChain> = { base, bsc };
