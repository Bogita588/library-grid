import "@tanstack/react-start/server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getServerEnv } from "./env.server";

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getServerEnv().databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return getPool().query<T>(text, params);
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
