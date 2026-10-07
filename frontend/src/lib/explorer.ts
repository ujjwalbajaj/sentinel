import { chainMeta } from "./chains";
import type { Chain } from "./types";

export function addressUrl(chain: Chain, address: string) {
  return `${chainMeta[chain].explorer}/address/${address}`;
}

export function txUrl(chain: Chain, hash: string) {
  return `${chainMeta[chain].explorer}/tx/${hash}`;
}

export const explorerAddress = addressUrl;
export const explorerTx = txUrl;
