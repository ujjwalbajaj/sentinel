import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hexToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config/env.js";
import { creEvidenceIssues, creEvidenceSchema, type CreEvidence } from "./cre/evidence.js";

export type Evidence = CreEvidence;

export function assertEvidence(value: Evidence): void {
  const parsed = creEvidenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Rejected evidence: ${creEvidenceIssues(parsed.error)}`);
  }
}

export function creRepoPath(): string {
  if (!env.CRE_REPO_PATH) {
    throw new Error("CRE_REPO_PATH is empty. Set it to the CRE repo that contains project.yaml.");
  }
  return env.CRE_REPO_PATH;
}

export interface CreRun {
  log: string;
  exitCode: number;
  startedAt: number;
  exitedAt: number;
}

export async function simulateCre(evidence: Evidence, options?: { broadcast?: boolean; timeoutMs?: number }): Promise<CreRun> {
  assertEvidence(evidence);
  const dir = await mkdtemp(join(tmpdir(), "sentinel-evidence-"));
  const file = join(dir, "evidence.json");
  await writeFile(file, JSON.stringify(creEvidenceSchema.parse(evidence)));
  const result = await spawnCre(simulateArgs(file, options?.broadcast !== false), {
    cwd: creRepoPath(),
    timeoutMs: options?.timeoutMs ?? 60_000,
  });
  return {
    log: `${result.output}\n[exit ${result.code}]`,
    exitCode: result.code,
    startedAt: result.startedAt,
    exitedAt: result.exitedAt,
  };
}

export async function triggerCreHttp(evidence: Evidence): Promise<string> {
  assertEvidence(evidence);
  const privateKey = env.CRE_TRIGGER_SIGNER_KEY as Hex;
  const workflowId = env.CRE_WORKFLOW_ID;
  const gatewayUrl = env.CRE_HTTP_URL || env.CRE_GATEWAY_URL;
  if (!privateKey || !workflowId || !gatewayUrl) {
    throw new Error("CRE_MODE=http needs CRE_HTTP_URL, CRE_WORKFLOW_ID, and CRE_TRIGGER_SIGNER_KEY");
  }
  const result = await triggerWorkflow({ gatewayUrl, workflowId, privateKey, input: evidence });
  return JSON.stringify(result);
}

export function simulateArgs(payloadPath: string, broadcast: boolean): string[] {
  if (!env.CRE_WORKFLOW_NAME) {
    throw new Error("CRE_WORKFLOW_NAME is empty. Set it to the workflow folder inside CRE_REPO_PATH.");
  }
  if (!env.CRE_TARGET) {
    throw new Error("CRE_TARGET is empty. Set it to a target in the CRE repo project.yaml, such as staging-settings.");
  }
  const root = creRepoPath();
  const args = [
    "workflow",
    "simulate",
    env.CRE_WORKFLOW_NAME,
    "-R",
    root,
    "-e",
    join(root, ".env"),
    "-T",
    env.CRE_TARGET,
    "--non-interactive",
    "--trigger-index",
    "0",
    "--http-payload",
    payloadPath,
  ];
  if (broadcast) args.push("--broadcast");
  return args;
}

const ZERO_HASH = `0x${"0".repeat(64)}`;

export function realTxHash(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  if (value.toLowerCase() === ZERO_HASH) return null;
  return value;
}

export interface CreVerdict {
  incidentId?: string;
  score: number;
  threshold?: number;
  action: "pause" | "rejected";
  source: "cre";
  rules?: Array<{ id: string; label: string; points: number; hit: boolean }>;
}

export interface CreReportLine {
  reportHex: string;
  writeTxHash?: string;
}

export function parseSentinelVerdict(log: string, incidentId?: string): CreVerdict | null {
  let found: CreVerdict | null = null;
  for (const line of completeLogLines(log)) {
    const parsed = markerJson(line, "SENTINEL_VERDICT");
    if (!parsed) continue;
    if (incidentId && !sameIncident(parsed.incidentId, incidentId)) continue;
    if (parsed.action !== "pause" && parsed.action !== "rejected") continue;
    if (typeof parsed.score !== "number") continue;
    const verdict: CreVerdict = { score: parsed.score, action: parsed.action, source: "cre" };
    if (typeof parsed.incidentId === "string") verdict.incidentId = parsed.incidentId;
    if (typeof parsed.threshold === "number") verdict.threshold = parsed.threshold;
    const rules = rulesFromLog(parsed.rules);
    if (rules) verdict.rules = rules;
    found = verdict;
  }
  return found;
}

export function parseSentinelReport(log: string, incidentId?: string): CreReportLine | null {
  const lines = completeLogLines(log);
  let report: CreReportLine | null = null;
  let reportAt = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = markerJson(lines[index], "SENTINEL_REPORT");
    if (!parsed || typeof parsed.reportHex !== "string" || !parsed.reportHex.startsWith("0x")) continue;
    if (incidentId && !reportForIncident(parsed, incidentId)) continue;
    const next: CreReportLine = { reportHex: parsed.reportHex };
    const embedded = realTxHash(parsed.writeTxHash ?? parsed.txHash);
    if (embedded) next.writeTxHash = embedded;
    report = next;
    reportAt = index;
  }
  if (!report || reportAt < 0) return null;
  if (!report.writeTxHash) {
    const following = lines.slice(reportAt + 1);
    const end = following.findIndex((line) => line.includes("SENTINEL_VERDICT") || line.includes("Listen: ready for next request"));
    const window = end === -1 ? following : following.slice(0, end);
    let hash: string | null = null;
    for (const line of window) {
      const printed = line.match(/Transaction successful:\s*(0x[0-9a-fA-F]{64})/)?.[1];
      const real = realTxHash(printed);
      if (real) hash = real;
    }
    if (hash) report.writeTxHash = hash;
  }
  return report;
}

/** Lines for one incident. Incomplete trailing text is dropped. Other incidents are dropped. */
export function incidentLogSlice(text: string, incidentId: string): string {
  const wanted = incidentId.toLowerCase();
  const lines = fileLines(text);
  const kept: string[] = [];
  let open = false;
  for (const line of lines) {
    const verdict = markerJson(line, "SENTINEL_VERDICT");
    if (verdict) {
      open = sameIncident(verdict.incidentId, wanted);
      if (open) kept.push(line);
      continue;
    }
    const report = markerJson(line, "SENTINEL_REPORT");
    if (report) {
      if (reportForIncident(report, wanted)) kept.push(line);
      continue;
    }
    if (line.includes("Transaction successful:")) {
      if (open) kept.push(line);
      continue;
    }
    if (/rate limited|Rejected evidence|Execution finished|Listen: ready for next request/.test(line)) {
      kept.push(line);
      if (line.includes("Execution finished") || line.includes("Listen: ready for next request")) open = false;
    } else if (open) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}

function completeLogLines(text: string): string[] {
  return cleanLog(text).split(/\r?\n/).filter((line) => line.length > 0);
}

function fileLines(text: string): string[] {
  const clean = cleanLog(text);
  if (!clean) return [];
  const parts = clean.split(/\r?\n/);
  if (!clean.endsWith("\n") && !clean.endsWith("\r")) parts.pop();
  return parts.filter((line) => line.length > 0);
}

function cleanLog(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
}

function markerJson(line: string, marker: "SENTINEL_VERDICT" | "SENTINEL_REPORT"): Record<string, unknown> | null {
  const match = line.match(new RegExp(`${marker} (\\{.*\\})\\s*$`));
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

const RULE_LABELS: Record<string, string> = {
  reentrancy: "Re-entry in the probe trace",
  loss20: "Simulated vault loss ≥ 20%",
  loss5: "Simulated vault loss ≥ 5%",
  mixer: "Gas funded via a mixer",
  fresh: "Wallet under 1 hour old",
  dayold: "Wallet under 1 day old",
  flash: "Flash-loan entry",
  newc: "Target contract < 1 h old",
};

function rulesFromLog(value: unknown): CreVerdict["rules"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rules: NonNullable<CreVerdict["rules"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.points !== "number" || typeof row.hit !== "boolean") continue;
    const logged = typeof row.label === "string" ? row.label : "";
    rules.push({
      id: row.id,
      label: looksLikeMojibake(logged) ? RULE_LABELS[row.id] ?? logged : logged,
      points: row.points,
      hit: row.hit,
    });
  }
  return rules;
}

function looksLikeMojibake(label: string): boolean {
  return label.includes("ΓëÑ") || label.includes("Γ£ô") || label.includes("â‰¥") || label.includes("âœ“") || label.includes("\uFFFD");
}

function sameIncident(value: unknown, incidentId: string): boolean {
  return typeof value === "string" && value.toLowerCase() === incidentId.toLowerCase();
}

function reportForIncident(parsed: Record<string, unknown>, incidentId: string): boolean {
  if (typeof parsed.incidentId === "string") return sameIncident(parsed.incidentId, incidentId);
  const hex = typeof parsed.reportHex === "string" ? parsed.reportHex.toLowerCase() : "";
  const bare = incidentId.toLowerCase().replace(/^0x/, "");
  return bare.length === 64 && hex.includes(bare);
}

export function parseCreSimulation(log: string): {
  exitCode: number | null;
  action: string | null;
  score: number | null;
  txHash: string | null;
  reason: string | null;
} {
  const exitMatch = log.match(/\[exit (-?\d+)\]/);
  const objects: Array<Record<string, unknown>> = [];
  for (const line of log.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^✓\s*/, "");
    if (!trimmed) continue;
    try {
      let parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "action" in parsed) {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }
  const found = objects.at(-1);
  const tx = realTxHash(found?.txHash);
  const score = typeof found?.score === "number" ? found.score : null;
  const action = typeof found?.action === "string" ? found.action : null;
  const rejected = log.match(/Rejected evidence: [^\n]+/)?.[0] ?? null;
  return {
    exitCode: exitMatch ? Number(exitMatch[1]) : null,
    action,
    score,
    txHash: tx,
    reason: action === "rejected" ? rejected ?? "CRE returned action rejected" : rejected,
  };
}

export function spawnCre(
  args: string[],
  options: { cwd: string; timeoutMs?: number },
): Promise<{ code: number; output: string; startedAt: number; exitedAt: number }> {
  if (!env.CRE_BIN) {
    return Promise.reject(new Error("CRE_BIN is empty. Set it to the full path of the cre executable."));
  }
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(env.CRE_BIN, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new CreSpawnError(`CRE timed out after ${(options.timeoutMs ?? 60_000) / 1000}s\n${output}`, startedAt, Date.now()));
    }, options.timeoutMs ?? 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CreSpawnError(error.message, startedAt, Date.now()));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output, startedAt, exitedAt: Date.now() });
    });
  });
}

export class CreSpawnError extends Error {
  startedAt: number;
  exitedAt: number;

  constructor(message: string, startedAt: number, exitedAt: number) {
    super(message);
    this.name = "CreSpawnError";
    this.startedAt = startedAt;
    this.exitedAt = exitedAt;
  }
}

async function triggerWorkflow(options: {
  gatewayUrl: string;
  workflowId: string;
  privateKey: Hex;
  input: unknown;
}): Promise<unknown> {
  const bodyObject = {
    id: randomUUID(),
    jsonrpc: "2.0" as const,
    method: "workflows.execute" as const,
    params: { input: options.input, workflow: { workflowID: options.workflowId.replace(/^0x/, "") } },
  };
  const body = canonicalJson(bodyObject);
  const digest = `0x${createHash("sha256").update(body).digest("hex")}`;
  const account = privateKeyToAccount(options.privateKey);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(Buffer.from(JSON.stringify({ alg: "ETH", typ: "JWT" })));
  const payload = base64Url(
    Buffer.from(JSON.stringify({ digest, iss: account.address, iat: now, exp: now + 5 * 60, jti: randomUUID() })),
  );
  const message = `${header}.${payload}`;
  const signature = await account.signMessage({ message });
  const bytes = new Uint8Array(hexToBytes(signature));
  if (bytes[64] >= 27) bytes[64] -= 27;
  const response = await fetch(options.gatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${message}.${base64Url(bytes)}` },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`CRE gateway responded ${response.status}: ${text}`);
  return JSON.parse(text) as unknown;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, inner]) => [key, sortValue(inner)]),
    );
  }
  return value;
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
