import { SiweMessage } from "siwe";
import { verifyMessage } from "viem";

export function prepareSiwe(address: string, chainId: number) {
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 17);
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to SENTINEL. This signature does not grant pause rights.",
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce,
  });
  return message.prepareMessage();
}

export function signatureMatches(address: `0x${string}`, message: string, signature: `0x${string}`) {
  return verifyMessage({ address, message, signature });
}
