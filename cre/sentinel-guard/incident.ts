import { encodePacked, keccak256 } from "viem";

/**
 * incidentId = keccak256(abi.encodePacked(uint256 chainId, bytes32 suspectTxHash))
 * Same packing as Guardian's contracts test vector.
 */
export function incidentId(chainId: number | bigint, txHash: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(["uint256", "bytes32"], [BigInt(chainId), txHash]));
}
