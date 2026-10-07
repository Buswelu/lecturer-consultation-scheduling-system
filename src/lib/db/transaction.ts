/**
 * LCSS — transaction helper over the shared pool.
 *
 * Multi-statement writes that must succeed or fail together (e.g. booking an
 * appointment + its notification) run inside `withTransaction`. The callback
 * receives a dedicated client; every statement inside uses that client so
 * they share one transaction. Commit on success, rollback on throw.
 */
import "server-only";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { getPool } from "./pool";

export type TxClient = Pick<PoolClient, "query">;

/**
 * Execute `fn` inside a transaction.
 *
 * @example
 *   await withTransaction(async (tx) => {
 *     await tx.query("insert into appointments (…) values ($1, …)", […]);
 *     await tx.query("insert into notifications (…) values ($1, …)", […]);
 *   });
 */
export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // Rollback failure after a failed transaction: the connection is
      // broken anyway; surface the original error.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Set the actor for row-level audit triggers inside a transaction.
 * The database records this id in `appointment_history.changed_by`.
 * The server (never the browser) supplies it from the verified session.
 */
export async function setActor(tx: TxClient, actorId: string): Promise<void> {
  await tx.query("select set_config('app.actor_id', $1, true)", [actorId]);
}

/** Read-only transaction body helper (rows out, nothing committed). */
export async function queryTx<T extends QueryResultRow = QueryResultRow>(
  tx: TxClient,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return tx.query<T>(text, params as never[]);
}
