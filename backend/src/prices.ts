import type { Hex } from "viem";
import { chainById, type ChainRuntime } from "./config/chains.js";
import { log } from "./log.js";
import { readContractValue } from "./shared/call.js";
import { aggregatorAbi } from "./shared/load-abi.js";

const cache = new Map<number, { usd: number; at: number }>();

export async function nativeUsd(chain: ChainRuntime): Promise<number | null> {
  const hit = cache.get(chain.id);
  if (hit && Date.now() - hit.at < 60_000) return hit.usd;
  try {
    const feed = chain.deployment.priceFeed;
    if (!feed) throw new Error("price feed address is not in the deployment file");
    const client = chain.http();
    const decimals = await readContractValue<number>(client, feed, aggregatorAbi, "decimals");
    const round = await readContractValue<readonly [bigint, bigint, bigint, bigint, bigint]>(
      client,
      feed,
      aggregatorAbi,
      "latestRoundData",
    );
    const answer = round[1];
    if (answer <= 0n) throw new Error("price feed answered 0");
    const usd = Number(answer) / 10 ** Number(decimals);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error("price feed answer is not a positive number");
    cache.set(chain.id, { usd, at: Date.now() });
    return usd;
  } catch (error) {
    log.warn({ chainId: chain.id, err: error instanceof Error ? error.message : String(error) }, "price feed unread");
    return null;
  }
}

export function weiToUsd(wei: bigint, usdPerNative: number | null): number | null {
  if (wei === 0n) return 0;
  if (usdPerNative == null || usdPerNative <= 0) return null;
  const whole = Number(wei / 10n ** 12n) / 1e6;
  return whole * usdPerNative;
}

export async function priceForChain(chainId: number): Promise<number | null> {
  const chain = chainById(chainId);
  if (!chain) return null;
  return nativeUsd(chain);
}

export function feedAddress(chain: ChainRuntime): Hex | null {
  return chain.deployment.priceFeed ?? null;
}
