import { encodeAbiParameters, type Hex } from "viem";

export const pauseReportTypes = [
  { type: "address" },
  { type: "uint16" },
  { type: "bytes32" },
] as const;

/** Matches Guardian._processReport: abi.encode(address, uint16, bytes32). */
export function encodePauseReport(protocol: Hex, probability: number, alertId: Hex): Hex {
  if (probability < 0 || probability > 100 || !Number.isInteger(probability)) {
    throw new Error("Probability must be an integer from 0 to 100");
  }
  return encodeAbiParameters(pauseReportTypes, [protocol, probability, alertId]);
}
