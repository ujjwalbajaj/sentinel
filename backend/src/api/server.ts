import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { z, ZodError } from "zod";
import { timingSafeEqual } from "node:crypto";
import { isSet, mainnetChains } from "../config/chains.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { chainWatcher } from "../watchers/index.js";
import { demoStatus, runDemo } from "../demo/actions.js";
import { acquireDemo, releaseDemo } from "../demo/lock.js";
import { beginAttackRun } from "../demo/run-attack.js";
import { HttpError } from "../http-error.js";
import { setLiveEmitter } from "../live/hub.js";
import { log } from "../log.js";
import { registerAuth } from "./auth.js";
import { registerProtocols } from "./protocols.js";
import { registerReads } from "./reads.js";

export async function buildServer(options: { watchOnly: boolean }): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  await app.register(cors, { origin: env.FRONTEND_ORIGIN, credentials: true });
  await app.register(cookie);
  registerAuth(app);
  registerProtocols(app);
  registerReads(app);

  app.get("/health", async () => {
    let db: "up" | "down" = "down";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "up";
    } catch {
      db = "down";
    }
    const chains: Record<string, Record<string, unknown>> = {};
    for (const chain of mainnetChains()) {
      const watchers = chainWatcher(chain);
      const row: Record<string, unknown> = { watchers };
      try {
        const chainId = Number(await chain.http().getChainId());
        row.rpc = chainId === chain.id ? "up" : "down";
        row.chainId = chainId;
      } catch {
        row.rpc = "down";
      }
      if (watchers === "live") {
        row.addresses = {
          vault: isSet(chain.deployment.vault) ? chain.deployment.vault : null,
          guardian: isSet(chain.deployment.guardian) ? chain.deployment.guardian : null,
          mixer: isSet(chain.deployment.mixer) ? chain.deployment.mixer : null,
        };
      }
      chains[String(chain.id)] = row;
    }
    const rpcUp = Object.values(chains).every((chain) => chain.rpc === "up");
    return { ok: db === "up" && rpcUp, db, chains, watchOnly: options.watchOnly, cre: { mode: env.CRE_MODE } };
  });

  if (!options.watchOnly) {
    app.get("/demo/:chainId/status", async (request) => {
      if (!demoTokenOk(request.headers["x-demo-token"] ?? request.headers.authorization)) {
        throw new HttpError("DEMO_TOKEN is missing or wrong", 401);
      }
      const params = request.params as { chainId: string };
      return demoStatus(Number(params.chainId));
    });

    app.post("/demo/:chainId/run-attack", async (request, reply) => {
      if (!demoTokenOk(request.headers["x-demo-token"] ?? request.headers.authorization)) {
        throw new HttpError("DEMO_TOKEN is missing or wrong", 401);
      }
      const params = z.object({ chainId: z.coerce.number() }).parse(request.params);
      const body = z.object({ strikeDelaySec: z.number().int().min(0).max(600) }).parse(request.body);
      const { runId } = await beginAttackRun(params.chainId, body.strikeDelaySec);
      return reply.status(202).send({ runId, chainId: params.chainId, strikeDelaySec: body.strikeDelaySec });
    });

    app.post("/demo/:chainId/:action", async (request) => {
      if (!demoTokenOk(request.headers["x-demo-token"] ?? request.headers.authorization)) {
        throw new HttpError("DEMO_TOKEN is missing or wrong", 401);
      }
      const params = request.params as { chainId: string; action: string };
      const chainId = Number(params.chainId);
      let locked = false;
      if (params.action !== "status") {
        const busy = acquireDemo("action");
        if (busy === "run") throw new HttpError("A demo run is already in progress", 409);
        if (busy === "action") throw new HttpError("Another demo action is running", 409);
        locked = true;
      }
      try {
        return await runDemo(chainId, params.action);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Demo action failed";
        const line = `[DEMO] ${params.action} failed ${message}`;
        log.info(line);
        return {
          action: params.action,
          chainId,
          status: "failed" as const,
          label: params.action,
          txs: [],
          result: {},
          error: message,
          line,
        };
      } finally {
        if (locked) releaseDemo();
      }
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: error.issues.map((issue) => issue.message).join("; ") });
    }
    request.log.error({ err: error instanceof Error ? error.message : "request failed" }, "request failed");
    return reply.status(500).send({ error: "Request failed" });
  });

  await app.ready();
  const io = new Server(app.server, {
    cors: { origin: env.FRONTEND_ORIGIN, credentials: true },
  });
  const live = io.of("/live");
  setLiveEmitter((event, payload) => {
    live.emit(event, payload);
    log.info({ event }, "socket");
  });
  return app;
}

function demoTokenOk(header: string | string[] | undefined): boolean {
  const expected = env.DEMO_TOKEN;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!expected || !raw) return false;
  const presented = raw.replace(/^Bearer\s+/i, "");
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
