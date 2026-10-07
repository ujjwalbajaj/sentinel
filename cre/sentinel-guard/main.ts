import {
  decodeJson,
  handler,
  HTTPCapability,
  Runner,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import { parseEvidence } from "./evidence";
import { writePause } from "./report";
import type { Config } from "./types";
import { buildVerdict } from "./verdict";

export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  let body: unknown;
  try {
    body = decodeJson(payload.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    runtime.log(`Rejected evidence: ${message}`);
    return JSON.stringify({ action: "rejected" });
  }

  const evidence = parseEvidence(body, (message) => runtime.log(message));
  if (!evidence) {
    return JSON.stringify({ action: "rejected" });
  }

  const verdict = buildVerdict(evidence, runtime.config.pauseThreshold);
  runtime.log(`SENTINEL_VERDICT ${JSON.stringify(verdict)}`);

  if (verdict.score < runtime.config.pauseThreshold) {
    runtime.log("NO_PAUSE");
    return JSON.stringify({ incidentId: evidence.incidentId, score: verdict.score, action: "none" });
  }

  const txHash = writePause(runtime, runtime.config, evidence, verdict.score);
  return JSON.stringify({ incidentId: evidence.incidentId, score: verdict.score, action: "pause", txHash });
};

export const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  const trigger = config.requireAuth
    ? http.trigger({
        authorizedKeys: [
          {
            type: "KEY_TYPE_ECDSA_EVM",
            publicKey: config.authorizedEVMAddress,
          },
        ],
      })
    : http.trigger({});

  return [handler(trigger, onHttpTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
