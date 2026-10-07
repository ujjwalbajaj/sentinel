"use client";

import { useQuery } from "@tanstack/react-query";
import { formatEther, isAddress } from "viem";
import { usePublicClient } from "wagmi";
import { vaultAbi } from "@/lib/abi";
import { chainMeta, PAUSER_ROLE } from "@/lib/chains";
import type { Chain } from "@/lib/types";

export function useVaultReads(chain: Chain, vault?: string, guardian?: string) {
  const client = usePublicClient({ chainId: chainMeta[chain].chainId });
  return useQuery({
    queryKey: ["vault-reads", chain, vault, guardian],
    enabled: Boolean(client && vault && isAddress(vault)),
    queryFn: async () => {
      if (!client || !vault || !isAddress(vault)) return null;
      const address = vault as `0x${string}`;
      const [paused, balance, granted] = await Promise.all([
        client.readContract({ address, abi: vaultAbi, functionName: "paused" }).catch(() => null),
        client.getBalance({ address }).catch(() => null),
        guardian && isAddress(guardian)
          ? client
              .readContract({
                address,
                abi: vaultAbi,
                functionName: "hasRole",
                args: [PAUSER_ROLE, guardian as `0x${string}`],
              })
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      return {
        paused: paused as boolean | null,
        balance: balance == null ? null : formatEther(balance),
        pauserGranted: granted as boolean | null,
        symbol: chainMeta[chain].symbol,
      };
    },
  });
}
