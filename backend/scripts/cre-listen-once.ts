import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { env } from "../src/config/env.js";

function portOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: 2000 });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    setTimeout(() => finish(false), 400);
  });
}

const deadline = Date.now() + 90_000;
while (!(await portOpen())) {
  if (Date.now() > deadline) {
    console.log("port 2000 still free");
    process.exit(2);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.log("port 2000 open, waiting 35s so the boot trigger releases the 30s slot");
await new Promise((resolve) => setTimeout(resolve, 35_000));
if (!(await portOpen())) {
  console.log("port 2000 closed before the POST");
  process.exit(2);
}

const fixture = join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME, "fixtures", "control.json");
const evidence = JSON.parse(readFileSync(fixture, "utf8")) as unknown;
const response = await fetch("http://127.0.0.1:2000/trigger", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: evidence }),
});
const text = await response.text();
console.log(`POST /trigger ${response.status}`);
console.log(text.length === 0 ? "(empty body)" : text.slice(0, 500));
process.exit(0);
