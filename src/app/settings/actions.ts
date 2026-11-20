'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { recordEvent } from '@/lib/accounts';
import { createApiKey, revokeApiKey } from '@/lib/api-keys';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { getDb, schema } from '@/lib/db';
import { isSlackWebhookUrl, postToSlack } from '@/lib/slack';
import { requireUser } from '@/lib/session';

async function requireAccount(formData: FormData) {
  const user = await requireUser();
  const accountId = Number(formData.get('accountId'));
  const db = await getDb();
  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.accountId, accountId)))
    .limit(1);

  if (!membership) {
    throw new Error('You do not have access to this account.');
  }

  return { user, accountId, db };
}

export interface ActionState {
  ok?: boolean;
  message?: string;
  key?: string;
}

export async function saveSlackWebhook(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { user, accountId, db } = await requireAccount(formData);
  const url = String(formData.get('webhookUrl') || '').trim();

  if (!isSlackWebhookUrl(url)) {
    return { ok: false, message: 'Paste a Slack incoming webhook URL. It starts with https://hooks.slack.com/services/.' };
  }

  await db
    .update(schema.accounts)
    .set({ slackWebhookEncrypted: encryptSecret(url), updatedAt: new Date() })
    .where(eq(schema.accounts.id, accountId));
  await recordEvent({ accountId, kind: 'slack.connected', detail: { by: user.login } });
  revalidatePath('/settings');
  return { ok: true, message: 'Slack connected. Bridge will post opened, held and merged pull requests.' };
}

export async function sendSlackTest(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { accountId, db } = await requireAccount(formData);
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);

  if (!account?.slackWebhookEncrypted) {
    return { ok: false, message: 'Connect Slack first.' };
  }

  const delivered = await postToSlack(
    decryptSecret(account.slackWebhookEncrypted),
    `Bridge is connected for *${account.login}*. Pull requests Bridge opens, holds back or gets merged will show up here.`
  );
  return delivered
    ? { ok: true, message: 'Test message sent.' }
    : { ok: false, message: 'Slack did not accept the message. Check that the webhook still exists.' };
}

export async function removeSlackWebhook(formData: FormData) {
  const { user, accountId, db } = await requireAccount(formData);
  await db
    .update(schema.accounts)
    .set({ slackWebhookEncrypted: null, updatedAt: new Date() })
    .where(eq(schema.accounts.id, accountId));
  await recordEvent({ accountId, kind: 'slack.disconnected', detail: { by: user.login } });
  revalidatePath('/settings');
}

export async function createApiKeyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { user, accountId } = await requireAccount(formData);
  const name = String(formData.get('name') || '').trim() || 'CLI';
  const { key } = await createApiKey(accountId, name, user.id);
  await recordEvent({ accountId, kind: 'api_key.created', detail: { by: user.login, name } });
  revalidatePath('/settings');
  return { ok: true, key, message: 'Copy this key now. Bridge does not store it and cannot show it again.' };
}

export async function revokeApiKeyAction(formData: FormData) {
  const { user, accountId } = await requireAccount(formData);
  const keyId = Number(formData.get('keyId'));
  await revokeApiKey(accountId, keyId);
  await recordEvent({ accountId, kind: 'api_key.revoked', detail: { by: user.login, keyId } });
  revalidatePath('/settings');
}
