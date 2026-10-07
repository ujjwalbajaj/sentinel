import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isAddress, type Hex } from "viem";
import { chainById } from "./chains.js";
import { openDatabase } from "./db.js";
import { Desk } from "./desk.js";
import { playIncident } from "./demo.js";
import { watchLive } from "./live.js";
import { loadRulebook } from "./rulebook.js";

export async function start(mode: "demo" | "live"): Promise<Server> {
  const extraMixers = (process.env.MIXER_ADDRESSES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const rulebook = loadRulebook(extraMixers);
  const desk = new Desk();
  const db = await openDatabase(process.env.DATABASE_URL);
  if (mode === "live") watchLive(desk, db, rulebook);

  const server = createServer(async (req, res) => {
    try {
      await route(req, res, desk, rulebook);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      sendJson(res, 400, { error: message });
    }
  });

  const port = Number(process.env.PORT ?? 8787);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address();
  const bound = typeof address === "object" && address ? address.port : port;
  console.log(`SENTINEL API  http://127.0.0.1:${bound}`);
  if (mode === "demo") {
    void playIncident(desk, rulebook, Number(process.env.DEMO_SPEED_MS ?? 700));
  }
  return server;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  desk: Desk,
  rulebook: ReturnType<typeof loadRulebook>,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "sentinel", mode: desk.mode });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, desk.snapshot());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": ok\n\n");
    const stop = desk.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on("close", stop);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/demo") {
    void playIncident(desk, rulebook, Number(process.env.DEMO_SPEED_MS ?? 700));
    sendJson(res, 202, { ok: true });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/protocols") {
    const body = JSON.parse(await readBody(req)) as {
      name?: string;
      chainId?: number;
      vault?: string;
      guardian?: string;
      tvlUsd?: number;
    };
    const chain = chainById(Number(body.chainId));
    if (!chain || !body.vault || !body.guardian || !isAddress(body.vault) || !isAddress(body.guardian)) {
      sendJson(res, 400, { error: "chainId, vault, and guardian are required" });
      return;
    }
    desk.addProtocol({
      name: body.name ?? "VaultX",
      chainId: chain.id,
      chainLabel: chain.label,
      vault: body.vault as Hex,
      guardian: body.guardian as Hex,
      tvlUsd: Number(body.tvlUsd ?? 0),
    });
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 404, { error: "Not found" });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
