import type { FastifyInstance } from "fastify";
import { getAddress, verifyMessage, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { HttpError } from "../http-error.js";
import { readJwt, signJwt } from "./jwt.js";

export function registerAuth(app: FastifyInstance): void {
  app.get("/auth/nonce", async (request) => {
    const query = z.object({ address: z.string() }).parse(request.query);
    const wallet = getAddress(query.address);
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await prisma.authNonce.create({
      data: { wallet, nonce, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    return { nonce };
  });

  app.post("/auth/verify", async (request, reply) => {
    const body = z.object({ message: z.string().min(1), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).parse(request.body);
    const parsed = parseSiweMessage(body.message);
    if (!parsed.address || !parsed.nonce) throw new HttpError("SIWE message is missing address or nonce", 400);
    const wallet = getAddress(parsed.address);
    const row = await prisma.authNonce.findUnique({ where: { nonce: parsed.nonce } });
    if (!row || row.wallet.toLowerCase() !== wallet.toLowerCase() || row.expiresAt.getTime() < Date.now()) {
      throw new HttpError("Nonce is missing or expired", 401);
    }
    const ok = await verifyMessage({ address: wallet, message: body.message, signature: body.signature as Hex });
    if (!ok) throw new HttpError("Signature does not match the SIWE message", 401);
    await prisma.authNonce.delete({ where: { id: row.id } });
    const user = await prisma.user.upsert({
      where: { walletAddress: wallet },
      create: { walletAddress: wallet },
      update: {},
    });
    reply.setCookie("sentinel", signJwt({ sub: user.id, wallet }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
    });
    return { id: user.id, walletAddress: user.walletAddress, name: user.name, org: user.org, role: user.role };
  });

  app.get("/auth/session", async (request) => {
    const session = sessionOf(request.headers.cookie);
    const user = await prisma.user.findUnique({ where: { id: session.sub } });
    if (!user) throw new HttpError("Sign in with Ethereum first", 401);
    return { id: user.id, walletAddress: user.walletAddress, name: user.name, org: user.org, role: user.role };
  });

  app.post("/auth/profile", async (request) => {
    const session = sessionOf(request.headers.cookie);
    const body = z.object({
      name: z.string().min(1),
      org: z.string().min(1),
      role: z.string().min(1),
      email: z.string().email().optional(),
    }).parse(request.body);
    const user = await prisma.user.update({
      where: { id: session.sub },
      data: { name: body.name, org: body.org, role: body.role, email: body.email },
    });
    return { id: user.id, walletAddress: user.walletAddress, name: user.name, org: user.org, role: user.role, email: user.email };
  });
}

export function sessionOf(cookieHeader: string | undefined): { sub: string; wallet: string } {
  const token = readCookie(cookieHeader, "sentinel");
  const session = readJwt(token);
  if (!session) throw new HttpError("Sign in with Ethereum first", 401);
  return session;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
