import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex, type PublicClient } from "viem";

export function encodeCall(abi: Abi, functionName: string, args: readonly unknown[] = []): Hex {
  return encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
}

export async function readContractValue<T>(
  client: PublicClient,
  address: Hex,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  const data = encodeCall(abi, functionName, args);
  const result = await client.call({ to: address, data });
  return decodeFunctionResult({
    abi,
    functionName,
    data: result.data ?? "0x",
  } as Parameters<typeof decodeFunctionResult>[0]) as T;
}
