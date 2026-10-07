import { encodePacked, keccak256, type Hex } from "viem";

/** keccak256(abi.encodePacked(uint256 chainId, bytes32 txHash)) */
export function incidentId(chainId: number, txHash: Hex): Hex {
  return keccak256(encodePacked(["uint256", "bytes32"], [BigInt(chainId), txHash]));
}
