import { formatEther, getAddress, type Hex } from "viem";
import type { ChainRuntime } from "./config/chains.js";
import { readContractValue } from "./shared/call.js";
import { vaultAbi } from "./shared/load-abi.js";

const cache = new Map<string, { wei: bigint; at: number }>();
const TTL_MS = 10_000;

export async function liveVaultWei(chain: ChainRuntime, vault: Hex, fresh = false): Promise<bigint> {
  const address = getAddress(vault);
  const key = `${chain.id}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.wei;
  const wei = await readContractValue<bigint>(chain.http(), address, vaultAbi, "vaultBalance");
  cache.set(key, { wei, at: Date.now() });
  return wei;
}

export function formatNativeAmount(wei: bigint): string {
  const text = formatEther(wei);
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "") || "0";
}
