import { z } from "zod";
import type { Evidence } from "./types";

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte hex address");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hex value");

export const evidenceSchema = z
  .object({
    incidentId: bytes32,
    chain: z.enum(["bsc", "base"]),
    vault: hexAddress,
    suspectTxHash: bytes32,
    attacker: hexAddress,
    features: z
      .object({
        walletAgeSeconds: z.number().int().nonnegative().nullable(),
        mixerFunded: z.boolean(),
        reentrancyDetected: z.boolean(),
        vaultBalanceDeltaBps: z.number().int(),
        flashLoanEntry: z.boolean(),
        newContractTarget: z.boolean(),
      })
      .strict(),
  })
  .strict();

/**
 * Parses the HTTP body. A malformed payload is logged and dropped.
 * Callers must not build or write a report when this returns undefined.
 */
export function parseEvidence(input: unknown, log: (message: string) => void): Evidence | undefined {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    log(`Rejected evidence: ${details}`);
    return undefined;
  }
  return parsed.data as Evidence;
}
