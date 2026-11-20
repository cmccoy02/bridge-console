import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { markReposRemoved, recordEvent, upsertAccountFromInstallation, upsertRepo } from './accounts';
import { getDb, schema } from './db';
import { githubAppConfig } from './env';
import type { InstallationInfo, RepoInfo } from './github-app';
import { HttpError } from './http';
import { notifyAccount } from './slack';

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface InstallationPayload {
  action: string;
  installation: InstallationInfo;
  repositories?: RepoInfo[];
  repositories_added?: RepoInfo[];
  repositories_removed?: RepoInfo[];
}

interface PullRequestPayload {
  action: string;
  installation?: { id: number };
  repository: RepoInfo;
  pull_request: {
    number: number;
    html_url: string;
    title: string;
    state: string;
    merged: boolean;
    merged_at: string | null;
    closed_at: string | null;
    created_at: string;
    merged_by?: { login: string } | null;
    head: { ref: string };
    user?: { login: string; type?: string };
  };
}

function isBridgePullRequest(payload: PullRequestPayload): boolean {
  const pr = payload.pull_request;
  const { slug } = githubAppConfig();
  return pr.head.ref.startsWith('bridge/') || (Boolean(slug) && pr.user?.login === `${slug}[bot]`);
}

async function handleInstallation(event: string, payload: InstallationPayload) {
  const db = await getDb();
  const account = await upsertAccountFromInstallation(payload.installation);

  if (event === 'installation') {
    if (payload.action === 'deleted') {
      await db
        .update(schema.accounts)
        .set({ installationDeletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.accounts.id, account.id));
    } else if (payload.action === 'suspend') {
      await db
        .update(schema.accounts)
        .set({ installationSuspendedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.accounts.id, account.id));
    } else if (payload.action === 'unsuspend') {
      await db
        .update(schema.accounts)
        .set({ installationSuspendedAt: null, updatedAt: new Date() })
        .where(eq(schema.accounts.id, account.id));
    }

    for (const repo of payload.repositories || []) {
      await upsertRepo(account.id, repo);
    }
  } else {
    for (const repo of payload.repositories_added || []) {
      await upsertRepo(account.id, repo);
    }

    await markReposRemoved((payload.repositories_removed || []).map((repo) => repo.id));
  }

  await recordEvent({
    accountId: account.id,
    kind: `${event}.${payload.action}`,
    detail: {
      added: (payload.repositories || payload.repositories_added || []).map((repo) => repo.full_name),
      removed: (payload.repositories_removed || []).map((repo) => repo.full_name)
    }
  });
  return { account: account.login };
}

async function handlePullRequest(payload: PullRequestPayload) {
  if (!isBridgePullRequest(payload)) {
    return { ignored: 'not a Bridge pull request' };
  }

  const db = await getDb();
  const [repo] = await db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.githubRepoId, payload.repository.id))
    .limit(1);

  if (!repo) {
    return { ignored: 'unknown repository' };
  }

  const pr = payload.pull_request;
  const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
  const values = {
    url: pr.html_url,
    title: pr.title,
    headRef: pr.head.ref,
    state,
    openedAt: new Date(pr.created_at),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
    mergedBy: pr.merged_by?.login || null,
    updatedAt: new Date()
  };
  const [existing] = await db
    .select()
    .from(schema.pullRequests)
    .where(and(eq(schema.pullRequests.repoId, repo.id), eq(schema.pullRequests.number, pr.number)))
    .limit(1);

  if (existing) {
    await db.update(schema.pullRequests).set(values).where(eq(schema.pullRequests.id, existing.id));
  } else {
    await db.insert(schema.pullRequests).values({ ...values, repoId: repo.id, number: pr.number });
  }

  if (payload.action === 'closed' && pr.merged && existing?.state !== 'merged') {
    await notifyAccount(
      repo.accountId,
      `:tada: <${pr.html_url}|PR #${pr.number}> merged in *${repo.fullName}*${pr.merged_by ? ` by ${pr.merged_by.login}` : ''}. Dependencies are current.`
    );
  }

  await recordEvent({
    accountId: repo.accountId,
    repoId: repo.id,
    kind: `pull_request.${payload.action}`,
    detail: { number: pr.number, state }
  });
  return { state };
}

export async function handleWebhook(event: string, rawBody: string, signature: string | null) {
  const { webhookSecret } = githubAppConfig();

  if (!webhookSecret) {
    throw new HttpError(503, 'GITHUB_WEBHOOK_SECRET is not configured.');
  }

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    throw new HttpError(401, 'Invalid webhook signature.');
  }

  const payload = JSON.parse(rawBody);

  switch (event) {
    case 'ping':
      return { ok: true };
    case 'installation':
    case 'installation_repositories':
      return handleInstallation(event, payload as InstallationPayload);
    case 'pull_request':
      return handlePullRequest(payload as PullRequestPayload);
    default:
      return { ignored: event };
  }
}
