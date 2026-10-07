import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";

const destDir = join(dirname(fileURLToPath(import.meta.url)), "../src/shared/cre");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!env.CRE_REPO_PATH) fail("CRE_REPO_PATH is empty.");
if (!env.CRE_WORKFLOW_NAME) fail("CRE_WORKFLOW_NAME is empty.");

const workflowDir = join(env.CRE_REPO_PATH, env.CRE_WORKFLOW_NAME);
if (!existsSync(join(env.CRE_REPO_PATH, "project.yaml"))) {
  fail(`CRE_REPO_PATH is missing project.yaml: ${env.CRE_REPO_PATH}`);
}
if (!existsSync(workflowDir)) fail(`Workflow folder is missing: ${workflowDir}`);

const scoringName = ["scoring.ts", "score.ts"].find((name) => existsSync(join(workflowDir, name)));
if (!scoringName) fail(`No scoring.ts or score.ts in ${workflowDir}`);
const typesName = ["types.ts"].find((name) => existsSync(join(workflowDir, name)));
if (!typesName) fail(`No types.ts in ${workflowDir}`);

const scoringSource = join(workflowDir, scoringName);
const typesSource = join(workflowDir, typesName);
let scoring = readFileSync(scoringSource, "utf8");
scoring = scoring.replaceAll('from "./types"', 'from "./types.js"');

mkdirSync(destDir, { recursive: true });
writeFileSync(join(destDir, "scoring.ts"), scoring);
writeFileSync(join(destDir, "types.ts"), readFileSync(typesSource));

const gitDir = findGitRoot(env.CRE_REPO_PATH);
if (!gitDir) {
  fail(
    `Copied scoring.ts and types.ts, but ${env.CRE_REPO_PATH} is not inside a git repo. ` +
      "sync:cre will not invent a commit hash, so src/shared/cre/.source.json was not written.",
  );
}
const git = spawnSync("git", ["-C", gitDir, "rev-parse", "HEAD"], {
  shell: false,
  windowsHide: true,
  encoding: "utf8",
});
if (git.status !== 0 || !git.stdout.trim()) {
  fail(`git rev-parse failed in ${gitDir}. sync:cre will not invent a commit hash.`);
}

function findGitRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir || parse(dir).root === dir) return null;
    dir = parent;
  }
}

const source = {
  path: scoringSource,
  commit: git.stdout.trim(),
  syncedAt: new Date().toISOString(),
};
writeFileSync(join(destDir, ".source.json"), `${JSON.stringify(source, null, 2)}\n`);
console.log(`synced ${scoringName} and ${typesName} from ${workflowDir}`);
console.log(`commit ${source.commit}`);
