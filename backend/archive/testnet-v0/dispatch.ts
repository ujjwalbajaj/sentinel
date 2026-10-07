import type { Hex } from "viem";
import type { Assessment } from "./assessTx.js";
import { triggerWorkflow } from "./creTrigger.js";

export interface PauseDispatch {
  mode: "cre" | "prepared";
  detail: string;
}

export async function dispatchPause(assessment: Assessment): Promise<PauseDispatch> {
  const workflowId = process.env.CRE_WORKFLOW_ID;
  const triggerKey = process.env.CRE_TRIGGER_PRIVATE_KEY as Hex | undefined;
  if (workflowId && triggerKey) {
    const gateway = process.env.CRE_GATEWAY_URL ?? "https://01.gateway.zone-a.cre.chain.link";
    const result = await triggerWorkflow({
      gatewayUrl: gateway,
      workflowId,
      privateKey: triggerKey,
      input: {
        chainSelectorName: assessment.protocol.chainSelectorName,
        vault: assessment.protocol.vault,
        alertId: assessment.alertId,
        tvlUsd: assessment.protocol.tvlUsd,
        walletAgeSeconds: assessment.walletAgeSeconds,
        deployerNonce: assessment.tx.nonce,
        fundingSource: assessment.fundingSource,
        observedValueWei: assessment.tx.value.toString(),
        trace: assessment.trace,
      },
    });
    return { mode: "cre", detail: `CRE accepted the pause workflow: ${JSON.stringify(result)}` };
  }

  return {
    mode: "prepared",
    detail: "Pause report is ready. Set CRE_WORKFLOW_ID to submit it through Chainlink CRE.",
  };
}
