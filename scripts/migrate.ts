// Applies drizzle/ migrations to DATABASE_URL. Run before `next build` in production.
import path from 'node:path';

const url = (process.env.DATABASE_URL || '').trim();

if (!url) {
  console.log('DATABASE_URL is not set; skipping migrations (local dev migrates the embedded database on start).');
  process.exit(0);
}

const { default: postgres } = await import('postgres');
const { drizzle } = await import('drizzle-orm/postgres-js');
const { migrate } = await import('drizzle-orm/postgres-js/migrator');

// Migrations need a session connection: use the direct or session-pooler URL if set.
const client = postgres(process.env.DATABASE_MIGRATION_URL || url, { max: 1, prepare: false });

try {
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  console.log('Migrations applied.');
} finally {
  await client.end();
}
