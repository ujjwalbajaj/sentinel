import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

interface Session {
  sub: string;
  wallet: string;
  exp: number;
}

function b64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export function signJwt(payload: { sub: string; wallet: string }): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60 }));
  const sig = createHmac("sha256", env.JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function readJwt(token: string | undefined): Session | null {
  if (!token) return null;
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) return null;
  const expected = createHmac("sha256", env.JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
