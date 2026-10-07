import { createHash, randomUUID } from "node:crypto";
import { hexToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base64Url, canonicalJson } from "./canonical.js";

export interface SignedTrigger {
  body: string;
  token: string;
  message: string;
  signature: Hex;
  digest: string;
}

/// CRE HTTP trigger JWT.
/// https://docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/triggering-deployed-workflows
export async function signWorkflowRequest(privateKey: Hex, input: unknown, workflowId: string): Promise<SignedTrigger> {
  const bodyObject = {
    id: randomUUID(),
    jsonrpc: "2.0" as const,
    method: "workflows.execute" as const,
    params: {
      input,
      workflow: { workflowID: workflowId.replace(/^0x/, "") },
    },
  };
  const body = canonicalJson(bodyObject);
  const digest = `0x${createHash("sha256").update(body).digest("hex")}`;
  const account = privateKeyToAccount(privateKey);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(Buffer.from(JSON.stringify({ alg: "ETH", typ: "JWT" })));
  const payload = base64Url(
    Buffer.from(
      JSON.stringify({
        digest,
        iss: account.address,
        iat: now,
        exp: now + 5 * 60,
        jti: randomUUID(),
      }),
    ),
  );
  const message = `${header}.${payload}`;
  const signature = await account.signMessage({ message });
  const bytes = new Uint8Array(hexToBytes(signature));
  if (bytes[64] >= 27) bytes[64] -= 27;
  return {
    body,
    token: `${message}.${base64Url(bytes)}`,
    message,
    signature,
    digest,
  };
}

export async function triggerWorkflow(options: {
  gatewayUrl: string;
  workflowId: string;
  privateKey: Hex;
  input: unknown;
}): Promise<unknown> {
  const signed = await signWorkflowRequest(options.privateKey, options.input, options.workflowId);
  const response = await fetch(options.gatewayUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${signed.token}`,
    },
    body: signed.body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CRE gateway responded ${response.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}
