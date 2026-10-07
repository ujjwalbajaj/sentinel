import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeskEvent } from "./desk.js";

const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../db/schema.sql"), "utf8");

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ payload: DeskEvent }> }>;
}

export async function openDatabase(url: string | undefined): Promise<Db | null> {
  if (!url) return null;
  try {
    const mod = (await import("pg")) as {
      Pool?: new (args: { connectionString: string }) => {
        query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
      };
      default?: {
        Pool: new (args: { connectionString: string }) => {
          query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
        };
      };
    };
    const Pool = mod.Pool ?? mod.default?.Pool;
    if (!Pool) throw new Error("pg did not export Pool");
    const pool = new Pool({ connectionString: url });
    await pool.query(schema);
    return {
      async query(sql: string, params?: unknown[]) {
        const result = await pool.query(sql, params);
        return { rows: result.rows as Array<{ payload: DeskEvent }> };
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Postgres unavailable (${message}). Alerts will stay in memory.`);
    return null;
  }
}

export async function saveAlert(db: Db | null, event: DeskEvent): Promise<void> {
  if (!db || event.kind === "watch") return;
  await db.query(
    `insert into alerts (id, chain_id, protocol_name, vault, probability, paused, explanation, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (id) do nothing`,
    [
      event.id,
      event.chainId,
      event.protocolName,
      event.vault,
      event.probability ?? 0,
      event.kind === "pause",
      event.explanation ?? event.body,
      JSON.stringify(event),
    ],
  );
}
