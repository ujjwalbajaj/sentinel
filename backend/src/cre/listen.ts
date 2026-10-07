import { connect } from "node:net";
import { join } from "node:path";
import { openSharedRead } from "./shared-read.js";
import { env } from "../config/env.js";
import { log } from "../log.js";
import { incidentLogSlice, parseSentinelReport, type Evidence } from "../shared/cre-client.js";

const TRIGGER_URL = "http://127.0.0.1:2000/trigger";
const WINDOW_MS = 30_000;
const logFile = () => join(env.CRE_REPO_PATH, "cre-listen.log");

let nextSlotAt = 0;
let queue: Promise<void> = Promise.resolve();

export class CreListenerDown extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreListenerDown";
  }
}

export function listenPortOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: 2000 });
    let settled = false;
    const finish = (openPort: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(openPort);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    setTimeout(() => finish(false), 500);
  });
}

export function triggerCreListener(
  evidence: Evidence,
): Promise<{ log: string; httpStatus: number; httpBody: string; startedAt: number; exitedAt: number; offset: number }> {
  const run = queue.then(() => postWhenWindowOpens(evidence));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function postWhenWindowOpens(
  evidence: Evidence,
): Promise<{ log: string; httpStatus: number; httpBody: string; startedAt: number; exitedAt: number; offset: number }> {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const wait = nextSlotAt - Date.now();
    if (wait > 0) {
      log.info({ incidentId: evidence.incidentId, path: "listen", waitMs: wait, attempt }, "CRE listen queued until the 30s window opens");
      await sleep(wait);
    }
    if (!(await listenPortOpen())) throw new CreListenerDown("CRE listener is not accepting connections on port 2000");
    const offset = await logOffset();
    let response: Response;
    try {
      response = await fetch(TRIGGER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: evidence }),
      });
    } catch (error) {
      throw new CreListenerDown(error instanceof Error ? error.message : String(error));
    }
    const httpBody = await response.text();
    if (response.status === 429) {
      nextSlotAt = Date.now() + WINDOW_MS;
      log.warn({ incidentId: evidence.incidentId, path: "listen", httpStatus: response.status, attempt }, "CRE listen refused the trigger");
      continue;
    }
    if (!response.ok) {
      throw new Error(`CRE trigger POST ${response.status} ${httpBody.slice(0, 180)}`);
    }
    nextSlotAt = Date.now() + WINDOW_MS;
    const simulatorLog = await waitForSimulatorLog(offset, evidence.incidentId);
    if (simulatorLog.includes("rate limited") && !simulatorLog.includes(evidence.incidentId)) {
      log.warn({ incidentId: evidence.incidentId, path: "listen", attempt }, "CRE listen rate-limited the trigger");
      continue;
    }
    return { log: simulatorLog, httpStatus: response.status, httpBody, startedAt, exitedAt: Date.now(), offset };
  }
  throw new Error("CRE listen stayed rate-limited after 4 attempts");
}

export async function followBroadcast(
  offset: number,
  incidentId: string,
): Promise<{ reportHex: string; writeTxHash?: string } | null> {
  const deadline = Date.now() + 30_000;
  let report: { reportHex: string; writeTxHash?: string } | null = null;
  while (Date.now() < deadline) {
    const slice = incidentLogSlice(await readFrom(offset), incidentId);
    const parsed = parseSentinelReport(slice, incidentId);
    if (parsed) report = parsed;
    if (report?.writeTxHash) return report;
    await sleep(200);
  }
  return report;
}

async function waitForSimulatorLog(offset: number, incidentId: string): Promise<string> {
  const deadline = Date.now() + 25_000;
  let slice = "";
  while (Date.now() < deadline) {
    const raw = await readFrom(offset);
    slice = incidentLogSlice(raw, incidentId);
    const verdict = slice.includes("SENTINEL_VERDICT");
    const limited = slice.includes("rate limited");
    const finished = slice.includes("Execution finished") || slice.includes("Listen: ready for next request");
    if (verdict || slice.includes("Rejected evidence") || (limited && finished)) return slice;
    if (!(await logExists())) return "";
    await sleep(200);
  }
  return slice;
}

async function logExists(): Promise<boolean> {
  const file = openSharedRead(logFile());
  if (!file) return false;
  file.close();
  return true;
}

async function logOffset(): Promise<number> {
  const file = openSharedRead(logFile());
  if (!file) return 0;
  try {
    return Number(file.size());
  } finally {
    file.close();
  }
}

async function readFrom(offset: number): Promise<string> {
  const file = openSharedRead(logFile());
  if (!file) return "";
  try {
    const size = Number(file.size());
    if (size <= offset) return "";
    const length = Math.min(size - offset, 4_000_000);
    return decodeLogBytes(file.readAt(offset, length), offset === 0);
  } finally {
    file.close();
  }
}

function decodeLogBytes(buf: Buffer, atStart: boolean): string {
  let bytes = buf;
  if (atStart && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le").replace(/\u0000/g, "");
  }
  if (atStart && bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  return bytes.toString("utf8").replace(/^\uFEFF/, "").replace(/\u0000/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
