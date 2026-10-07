import {
  HTTPCapability,
  Runner,
  decodeJson,
  handler,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { Hex } from "viem";
import { assess, parseRulebook, type Observation, type Rulebook } from "./score.js";
import { submitPause, type PauseConfig } from "./submitPause.js";

type StagingInput = Observation & {
  chainSelectorName: string;
  vault: Hex;
  alertId: Hex;
};

type Config = PauseConfig & {
  authorizedEvmAddress: string;
  broadcast: boolean;
  rulebook: Rulebook;
};

const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const input = decodeJson<StagingInput>(payload.input);
  const verdict = assess(input, parseRulebook(runtime.config.rulebook));
  runtime.log(verdict.explanation);

  let txHash = "";
  if (verdict.pause && runtime.config.broadcast) {
    txHash = submitPause(
      runtime,
      input.chainSelectorName,
      input.vault,
      verdict.probability,
      input.alertId,
    );
  }

  return JSON.stringify({
    probability: verdict.probability,
    pause: verdict.pause,
    explanation: verdict.explanation,
    txHash,
  });
};

const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  const authorized =
    config.authorizedEvmAddress && !/^0x0{40}$/i.test(config.authorizedEvmAddress)
      ? [{ type: "KEY_TYPE_ECDSA_EVM" as const, publicKey: config.authorizedEvmAddress }]
      : [];

  return [
    handler(
      http.trigger(authorized.length > 0 ? { authorizedKeys: authorized } : {}),
      onHttpTrigger,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
