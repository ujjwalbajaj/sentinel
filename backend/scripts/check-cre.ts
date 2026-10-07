import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../src/config/env.js";
import { spawnCre } from "../src/shared/cre-client.js";

let failed = false;
const cwd = join(tmpdir(), "sentinel cre cwd");
await mkdir(cwd, { recursive: true });
try {
  if (!env.CRE_BIN) {
    console.error("CRE_BIN is empty. Set it to the full path of the cre executable.");
    failed = true;
  } else {
    const result = await spawnCre(["version"], { cwd, timeoutMs: 20_000 });
    process.stdout.write(result.output);
    if (result.code !== 0) {
      console.error(`cre version exited ${result.code}`);
      failed = true;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  failed = true;
} finally {
  await rm(cwd, { recursive: true, force: true });
}

if (!env.CRE_REPO_PATH) {
  console.error("CRE_REPO_PATH is empty. Set it to the separate CRE repo.");
  failed = true;
} else if (!existsSync(env.CRE_REPO_PATH)) {
  console.error("CRE_REPO_PATH does not exist.");
  failed = true;
} else if (!existsSync(join(env.CRE_REPO_PATH, "project.yaml"))) {
  console.error("CRE_REPO_PATH is missing project.yaml.");
  failed = true;
} else if (!env.CRE_WORKFLOW_NAME) {
  console.error("CRE_WORKFLOW_NAME is empty.");
  failed = true;
} else if (!existsSync(join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME))) {
  const names = readdirSync(env.CRE_REPO_PATH).join(", ");
  console.error(`CRE_REPO_PATH is missing ${env.CRE_WORKFLOW_NAME}/. Found: ${names}`);
  failed = true;
} else {
  console.log(`CRE_REPO_PATH ok: project.yaml and ${env.CRE_WORKFLOW_NAME}/ are present.`);
}

process.exit(failed ? 1 : 0);
