import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../src/config/env.js";

const fixture = join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME, "fixtures", "control.json");
const body = readFileSync(fixture, "utf8");
const args = [
  "workflow",
  "simulate",
  env.CRE_WORKFLOW_NAME,
  "-R",
  env.CRE_REPO_PATH,
  "-e",
  join(env.CRE_REPO_PATH, ".env"),
  "-T",
  env.CRE_TARGET,
  "--non-interactive",
  "--trigger-index",
  "0",
  "--http-payload",
  fixture,
  "--listen",
  "--limits",
  "none",
];
console.log(`bin ${env.CRE_BIN ? "set" : "empty"} target ${env.CRE_TARGET} workflow ${env.CRE_WORKFLOW_NAME}`);
const child = spawn(env.CRE_BIN, args, { cwd: env.CRE_REPO_PATH, shell: false, windowsHide: true });
let output = "";
child.stdout.on("data", (chunk: Buffer) => {
  output += chunk.toString();
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk: Buffer) => {
  output += chunk.toString();
  process.stderr.write(chunk);
});
child.on("error", (error) => {
  console.log(`spawn error ${error.message}`);
});
child.on("close", (code) => {
  console.log(`cre exit ${code}`);
});

const ready = await new Promise<boolean>((resolve) => {
  const timer = setTimeout(() => resolve(false), 90_000);
  const watch = () => {
    if (/2000|listening|Listening/.test(output)) {
      clearTimeout(timer);
      resolve(true);
    }
  };
  child.stdout.on("data", watch);
  child.stderr.on("data", watch);
  child.on("close", () => {
    clearTimeout(timer);
    resolve(false);
  });
});

console.log(`ready ${ready}`);
const readyLine = output.split(/\r?\n/).find((line) => /2000|listening|Listening|error|Error/.test(line)) ?? "";
console.log(`readyLine ${readyLine}`);

if (ready) {
  const evidence = JSON.parse(body) as unknown;
  const shapes: Array<[string, string]> = [
    ["input-object", JSON.stringify({ input: evidence })],
    ["input-string", JSON.stringify({ input: JSON.stringify(evidence) })],
    ["input-base64", JSON.stringify({ input: Buffer.from(JSON.stringify(evidence)).toString("base64") })],
  ];
  for (const [name, payload] of shapes) {
    const before = output.length;
    const response = await fetch("http://127.0.0.1:2000/trigger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const fresh = output.slice(before);
    const verdict = fresh.includes("SENTINEL_VERDICT");
    const rejected = fresh.includes("Rejected evidence");
    console.log(`shape ${name} bytes ${payload.length} status ${response.status} verdict ${verdict} rejected ${rejected}`);
    const reason = fresh.split(/\r?\n/).find((line) => line.includes("Rejected evidence") || line.includes("SENTINEL_VERDICT"));
    if (reason) console.log(reason.slice(0, 220));
    if (verdict) break;
  }
}

if (child.pid && process.platform === "win32") {
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
} else {
  child.kill();
}
setTimeout(() => process.exit(0), 1_000);
