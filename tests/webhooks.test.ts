import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/github/webhooks/route';
import { encryptSecret } from '@/lib/crypto';
import { getDb, schema } from '@/lib/db';

import { stubGitHub, type FakeGitHub } from './helpers';

let github: FakeGitHub;

function deliver(event: string, payload: unknown, secret = 'webhook-secret') {
  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  return POST(
    new Request('https://bridge.test/api/github/webhooks', {
      method: 'POST',
      headers: { 'x-github-event': event, 'x-hub-signature-256': signature },
      body
    })
  );
}

const installation = { id: 77, account: { id: 9, login: 'acme', type: 'Organization' } };

beforeEach(() => {
  github = stubGitHub();
});

describe('GitHub webhooks', () => {
  it('rejects deliveries with a bad signature', async () => {
    const response = await deliver('ping', { zen: 'hi' }, 'wrong-secret');
    expect(response.status).toBe(401);
  });

  it('records an installation and its repositories', async () => {
    const response = await deliver('installation', {
      action: 'created',
      installation,
      repositories: [
        { id: 1001, full_name: 'acme/web', private: true },
        { id: 1002, full_name: 'acme/api', private: true }
      ]
    });
    expect(response.status).toBe(200);

    const db = await getDb();
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.installationId, 77));
    expect(account.login).toBe('acme');
    const repos = await db.select().from(schema.repos).where(eq(schema.repos.accountId, account.id));
    expect(repos.map((repo) => repo.fullName).sort()).toEqual(['acme/api', 'acme/web']);

    await deliver('installation_repositories', {
      action: 'removed',
      installation,
      repositories_removed: [{ id: 1002, full_name: 'acme/api', private: true }]
    });
    const [api] = await db.select().from(schema.repos).where(eq(schema.repos.githubRepoId, 1002));
    expect(api.removedAt).not.toBeNull();
  });

  it('tracks Bridge pull requests through merge and tells Slack', async () => {
    const db = await getDb();
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.installationId, 77));
    await db
      .update(schema.accounts)
      .set({ slackWebhookEncrypted: encryptSecret('https://hooks.slack.com/services/T/B/X') })
      .where(eq(schema.accounts.id, account.id));

    const pullRequest = {
      number: 12,
      html_url: 'https://github.com/acme/web/pull/12',
      title: 'bridge: update dependencies (non-breaking)',
      state: 'open',
      merged: false,
      merged_at: null,
      closed_at: null,
      created_at: '2026-11-19T10:00:00Z',
      head: { ref: 'bridge/patch-2026-11-19' },
      user: { login: 'bridge-test[bot]' }
    };
    const repository = { id: 1001, full_name: 'acme/web', private: true };

    await deliver('pull_request', { action: 'opened', installation, repository, pull_request: pullRequest });
    await deliver('pull_request', {
      action: 'closed',
      installation,
      repository,
      pull_request: {
        ...pullRequest,
        state: 'closed',
        merged: true,
        merged_at: '2026-11-19T12:00:00Z',
        closed_at: '2026-11-19T12:00:00Z',
        merged_by: { login: 'jordan' }
      }
    });

    const [pr] = await db.select().from(schema.pullRequests).where(eq(schema.pullRequests.number, 12));
    expect(pr).toMatchObject({ state: 'merged', mergedBy: 'jordan' });
    expect(github.slack.some((text) => text.includes('merged in *acme/web* by jordan'))).toBe(true);
  });

  it('ignores pull requests Bridge did not open', async () => {
    const response = await deliver('pull_request', {
      action: 'opened',
      installation,
      repository: { id: 1001, full_name: 'acme/web', private: true },
      pull_request: {
        number: 99,
        html_url: 'https://github.com/acme/web/pull/99',
        title: 'Add feature',
        state: 'open',
        merged: false,
        merged_at: null,
        closed_at: null,
        created_at: '2026-11-19T10:00:00Z',
        head: { ref: 'feature/x' },
        user: { login: 'someone' }
      }
    });
    expect((await response.json()).ignored).toBeTruthy();
  });
});
