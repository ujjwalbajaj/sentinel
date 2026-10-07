import { z } from "zod";

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte hex address");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hex value");

/** Same strict object as sentinel-guard/evidence.ts. Extra keys are rejected. */
export const creEvidenceSchema = z
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

export type CreEvidence = z.infer<typeof creEvidenceSchema>;

export function creChainKey(chainId: number): "bsc" | "base" {
  if (chainId === 56) return "bsc";
  if (chainId === 8453) return "base";
  throw new Error(`Chain ${chainId} has no CRE chain key. Expected 56 or 8453.`);
}

export function creEvidenceIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function crePayload(input: {
  incidentId: string;
  chainId: number;
  vault: string;
  suspectTxHash: string;
  attacker: string;
  features: {
    walletAgeSeconds: number | null;
    mixerFunded: boolean;
    reentrancyDetected: boolean;
    vaultBalanceDeltaBps: number;
    flashLoanEntry: boolean;
    newContractTarget: boolean;
  };
}): CreEvidence {
  return {
    incidentId: input.incidentId as CreEvidence["incidentId"],
    chain: creChainKey(input.chainId),
    vault: input.vault as CreEvidence["vault"],
    suspectTxHash: input.suspectTxHash as CreEvidence["suspectTxHash"],
    attacker: input.attacker as CreEvidence["attacker"],
    features: {
      walletAgeSeconds: input.features.walletAgeSeconds,
      mixerFunded: input.features.mixerFunded,
      reentrancyDetected: input.features.reentrancyDetected,
      vaultBalanceDeltaBps: input.features.vaultBalanceDeltaBps,
      flashLoanEntry: input.features.flashLoanEntry,
      newContractTarget: input.features.newContractTarget,
    },
  };
}
