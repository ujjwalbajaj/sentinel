import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { env } from "../config/env.js";
import { HttpError } from "../http-error.js";

const secret = () => scryptSync(env.JWT_SECRET, "sentinel-demo-wallet", 32);

export function freshKey(): { address: Hex; privateKey: Hex; ciphertext: string } {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  return { address, privateKey, ciphertext: encrypt(privateKey) };
}

export function decryptKey(ciphertext: string): Hex {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new HttpError("Stored demo key is unreadable", 500);
  const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return plain.toString("utf8") as Hex;
}

export function namedKey(value: string, label: string): Hex {
  if (!value) throw new HttpError(`${label} is not set`, 400);
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new HttpError(`${label} is not a 32-byte hex key`, 400);
  return hex as Hex;
}

function encrypt(privateKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const data = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}
