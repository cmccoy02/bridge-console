import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/runs/route';
import { createApiKey, revokeApiKey } from '@/lib/api-keys';
import { encryptSecret } from '@/lib/crypto';
import { getDb, schema } from '@/lib/db';
import { deriveStatus, ingestRun, reportSchema } from '@/lib/ingest';

import { actionsToken, installTestJwks, stubGitHub, type FakeGitHub } from './helpers';

let github: FakeGitHub;
let accountId = 0;
let apiKey = '';

function sampleReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'bridge-report.v1',
    run: {
      id: 'patch-1795132302201-12263-uoxima',
      status: 'pushed',
      startedAt: '2026-11-19T23:51:42.201Z',
      finishedAt: '2026-11-19T23:51:45.088Z',
      durationMs: 2891
    },
    repository: { fullName: 'acme/local-app', url: 'https://github.com/acme/local-app' },
    ci: { provider: 'local' },
    git: { baseBranch: 'main', branchName: 'bridge/patch-2026-11-19', baseSha: 'abc1234', headSha: 'def5678' },
    config: { path: '/Users/someone/code/app/bridge.config.json', sha256: 'x' },
    artifacts: ['/Users/someone/.bridge/runs/x/log.txt'],
    outcome: {
      dependencySummary: { totalChanged: 2, directChanged: 1, transitiveChanged: 1, byBump: { patch: 2 } },
      dependencyDeltas: [
        { name: 'ms', from: '2.1.1', to: '2.1.3', bump: 'patch', kind: 'direct', scope: 'root' },
        { name: 'debug', from: '4.4.0', to: '4.4.1', bump: 'patch', kind: 'transitive', scope: 'root' }
      ],
      audits: [{ scope: 'root', before: { total: 2, high: 1 }, after: { total: 1, high: 0 } }],
      cooldown: { days: 3, checked: 2, violations: [], unverified: [] },
      scriptSummary: { totals: { scripts: 1, passed: 1, failed: 0 } },
      pullRequest: { status: 'created', url: 'https://github.com/acme/local-app/pull/12' }
    },
    ...overrides
  };
}

beforeAll(async () => {
  await installTestJwks();
  const db = await getDb();
  const [account] = await db.insert(schema.accounts).values({ login: 'acme', type: 'Organization', installationId: 55 }).returning();
  accountId = account.id;
  await db.insert(schema.repos).values({ accountId, githubRepoId: 3003, fullName: 'acme/local-app' });
  apiKey = (await createApiKey(accountId, 'laptop', null)).key;
});

beforeEach(() => {
  github = stubGitHub();
});

describe('run ingestion', () => {
  it('records a local run uploaded with an API key', async () => {
    const result = await ingestRun(apiKey, { report: sampleReport() });

    expect(result.status).toBe('pr_opened');
    expect(result.url).toBe('https://bridge.test/runs/patch-1795132302201-12263-uoxima');

    const db = await getDb();
    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.runId, result.runId));
    expect(run.source).toBe('local');
    expect(run.prNumber).toBe(12);
    expect(run.auditAfter).toEqual({ critical: 0, high: 0, moderate: 0, low: 0, total: 1 });
    expect(JSON.stringify(run.report)).not.toContain('/Users/someone');

    const changes = await db.select().from(schema.packageChanges).where(eq(schema.packageChanges.runId, run.id));
    expect(changes.map((change) => change.name).sort()).toEqual(['debug', 'ms']);

    const [pr] = await db.select().from(schema.pullRequests);
    expect(pr).toMatchObject({ number: 12, state: 'open', lastRunId: run.id });
  });

  it('is idempotent for the same run ID', async () => {
    await ingestRun(apiKey, { report: sampleReport() });
    const db = await getDb();
    const runs = await db.select().from(schema.runs);
    const changes = await db.select().from(schema.packageChanges);
    expect(runs).toHaveLength(1);
    expect(changes).toHaveLength(2);
  });

  it('records a blocked Actions run and posts to Slack', async () => {
    const db = await getDb();
    const [account] = await db
      .insert(schema.accounts)
      .values({
        login: 'acme-gh',
        installationId: 77,
        slackWebhookEncrypted: encryptSecret('https://hooks.slack.com/services/T/B/X')
      })
      .returning();
    await db.insert(schema.repos).values({ accountId: account.id, githubRepoId: 1001, fullName: 'acme/web' });

    const report = sampleReport({
      run: { id: 'patch-actions-1', status: 'failed' },
      repository: { fullName: 'acme/web' },
      ci: { provider: 'github-actions', runUrl: 'https://github.com/acme/web/actions/runs/1' },
      publish: { status: 'blocked', message: 'Release-age cooldown (3 days) blocked axios 1.14.1.' },
      outcome: {
        dependencySummary: { totalChanged: 1, directChanged: 1, transitiveChanged: 0 },
        dependencyDeltas: [{ name: 'axios', from: '1.13.2', to: '1.14.1', bump: 'minor', kind: 'direct' }],
        earlyExit: { code: 'cooldown_block', message: 'Blocked by release-age cooldown' },
        cooldown: { days: 3, checked: 1, violations: [{ name: 'axios', version: '1.14.1' }] }
      }
    });

    const response = await POST(
      new Request('https://bridge.test/api/v1/runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${await actionsToken()}` },
        body: JSON.stringify({ report })
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe('blocked');

    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.runId, 'patch-actions-1'));
    expect(run).toMatchObject({ status: 'blocked', gate: 'cooldown_block', source: 'actions' });
    expect(run.ciRunUrl).toBe('https://github.com/acme/web/actions/runs/1');
    expect(github.slack).toHaveLength(1);
    expect(github.slack[0]).toMatch(/held updates in \*acme\/web\*/);
  });

  it('refuses API-key runs for repositories outside the installation', async () => {
    const report = sampleReport({ run: { id: 'patch-unknown-repo', status: 'pushed' }, repository: { fullName: 'acme/not-installed' } });
    await expect(ingestRun(apiKey, { report })).rejects.toMatchObject({ status: 403 });
  });

  it('rejects bad input and bad credentials', async () => {
    await expect(ingestRun(apiKey, { report: { nope: true } })).rejects.toMatchObject({ status: 422 });
    await expect(ingestRun('brk_unknown', { report: sampleReport() })).rejects.toMatchObject({ status: 401 });
    await expect(ingestRun('', { report: sampleReport() })).rejects.toMatchObject({ status: 401 });

    const db = await getDb();
    const [other] = await db.insert(schema.accounts).values({ login: 'other' }).returning();
    const otherKey = (await createApiKey(other.id, 'x', null)).key;
    await expect(ingestRun(otherKey, { report: sampleReport() })).rejects.toMatchObject({ status: 403 });

    const [created] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.accountId, other.id));
    await revokeApiKey(other.id, created.id);
    await expect(ingestRun(otherKey, { report: sampleReport() })).rejects.toMatchObject({ status: 401 });
  });

  it('derives statuses from local and published reports', () => {
    const parse = (value: unknown) => reportSchema.parse(value);
    const base = { run: { id: 'r', status: 'pushed' } };

    expect(deriveStatus(parse({ ...base, outcome: { pullRequest: { status: 'created' } } })).status).toBe('pr_opened');
    expect(deriveStatus(parse({ ...base, outcome: { pullRequest: { status: 'existing', reused: true } } })).status).toBe('pr_unchanged');
    expect(deriveStatus(parse({ run: { id: 'r', status: 'up_to_date' } })).status).toBe('up_to_date');
    expect(
      deriveStatus(parse({ run: { id: 'r', status: 'failed' }, outcome: { earlyExit: { code: 'validation_block' }, failure: { message: 'x' } } }))
    ).toEqual({ status: 'blocked', gate: 'validation_block', message: 'x' });
    expect(deriveStatus(parse({ run: { id: 'r', status: 'failed' }, outcome: { failure: { message: 'npm ci failed' } } })).status).toBe('failed');
    expect(deriveStatus(parse({ run: { id: 'r', status: 'handoff_ready' }, publish: { status: 'updated' } })).status).toBe('pr_updated');
  });
});
