import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, AbiEvent } from "viem";

const dir = join(dirname(fileURLToPath(import.meta.url)), "abi");

const REQUIRED = ["VulnerableVault", "Guardian", "MockMixer", "Attacker", "Aggregator"] as const;

const PLACEHOLDER_WARNING = "ABIs are placeholders — run `npm run sync` in the contracts repo";

export function placeholderAbiWarning(): string | null {
  const marker = join(dir, ".source.json");
  if (!existsSync(marker)) return PLACEHOLDER_WARNING;
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf8")) as {
      commit?: unknown;
      syncedAt?: unknown;
      contractsRepo?: unknown;
      timestamp?: unknown;
    };
    const legacy =
      typeof parsed.commit === "string" &&
      parsed.commit.trim() !== "" &&
      typeof parsed.syncedAt === "string" &&
      parsed.syncedAt.trim() !== "";
    const synced =
      typeof parsed.contractsRepo === "string" &&
      parsed.contractsRepo.trim() !== "" &&
      typeof parsed.timestamp === "string" &&
      parsed.timestamp.trim() !== "";
    if (!legacy && !synced) return PLACEHOLDER_WARNING;
  } catch {
    return PLACEHOLDER_WARNING;
  }
  return null;
}

export function assertSharedAbis(): void {
  const missing: string[] = [];
  for (const name of REQUIRED) {
    const file = join(dir, `${name}.json`);
    if (!existsSync(file)) missing.push(file);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing ABI file(s):\n${missing.join("\n")}\nCopy them with the contracts repo npm run sync. The backend does not invent ABIs.`,
    );
  }
}

export function loadAbi(name: string): Abi {
  const file = join(dir, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(`Missing ABI ${file}. Run the contracts repo npm run sync.`);
  }
  const abi = JSON.parse(readFileSync(file, "utf8")) as Abi;
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error(`ABI ${file} is empty.`);
  }
  return abi;
}

export function requireEvent(abi: Abi, name: string): AbiEvent {
  const found = abi.find((item) => item.type === "event" && item.name === name);
  if (!found || found.type !== "event") {
    throw new Error(`Shared ABI is missing event ${name}. Replace the file from the contracts repo sync.`);
  }
  return found;
}

export const vaultAbi = loadAbi("VulnerableVault");
export const guardianAbi = loadAbi("Guardian");
export const mixerAbi = loadAbi("MockMixer");
export const attackerAbi = loadAbi("Attacker");
export const aggregatorAbi = loadAbi("Aggregator");
