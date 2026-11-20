import fs from 'node:fs/promises';
import path from 'node:path';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as schema from './schema';

export { schema };
export type Database = PostgresJsDatabase<typeof schema>;

declare global {
  var __bridgeDb: Promise<Database> | undefined;
}

export const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

async function createDb(): Promise<Database> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    // Supabase's transaction pooler does not support prepared statements.
    const client = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_SIZE || 1),
      idle_timeout: 20
    });
    return drizzle(client, { schema });
  }

  // Local development and tests: embedded Postgres (PGlite), migrated on first use.
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dataDir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'pglite');

  if (!dataDir.startsWith('memory://')) {
    await fs.mkdir(dataDir, { recursive: true });
  }

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Database;
}

export function getDb(): Promise<Database> {
  globalThis.__bridgeDb ??= createDb().catch((error) => {
    globalThis.__bridgeDb = undefined;
    throw error;
  });
  return globalThis.__bridgeDb;
}

/** Tests only: forget the cached connection so the next getDb() starts fresh. */
export function resetDbCache() {
  globalThis.__bridgeDb = undefined;
}
