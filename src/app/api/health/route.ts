import { sql } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { githubAppConfigured } from '@/lib/env';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return json({ ok: true, database: 'ok', githubApp: githubAppConfigured() ? 'configured' : 'missing' });
  } catch (error) {
    return json({ ok: false, database: (error as Error).message }, 503);
  }
}
