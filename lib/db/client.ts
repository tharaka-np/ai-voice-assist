import "server-only";

import { Pool, type QueryResultRow } from "pg";

import { AppError } from "@/lib/errors";

/**
 * Postgres connection pool.
 *
 * Cached on `globalThis` rather than in a module-level variable. In development
 * Next.js re-evaluates the module graph on every save, which would reset a
 * module-scoped pool and leak its open sockets — after enough edits Postgres
 * refuses new connections. `globalThis` survives hot reload, so exactly one pool
 * exists per server process.
 *
 * This is why the pattern differs from `lib/openai/client.ts`: that client only
 * holds configuration and makes stateless HTTPS calls, so recreating it is free.
 */
const globalForDb = globalThis as unknown as { voiceExtractorPool?: Pool };

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return url !== undefined && url.trim().length > 0;
}

export function getPool(): Pool {
  if (globalForDb.voiceExtractorPool !== undefined) {
    return globalForDb.voiceExtractorPool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new AppError({
      code: "configuration_error",
      status: 500,
      publicMessage:
        "The database isn't configured yet. Please contact the administrator.",
      detail: "DATABASE_URL is missing or empty. Start Docker and set it in .env.local.",
    });
  }

  globalForDb.voiceExtractorPool = new Pool({
    connectionString,
    // Well under Postgres's default 100-connection ceiling, leaving room for
    // psql sessions and any other local consumer.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return globalForDb.voiceExtractorPool;
}

/**
 * Runs a parameterised query and returns the raw rows.
 *
 * Values are always passed as parameters, never interpolated into the SQL, so
 * user input cannot alter the statement. Callers validate the rows with Zod: a
 * database row is an external boundary like any other, and a schema change
 * should surface as a clear validation error rather than an `undefined` leaking
 * into the UI.
 */
export async function query<TRow extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const pool = getPool();

  try {
    const result = await pool.query<TRow>(sql, [...params]);
    return result.rows;
  } catch (error) {
    throw new AppError({
      code: "database_error",
      status: 503,
      publicMessage:
        "We couldn't reach the database. Please try again in a moment.",
      // The SQL text is safe to log; the parameters are not, since they can
      // contain names taken from a transcript.
      detail: `query failed: ${sql.replace(/\s+/g, " ").trim().slice(0, 120)}`,
      cause: error,
    });
  }
}
