import {Pool} from 'pg';
import type {Database, SqlExecutor} from './database';
/** Ordinary pg adapter: compatible with local/container Postgres and managed Postgres.
 * TLS is controlled using the standard connection URL. Never log that URL. */
export function createPgDatabase(connectionString: string): Database & {close(): Promise<void>} {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({connectionString, max: 4, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 10_000, statement_timeout: 15_000});
  // pg-pool removes the failed idle client before emitting this event. Handle it
  // without printing the Error (it can contain credentials/host/client state).
  // Future operations obtain another connection; never retry an unknown commit.
  pool.on('error', () => {process.stderr.write('Gift API: an idle database connection was closed; future requests will reconnect.\n');});
  const query: SqlExecutor['query'] = async (text, values) => {
    const result = await pool.query(text, values);
    return {rows: result.rows, rowCount: result.rowCount};
  };
  return {query, async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({query: async (text, values) => {
        const result = await client.query(text, values);
        return {rows: result.rows, rowCount: result.rowCount};
      }});
      await client.query('COMMIT');
      return result;
    } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
  }, close: () => pool.end()};
}
