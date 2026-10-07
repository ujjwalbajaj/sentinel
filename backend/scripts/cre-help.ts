import { spawn } from "node:child_process";
import { env } from "../src/config/env.js";

const args = process.argv.slice(2);
const child = spawn(env.CRE_BIN, args.length ? args : ["workflow", "simulate", "--help"], {
  cwd: env.CRE_REPO_PATH,
  shell: false,
  windowsHide: true,
});
child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
child.on("close", (code) => process.exit(code ?? 1));
