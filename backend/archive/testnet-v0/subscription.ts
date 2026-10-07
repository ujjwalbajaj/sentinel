import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";
import type { RpcClient } from "./nownodes.js";

export const coveredAbi = [
  {
    type: "function",
    name: "covered",
    stateMutability: "view",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function coveredCalldata(vault: Address): Hex {
  return encodeFunctionData({ abi: coveredAbi, functionName: "covered", args: [vault] });
}

export function decodeCovered(data: Hex): boolean {
  if (!data || data === "0x" || data.length < 66) return false;
  return decodeFunctionResult({ abi: coveredAbi, functionName: "covered", data });
}

/** A missing registry means the watcher still pauses. Set the env when billing is on. */
export function registryForChain(chainId: number): Address | undefined {
  const raw = chainId === 84532 ? process.env.SUBSCRIPTION_BASE : process.env.SUBSCRIPTION_BNB;
  if (!raw || raw === "0x0000000000000000000000000000000000000000") return undefined;
  return raw as Address;
}

export async function isCovered(rpc: RpcClient, registry: Address | undefined, vault: Address): Promise<boolean> {
  if (!registry) return true;
  const data = await rpc.call<Hex>("eth_call", [{ to: registry, data: coveredCalldata(vault) }, "latest"]);
  return decodeCovered(data);
}
