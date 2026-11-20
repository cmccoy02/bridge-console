import crypto from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { sha256Hex } from './crypto';
import { getDb, schema } from './db';

// API keys let the CLI upload runs from outside GitHub Actions (BRIDGE_API_TOKEN).
// Only a SHA-256 hash is stored; the key is shown once when created.

export const API_KEY_PREFIX = 'brk_';

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, 12), hash: sha256Hex(key) };
}

export async function createApiKey(accountId: number, name: string, createdBy: number | null) {
  const db = await getDb();
  const generated = generateApiKey();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      accountId,
      name: name.trim().slice(0, 80) || 'CLI',
      prefix: generated.prefix,
      hash: generated.hash,
      createdBy
    })
    .returning();
  return { key: generated.key, row };
}

export async function verifyApiKey(key: string) {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.hash, sha256Hex(key)), isNull(schema.apiKeys.revokedAt)))
    .limit(1);

  if (!row) {
    return null;
  }

  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return row;
}

export async function revokeApiKey(accountId: number, keyId: number) {
  const db = await getDb();
  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.accountId, accountId)));
}
