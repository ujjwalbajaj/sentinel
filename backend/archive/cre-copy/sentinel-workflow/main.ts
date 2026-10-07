import {
  ConfidentialHTTPClient,
  HTTPCapability,
  Runner,
  decodeJson,
  handler,
  ok,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { Hex } from "viem";
import { submitPause, type PauseConfig } from "./submitPause.js";

type Config = PauseConfig & {
  authorizedEvmAddress: string;
  secretsOwner: string;
  llmUrl: string;
  llmModel: string;
};

type Verdict = {
  probability: number;
  pause: boolean;
  explanation: string;
};

const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  if (payload.input.length === 0) return JSON.stringify({ pause: false, explanation: "Empty trigger payload." });

  const observation = decodeJson<Record<string, unknown>>(payload.input);
  const chainSelectorName = String(observation.chainSelectorName ?? "");
  const vault = String(observation.vault ?? "") as Hex;
  const alertId = String(observation.alertId ?? "") as Hex;
  const verdict = scoreInEnclave(runtime, observation);

  runtime.log(verdict.explanation);
  if (!verdict.pause) {
    return JSON.stringify({ ...verdict, paused: false });
  }

  const txHash = submitPause(runtime, chainSelectorName, vault, verdict.probability, alertId);
  return JSON.stringify({ ...verdict, paused: true, txHash });
};

function scoreInEnclave(runtime: Runtime<Config>, observation: Record<string, unknown>): Verdict {
  const userPrompt = JSON.stringify(observation).replaceAll("{{", "{ {").replaceAll("}}", "} }");
  const bodyString = [
    "{",
    `"model":${JSON.stringify(runtime.config.llmModel)},`,
    `"temperature":0,`,
    `"messages":[`,
    `{"role":"system","content":{{.scoringDocument}}},`,
    `{"role":"user","content":${JSON.stringify(
      "Apply the system document to this observation. " + userPrompt,
    )}}`,
    "]}",
  ].join("");

  const client = new ConfidentialHTTPClient();
  const response = client
    .sendRequest(runtime, {
      request: {
        url: runtime.config.llmUrl,
        method: "POST",
        headers: {
          "Content-Type": { values: ["application/json"] },
          Authorization: { values: ["Bearer {{.llmApiKey}}"] },
        },
        bodyString,
      },
      vaultDonSecrets: [
        { key: "llmApiKey", owner: runtime.config.secretsOwner },
        { key: "scoringDocument", owner: runtime.config.secretsOwner },
      ],
    })
    .result();

  if (!ok(response)) {
    runtime.log("Confidential scoring failed. Leaving the protocol running.");
    return {
      probability: 0,
      pause: false,
      explanation: "Scoring unavailable. Fail closed: protocol left running.",
    };
  }

  const parsed = readVerdict(responseText(response));
  if (!parsed) {
    runtime.log("Confidential scoring returned an unreadable verdict. Leaving the protocol running.");
    return {
      probability: 0,
      pause: false,
      explanation: "Scoring unavailable. Fail closed: protocol left running.",
    };
  }
  return parsed;
}

function responseText(response: unknown): string {
  const body = (response as { body?: unknown }).body;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return JSON.stringify(response);
}

function readVerdict(text: string): Verdict | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      probability?: number;
      pause?: boolean;
      explanation?: string;
    };
    if (typeof parsed.probability !== "number" || typeof parsed.explanation !== "string") return null;
    const probability = Math.max(0, Math.min(100, Math.round(parsed.probability)));
    return {
      probability,
      pause: parsed.pause === true,
      explanation: parsed.explanation,
    };
  } catch {
    return null;
  }
}

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
