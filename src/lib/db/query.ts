/**
 * LCSS — parameterized query helper over the shared pool.
 *
 * All SQL must go through this helper (or `transaction.ts`): it enforces
 * parameterized queries (`$1, $2, …`) so user input is never concatenated
 * into SQL text. Never interpolate values into the `text` argument.
 */
import "server-only";
import type { QueryResult, QueryResultRow } from "pg";
import { getPool } from "./pool";

/**
 * Run a parameterized query and return the raw pg result.
 *
 * @example
 *   const { rows } = await query<Profile>("select * from profiles where id = $1", [id]);
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as never[]);
}

/**
 * Run a parameterized query and return the first row, or `null` when
 * no rows match. Useful for lookups by id / unique key.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}
