import { eq } from 'drizzle-orm';

import { decryptSecret } from './crypto';
import { getDb, schema } from './db';

// Slack incoming webhooks, one per account. Notifications are best-effort.

export function isSlackWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/');
  } catch {
    return false;
  }
}

export async function postToSlack(webhookUrl: string, text: string): Promise<boolean> {
  if (!isSlackWebhookUrl(webhookUrl)) {
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, unfurl_links: false }),
      signal: AbortSignal.timeout(8000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function notifyAccount(accountId: number, text: string): Promise<boolean> {
  const db = await getDb();
  const [account] = await db
    .select({ slack: schema.accounts.slackWebhookEncrypted })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);

  if (!account?.slack) {
    return false;
  }

  try {
    return await postToSlack(decryptSecret(account.slack), text);
  } catch {
    return false;
  }
}

function link(url: string | null | undefined, label: string): string {
  return url ? `<${url}|${label}>` : label;
}

export function runMessage(input: {
  repo: string;
  status: string;
  direct: number;
  transitive: number;
  prUrl?: string | null;
  prNumber?: number | null;
  message?: string | null;
  runUrl: string;
}): string | null {
  const changes = `${input.direct} direct, ${input.transitive} transitive`;
  const pr = link(input.prUrl, input.prNumber ? `PR #${input.prNumber}` : 'pull request');

  switch (input.status) {
    case 'pr_opened':
      return `:white_check_mark: Bridge opened ${pr} in *${input.repo}*: ${changes} update(s), all checks passed. ${link(input.runUrl, 'Details')}`;
    case 'pr_updated':
      return `:arrows_counterclockwise: Bridge refreshed ${pr} in *${input.repo}* (${changes}). ${link(input.runUrl, 'Details')}`;
    case 'blocked':
      return `:no_entry: Bridge held updates in *${input.repo}*: ${input.message || 'a safety gate failed'}. ${link(input.runUrl, 'Details')}`;
    case 'failed':
      return `:warning: Bridge run failed in *${input.repo}*: ${input.message || 'see details'}. ${link(input.runUrl, 'Details')}`;
    default:
      return null;
  }
}
