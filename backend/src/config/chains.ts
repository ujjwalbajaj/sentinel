import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, webSocket, type Chain } from "viem";
import { base, bsc } from "viem/chains";
import { log } from "../log.js";
import { env } from "./env.js";

export interface Deployment {
  chainId: 56 | 8453;
  vault: `0x${string}` | null;
  guardian: `0x${string}` | null;
  mixer: `0x${string}` | null;
  vaultAdmin?: `0x${string}`;
  priceFeed?: `0x${string}`;
  explorer?: string;
  deployBlock?: number;
  note?: string;
}

export interface ChainRuntime {
  id: 56 | 8453;
  key: "bnb" | "base";
  label: string;
  native: "BNB" | "ETH";
  selectorName: string;
  viem: Chain;
  deployment: Deployment;
  rpcUrl: string;
  wssUrl: string;
  http: () => HttpClient;
  socket: () => HttpClient;
}

// viem's client type is chain-specific. Call sites use the real client; this alias keeps the two transports in one map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HttpClient = any;

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const httpClients = new Map<number, HttpClient>();
const socketClients = new Map<number, HttpClient>();

export function repoRoot(): string {
  return root;
}

export function isSet(address: string | null | undefined): address is `0x${string}` {
  return Boolean(address && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address));
}

function withKey(url: string): string {
  const key = env.NOWNODES_API_KEY;
  if (!key || url.includes(key)) return url;
  return url.endsWith("/") ? `${url}${key}` : `${url}/${key}`;
}

export function loadDeployment(id: 56 | 8453): Deployment {
  const file = join(root, "src/shared/deployments", `${id}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}

function build(id: 56 | 8453): ChainRuntime {
  const deployment = loadDeployment(id);
  const isBsc = id === 56;
  const rpcUrl = isBsc ? env.BSC_RPC : env.BASE_RPC;
  const wssUrl = withKey(isBsc ? env.BSC_WSS : env.BASE_WSS);
  const chain = isBsc ? bsc : base;
  const headers = env.NOWNODES_API_KEY ? { "api-key": env.NOWNODES_API_KEY } : undefined;
  return {
    id,
    key: isBsc ? "bnb" : "base",
    label: isBsc ? "BNB Chain" : "Base",
    native: isBsc ? "BNB" : "ETH",
    selectorName: isBsc ? "binance_smart_chain-mainnet" : "ethereum-mainnet-base-1",
    viem: chain,
    deployment,
    rpcUrl,
    wssUrl,
    http() {
      let client = httpClients.get(id);
      if (!client) {
        client = createPublicClient({
          chain,
          transport: http(rpcUrl, { fetchOptions: { headers } }),
        });
        httpClients.set(id, client);
      }
      return client;
    },
    socket() {
      let client = socketClients.get(id);
      if (!client) {
        client = createPublicClient({
          chain,
          transport: webSocket(wssUrl, {
            keepAlive: { interval: 30_000 },
            reconnect: { attempts: 20, delay: 1_000 },
            retryCount: 3,
            retryDelay: 1_000,
          }),
        });
        socketClients.set(id, client);
      }
      return client;
    },
  };
}

const CHAINS = [build(56), build(8453)];

export function mainnetChains(): ChainRuntime[] {
  return CHAINS;
}

export async function resetSocket(chain: ChainRuntime): Promise<void> {
  const client = socketClients.get(chain.id);
  if (!client) return;
  try {
    const rpc = await client.transport.getRpcClient();
    rpc.close();
  } catch (error) {
    log.warn(
      { chainId: chain.id, err: error instanceof Error ? error.message : String(error) },
      "socket reset failed",
    );
  }
  socketClients.delete(chain.id);
}

export function chainById(id: number): ChainRuntime | undefined {
  return CHAINS.find((chain) => chain.id === id);
}

function explorerBase(chain: ChainRuntime): string {
  if (chain.deployment.explorer) return chain.deployment.explorer;
  return chain.id === 56 ? "https://bscscan.com" : "https://basescan.org";
}

export function explorerTx(chain: ChainRuntime, hash: string): string {
  return `${explorerBase(chain)}/tx/${hash}`;
}

export function explorerAddress(chain: ChainRuntime, address: string): string {
  return `${explorerBase(chain)}/address/${address}`;
}

export async function rpc<T>(client: unknown, method: string, params: unknown[]): Promise<T> {
  const request = (client as { request: (args: { method: string; params: unknown[] }) => Promise<T> }).request;
  return request({ method, params });
}
