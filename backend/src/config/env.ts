import { config as loadEnv } from "dotenv";
import { z } from "zod";

const parsed = loadEnv().parsed ?? {};
for (const [key, value] of Object.entries(parsed)) {
  if (!process.env[key]?.trim() && value.trim()) process.env[key] = value;
}

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const env = z
  .object({
    NOWNODES_API_KEY: z.preprocess(blank, z.string().default("")),
    BSC_RPC: z.preprocess(blank, z.string().default("https://bsc.nownodes.io")),
    BSC_WSS: z.preprocess(blank, z.string().default("wss://bsc.nownodes.io/wss")),
    BASE_RPC: z.preprocess(blank, z.string().default("https://base.nownodes.io")),
    BASE_WSS: z.preprocess(blank, z.string().default("wss://base.nownodes.io/wss")),
    DATABASE_URL: z.string().min(1),
    CRE_BIN: z.preprocess(blank, z.string().default("")),
    CRE_MODE: z.preprocess(blank, z.enum(["simulate", "listen", "http"]).default("simulate")),
    CRE_REPO_PATH: z.preprocess(blank, z.string().default("")),
    CRE_WORKFLOW_NAME: z.preprocess(blank, z.string().default("")),
    CRE_TARGET: z.preprocess(blank, z.string().default("")),
    CRE_HTTP_URL: z.preprocess(blank, z.string().default("")),
    CRE_GATEWAY_URL: z.preprocess(blank, z.string().default("")),
    CRE_WORKFLOW_ID: z.preprocess(blank, z.string().default("")),
    CRE_TRIGGER_SIGNER_KEY: z.preprocess(blank, z.string().default("")),
    DEMO_TOKEN: z.preprocess(blank, z.string().default("")),
    VAULT_ADMIN_PRIVATE_KEY: z.preprocess(blank, z.string().default("")),
    USER_PRIVATE_KEY: z.preprocess(blank, z.string().default("")),
    ATTACKER_FUNDER_PRIVATE_KEY: z.preprocess(blank, z.string().default("")),
    LLM_API_KEY: z.preprocess(blank, z.string().default("")),
    LLM_MODEL: z.preprocess(blank, z.string().default("gpt-4o-mini")),
    LLM_URL: z.preprocess(blank, z.string().default("https://api.openai.com/v1/chat/completions")),
    JWT_SECRET: z.preprocess(blank, z.string().min(8).default("dev-only-change-me")),
    FRONTEND_ORIGIN: z.preprocess(blank, z.string().default("http://localhost:3000")),
    PORT: z.coerce.number().default(8787),
    DEMO_STRIKE_REENTRIES: z.preprocess(blank, z.string().default("10")),
    VAULT_ADMIN_FLOOR_WEI: z.preprocess(blank, z.string().default("1000000000000000")),
    USER_FLOOR_WEI: z.preprocess(blank, z.string().default("1000000000000000")),
    ATTACKER_FUNDER_FLOOR_WEI: z.preprocess(blank, z.string().default("1000000000000000")),
    FRESH_WALLET_FLOOR_WEI: z.preprocess(blank, z.string().default("500000000000000")),
    SIWE_DOMAIN: z.preprocess(blank, z.string().default("127.0.0.1")),
    SIWE_URI: z.preprocess(blank, z.string().default("http://127.0.0.1:8787")),
  })
  .parse(process.env);

function chainWei(name: string, chainId: number): bigint {
  const raw = process.env[`${name}_${chainId}`]?.trim();
  if (!raw) throw new Error(`${name}_${chainId} is empty`);
  return BigInt(raw);
}

export function probeWei(chainId: number): bigint {
  return chainWei("DEMO_PROBE_WEI", chainId);
}

export function strikeWei(chainId: number): bigint {
  return chainWei("DEMO_STRIKE_WEI", chainId);
}

export function strikeReentries(): bigint {
  return BigInt(env.DEMO_STRIKE_REENTRIES);
}
