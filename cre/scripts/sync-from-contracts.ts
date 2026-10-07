/**
 * Copies mainnet deployments and ABIs from the contracts repo.
 * Chain ids: BNB Chain 56, Base 8453.
 *
 * Usage: bun run sync
 * Requires CONTRACTS_REPO_PATH in the CRE repo .env.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const creRoot = resolve(import.meta.dir, "..");
const guardRoot = join(creRoot, "sentinel-guard");
const sharedDeployments = join(creRoot, "shared", "deployments");
const sharedAbi = join(creRoot, "shared", "abi");

const CHAINS = [
  { chainId: 56, key: "bsc" as const, fixtures: ["attack.bsc.json", "control.json"] },
  { chainId: 8453, key: "base" as const, fixtures: ["attack.base.json", "below-threshold.json"] },
];

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const env = loadEnv(join(creRoot, ".env"));
const contractsRoot = env.CONTRACTS_REPO_PATH;
if (!contractsRoot) {
  console.error("CONTRACTS_REPO_PATH is not set in .env");
  process.exit(1);
}

mkdirSync(sharedDeployments, { recursive: true });
mkdirSync(sharedAbi, { recursive: true });

let missing = false;
for (const chain of CHAINS) {
  const source = join(contractsRoot, "deployments", `${chain.chainId}.json`);
  const dest = join(sharedDeployments, `${chain.chainId}.json`);
  if (!existsSync(source)) {
    console.error(`Missing ${source}`);
    missing = true;
    continue;
  }
  copyFileSync(source, dest);
  const deployment = readJson(dest);
  console.log(`copied deployments/${chain.chainId}.json vault=${String(deployment.vault)} guardian=${String(deployment.guardian)}`);

  const vault = deployment.vault;
  if (typeof vault === "string" && vault.startsWith("0x")) {
    for (const fixtureName of chain.fixtures) {
      const fixturePath = join(guardRoot, "fixtures", fixtureName);
      const fixture = readJson(fixturePath);
      fixture.vault = vault;
      writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
    }
  }
}

const abiDir = join(contractsRoot, "abi");
if (existsSync(abiDir)) {
  for (const name of readdirSync(abiDir)) {
    if (!name.endsWith(".json")) continue;
    copyFileSync(join(abiDir, name), join(sharedAbi, name));
    console.log(`copied abi/${name}`);
  }
} else {
  console.error(`Missing ${abiDir}`);
  missing = true;
}

if (!missing) {
  for (const configName of ["config.staging.json", "config.production.json"]) {
    const configPath = join(guardRoot, configName);
    const config = readJson(configPath);
    const chains = config.chains as Record<string, { chainSelectorName: string; guardian: string | null }>;
    for (const chain of CHAINS) {
      const deployment = readJson(join(sharedDeployments, `${chain.chainId}.json`));
      const guardian = deployment.guardian;
      if (typeof guardian === "string" && guardian.startsWith("0x")) {
        chains[chain.key].guardian = guardian;
      }
    }
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
}

if (missing) {
  console.error("Sync incomplete. Deploy the contracts (step M5) so deployments/56.json and deployments/8453.json exist.");
  process.exit(1);
}

console.log("sync complete");
