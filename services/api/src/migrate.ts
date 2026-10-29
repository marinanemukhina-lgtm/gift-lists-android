import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createPgDatabase} from './pg';
export async function migrate(connectionString: string): Promise<void> {
  const db = createPgDatabase(connectionString);
  try {
    await db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(73428001)');
      await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const applied = await tx.query<{version:string}>('SELECT version FROM schema_migrations WHERE version=$1', ['001_initial']);
      if (!applied.rows.length) await tx.query(await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
    });
  } finally {await db.close();}
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate(process.env.DATABASE_URL || '').then(() => process.stdout.write('Database migrations applied.\n')).catch(() => {process.stderr.write('Migration failed; check database availability and schema. Connection details suppressed.\n');process.exitCode=1;});
}
