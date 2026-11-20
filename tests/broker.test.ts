import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/github/token/route';
import { getDb, schema } from '@/lib/db';
import { issueRepositoryToken } from '@/lib/broker';
import { resetBotIdentityCache } from '@/lib/github-app';

import { actionsToken, installTestJwks, stubGitHub, type FakeGitHub } from './helpers';

let github: FakeGitHub;

beforeAll(async () => {
  await installTestJwks();
});

beforeEach(() => {
  github = stubGitHub();
  resetBotIdentityCache();
});

describe('token broker', () => {
  it('issues a one-repo token to Bridge’s publish workflow', async () => {
    const result = await issueRepositoryToken(await actionsToken(), 'acme/web');

    expect(result.token).toBe('ghs_test_installation_token');
    expect(result.repository).toBe('acme/web');
    expect(result.commitAuthor).toEqual({
      name: 'bridge-test[bot]',
      email: '4242+bridge-test[bot]@users.noreply.github.com'
    });

    const tokenCall = github.calls.find((call) => call.url.endsWith('/app/installations/77/access_tokens'));
    expect(tokenCall?.body).toEqual({
      repository_ids: [1001],
      permissions: { contents: 'write', pull_requests: 'write' }
    });
    expect(tokenCall?.authorization).toMatch(/^Bearer ey/);

    const db = await getDb();
    const [repo] = await db.select().from(schema.repos);
    expect(repo.fullName).toBe('acme/web');
    const events = await db.select().from(schema.events);
    expect(events.some((event) => event.kind === 'token_issued')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('ghs_test_installation_token');
  });

  it('refuses workflows other than Bridge’s', async () => {
    const token = await actionsToken({ job_workflow_ref: 'acme/web/.github/workflows/anything.yml@refs/heads/main' });
    await expect(issueRepositoryToken(token)).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a token minted for another audience', async () => {
    const token = await actionsToken({}, { audience: 'https://someone-else.example' });
    await expect(issueRepositoryToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses an expired token', async () => {
    const token = await actionsToken({}, { expiresIn: '-10m' });
    await expect(issueRepositoryToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a token for a different repository than requested', async () => {
    await expect(issueRepositoryToken(await actionsToken(), 'acme/other')).rejects.toMatchObject({ status: 403 });
  });

  it('explains when the GitHub App is not installed', async () => {
    const token = await actionsToken({ repository: 'acme/not-installed', repository_id: '2002' });
    await expect(issueRepositoryToken(token)).rejects.toThrow(/not installed on acme\/not-installed/);
  });

  it('serves the route over HTTP', async () => {
    const response = await POST(
      new Request('https://bridge.test/api/v1/github/token', {
        method: 'POST',
        headers: { authorization: `Bearer ${await actionsToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ repository: 'acme/web' })
      })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe('ghs_test_installation_token');

    const unauthenticated = await POST(new Request('https://bridge.test/api/v1/github/token', { method: 'POST' }));
    expect(unauthenticated.status).toBe(401);
  });
});
