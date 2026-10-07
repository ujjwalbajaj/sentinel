import { NextResponse } from "next/server";

const hosts = {
  base: "https://base.nownodes.io",
  bsc: "https://bsc.nownodes.io",
} as const;

const blocked = new Set(["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign"]);

export async function POST(request: Request, { params }: { params: { chain: string } }) {
  const host = hosts[params.chain as keyof typeof hosts];
  if (!host) return NextResponse.json({ error: "Unknown chain." }, { status: 404 });

  const key = process.env.NOWNODES_API_KEY;
  if (!key) return NextResponse.json({ error: "RPC is not configured." }, { status: 503 });

  let body: { method?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
  }

  if (!body.method || blocked.has(body.method)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32601, message: "Method not allowed on the read proxy." } },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(host, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "RPC did not respond." } },
      { status: 502 },
    );
  }
}
