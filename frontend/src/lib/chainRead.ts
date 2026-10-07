import { createPublicClient, isAddress } from "viem";
import type { Chain } from "./types";
import { sentinelTransport, viemChain } from "./rpc";

const clients = {
  base: createPublicClient({ chain: viemChain.base, transport: sentinelTransport("base") }),
  bsc: createPublicClient({ chain: viemChain.bsc, transport: sentinelTransport("bsc") }),
} as const;

export type BytecodeStatus =
  | { status: "contract" }
  | { status: "invalid"; message: string }
  | { status: "not-contract"; message: string }
  | { status: "rpc-down"; message: string };

export async function checkBytecode(chain: Chain, address: string): Promise<BytecodeStatus> {
  if (!isAddress(address)) {
    return { status: "invalid", message: "Enter a valid 0x address (20 bytes)." };
  }
  try {
    const code = await clients[chain].getBytecode({ address });
    if (!code || code === "0x") {
      return { status: "not-contract", message: "No contract code at this address on the selected chain." };
    }
    return { status: "contract" };
  } catch {
    return { status: "rpc-down", message: "RPC did not respond. Retry the bytecode check." };
  }
}
