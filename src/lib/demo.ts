import { count, eq } from 'drizzle-orm';

import { getDb, schema } from './db';
import { storeRun, type BridgeReport } from './ingest';

// Demo data for local development, created on first "Continue as local developer".
// Every number here is made up; it only exists so the pages have something to show.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface DemoRun {
  repo: string;
  ageMs: number;
  status: string;
  publish?: BridgeReport['publish'];
  earlyExit?: { code: string; message: string };
  failure?: string;
  failingCheck?: boolean;
  checksRan?: boolean;
  deltas: Array<{ name: string; from: string; to: string; bump: string; kind: string }>;
  cooldown?: { violations: Array<{ name: string; version: string; ageHours: number }> };
  auditAfter?: { critical: number; high: number; moderate: number; low: number; total: number };
}

function report(run: DemoRun, index: number): BridgeReport {
  const finished = new Date(Date.now() - run.ageMs);
  const started = new Date(finished.getTime() - (4 + (index % 5)) * 60 * 1000);
  const direct = run.deltas.filter((delta) => delta.kind === 'direct').length;
  const violations = (run.cooldown?.violations || []).map((entry) => ({
    scope: 'root',
    name: entry.name,
    version: entry.version,
    kind: 'transitive',
    ageHours: entry.ageHours,
    publishedAt: new Date(finished.getTime() - entry.ageHours * HOUR).toISOString(),
    eligibleAt: new Date(finished.getTime() - entry.ageHours * HOUR + 3 * DAY).toISOString()
  }));
  const audit = run.auditAfter || { critical: 0, high: 0, moderate: 1, low: 2, total: 3 };

  return {
    schemaVersion: 'bridge-report.v1',
    run: {
      id: `demo-${run.repo.replace('/', '-')}-${index}`,
      status: run.status,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      bridgeVersion: '0.2.0'
    },
    repository: { fullName: run.repo, url: `https://github.com/${run.repo}` },
    ci: {
      provider: 'github-actions',
      runUrl: `https://github.com/${run.repo}/actions/runs/${9000000 + index}`
    },
    environment: { nodeVersion: 'v24.11.0', packageManager: 'npm', packageManagerVersion: '11.12.1' },
    git: {
      baseBranch: 'main',
      branchName: run.publish?.branchName || `bridge/patch-${finished.toISOString().slice(0, 10)}`,
      baseSha: '9f1c2e7a4b5d6c8e0f1a2b3c4d5e6f7a8b9c0d1e',
      headSha: ''
    },
    outcome: {
      dependencySummary: {
        totalChanged: run.deltas.length,
        directChanged: direct,
        transitiveChanged: run.deltas.length - direct,
        byBump: {
          patch: run.deltas.filter((delta) => delta.bump === 'patch').length,
          minor: run.deltas.filter((delta) => delta.bump === 'minor').length,
          major: 0,
          other: 0
        }
      },
      dependencyDeltas: run.deltas.map((delta) => ({ ...delta, scope: 'root' })),
      audits: [{ scope: 'root', before: audit, after: audit }],
      cooldown: {
        days: 3,
        checked: run.deltas.length,
        passed: run.deltas.length - violations.length,
        violations,
        unverified: [],
        excluded: [],
        native: [{ scope: 'root', manager: 'npm', applied: true, reason: 'npm 11.12.1 enforces min-release-age=3 days' }]
      },
      scriptSummary:
        run.checksRan === false
          ? { totals: { scripts: 0, passed: 0, failed: 0 }, scripts: [] }
          : {
              totals: { scripts: 4, passed: run.failingCheck ? 3 : 4, failed: run.failingCheck ? 1 : 0 },
              scripts: ['npm run typecheck', 'npm run lint', 'npm test', 'npm run build'].map((command, scriptIndex) => ({
                scope: 'root',
                command,
                result: run.failingCheck && scriptIndex === 2 ? 'fail' : 'pass',
                failureKind: run.failingCheck && scriptIndex === 2 ? 'new' : null,
                durationMs: [21000, 9000, 64000, 48000][scriptIndex]
              }))
            },
      gateDecisions:
        run.checksRan === false
          ? []
          : [
              { gate: 'audit', scope: 'root', passed: true, reason: 'No blocking severity increases' },
              {
                gate: 'validation',
                scope: 'root',
                passed: !run.failingCheck,
                reason: run.failingCheck ? '1 new failure: npm test' : 'All scripts passed'
              }
            ],
      earlyExit: run.earlyExit || null,
      failure: run.failure ? { message: run.failure } : run.earlyExit ? { message: run.earlyExit.message } : null
    },
    publish: run.publish || null
  } as BridgeReport;
}

const WEB_DELTAS = [
  { name: 'react-router', from: '7.9.1', to: '7.9.4', bump: 'patch', kind: 'direct' },
  { name: 'zod', from: '4.6.2', to: '4.6.7', bump: 'patch', kind: 'direct' },
  { name: '@sentry/react', from: '10.18.0', to: '10.21.0', bump: 'minor', kind: 'direct' },
  { name: 'postcss', from: '8.5.6', to: '8.5.9', bump: 'patch', kind: 'transitive' },
  { name: 'nanoid', from: '3.3.11', to: '3.3.12', bump: 'patch', kind: 'transitive' },
  { name: 'picomatch', from: '4.0.2', to: '4.0.3', bump: 'patch', kind: 'transitive' },
  { name: 'brace-expansion', from: '2.0.1', to: '2.0.2', bump: 'patch', kind: 'transitive' },
  { name: 'semver', from: '7.7.2', to: '7.7.3', bump: 'patch', kind: 'transitive' }
];

const DEMO_RUNS: DemoRun[] = [
  {
    repo: 'acme-demo/payments',
    ageMs: 8 * DAY,
    status: 'handoff_ready',
    publish: {
      status: 'created',
      branchName: 'bridge/patch-demo-payments',
      pullRequest: { status: 'created', url: 'https://github.com/acme-demo/payments/pull/88', number: 88 }
    },
    deltas: WEB_DELTAS.slice(3)
  },
  {
    repo: 'acme-demo/admin',
    ageMs: 3 * DAY,
    status: 'failed',
    earlyExit: { code: 'validation_block', message: 'Blocked by validation script failure' },
    failure: 'Validation found 1 new failure after the update: npm test (2 new error lines).',
    failingCheck: true,
    deltas: WEB_DELTAS.slice(0, 5)
  },
  { repo: 'acme-demo/mobile', ageMs: 26 * HOUR, status: 'up_to_date', publish: { status: 'up_to_date' }, deltas: [] },
  {
    repo: 'acme-demo/api',
    ageMs: 5 * HOUR,
    status: 'failed',
    earlyExit: { code: 'cooldown_block', message: 'Blocked by release-age cooldown (versions too new)' },
    failure:
      'Release-age cooldown (3 days) blocked 1 version in root: axios 1.14.1 (published 5h ago, eligible in 3 days). Bridge will propose it once it has been public long enough.',
    publish: { status: 'blocked', message: 'Release-age cooldown (3 days) blocked axios 1.14.1.' },
    checksRan: false,
    cooldown: { violations: [{ name: 'axios', version: '1.14.1', ageHours: 5 }] },
    deltas: [
      { name: 'axios', from: '1.13.2', to: '1.14.1', bump: 'minor', kind: 'direct' },
      { name: 'follow-redirects', from: '1.15.9', to: '1.15.11', bump: 'patch', kind: 'transitive' }
    ]
  },
  {
    repo: 'acme-demo/web',
    ageMs: 2 * HOUR,
    status: 'handoff_ready',
    publish: {
      status: 'created',
      branchName: 'bridge/patch-demo-web',
      pullRequest: { status: 'created', url: 'https://github.com/acme-demo/web/pull/142', number: 142 }
    },
    deltas: WEB_DELTAS
  }
];

export async function seedDemoData() {
  const db = await getDb();
  const [{ value: existing }] = await db.select({ value: count() }).from(schema.accounts);

  if (existing > 0) {
    return false;
  }

  const [account] = await db.insert(schema.accounts).values({ login: 'acme-demo', type: 'Organization' }).returning();
  const repoIds = new Map<string, typeof schema.repos.$inferSelect>();

  for (const name of ['web', 'api', 'mobile', 'payments', 'admin']) {
    const [repo] = await db
      .insert(schema.repos)
      .values({ accountId: account.id, fullName: `acme-demo/${name}`, private: true, defaultBranch: 'main' })
      .returning();
    repoIds.set(repo.fullName, repo);
  }

  for (const [index, run] of DEMO_RUNS.entries()) {
    const repo = repoIds.get(run.repo)!;
    await storeRun({
      accountId: account.id,
      repo,
      report: report(run, index),
      source: 'actions',
      notify: false,
      createdAt: new Date(Date.now() - run.ageMs)
    });
  }

  await db
    .update(schema.pullRequests)
    .set({ state: 'merged', mergedAt: new Date(Date.now() - 7 * DAY), mergedBy: 'jordan-acme' })
    .where(eq(schema.pullRequests.number, 88));
  return true;
}
