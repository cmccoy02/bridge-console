import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, schema } from './db';

// Read models for the console pages. Every query is scoped to the accounts the
// signed-in user belongs to.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function accountsForUser(userId: number) {
  const db = await getDb();
  return db
    .select({ account: schema.accounts, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.memberships.accountId))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(schema.accounts.login);
}

export async function accountIdsForUser(userId: number): Promise<number[]> {
  return (await accountsForUser(userId)).map((entry) => entry.account.id);
}

export async function reposForUser(userId: number) {
  const accountIds = await accountIdsForUser(userId);

  if (accountIds.length === 0) {
    return [];
  }

  const db = await getDb();
  const repos = await db
    .select()
    .from(schema.repos)
    .where(and(inArray(schema.repos.accountId, accountIds), isNull(schema.repos.removedAt)))
    .orderBy(desc(schema.repos.lastRunAt), schema.repos.fullName);

  if (repos.length === 0) {
    return [];
  }

  const repoIds = repos.map((repo) => repo.id);
  const since = new Date(Date.now() - 30 * DAY_MS);
  const latestRuns = await db
    .selectDistinctOn([schema.runs.repoId])
    .from(schema.runs)
    .where(inArray(schema.runs.repoId, repoIds))
    .orderBy(schema.runs.repoId, desc(schema.runs.createdAt));
  const openPrs = await db
    .select()
    .from(schema.pullRequests)
    .where(and(inArray(schema.pullRequests.repoId, repoIds), eq(schema.pullRequests.state, 'open')))
    .orderBy(desc(schema.pullRequests.number));
  const merged = await db
    .select({ repoId: schema.pullRequests.repoId, count: sql<number>`count(*)::int` })
    .from(schema.pullRequests)
    .where(
      and(
        inArray(schema.pullRequests.repoId, repoIds),
        eq(schema.pullRequests.state, 'merged'),
        gte(schema.pullRequests.mergedAt, since)
      )
    )
    .groupBy(schema.pullRequests.repoId);

  return repos.map((repo) => ({
    repo,
    lastRun: latestRuns.find((run) => run.repoId === repo.id) || null,
    openPr: openPrs.find((pr) => pr.repoId === repo.id) || null,
    merged30: merged.find((row) => row.repoId === repo.id)?.count || 0
  }));
}

export async function summaryForUser(userId: number) {
  const accountIds = await accountIdsForUser(userId);
  const empty = { repos: 0, prsMerged: 0, packagesUpdated: 0, runs: 0, held: 0, openPrs: 0 };

  if (accountIds.length === 0) {
    return empty;
  }

  const db = await getDb();
  const since = new Date(Date.now() - 30 * DAY_MS);
  const repoRows = await db
    .select({ id: schema.repos.id })
    .from(schema.repos)
    .where(and(inArray(schema.repos.accountId, accountIds), isNull(schema.repos.removedAt)));
  const repoIds = repoRows.map((row) => row.id);

  if (repoIds.length === 0) {
    return empty;
  }

  const [runStats] = await db
    .select({
      runs: sql<number>`count(*)::int`,
      held: sql<number>`count(*) filter (where ${schema.runs.status} = 'blocked')::int`
    })
    .from(schema.runs)
    .where(and(inArray(schema.runs.repoId, repoIds), gte(schema.runs.createdAt, since)));
  const [prStats] = await db
    .select({
      merged: sql<number>`count(*) filter (where ${schema.pullRequests.state} = 'merged' and ${schema.pullRequests.mergedAt} >= ${since})::int`,
      open: sql<number>`count(*) filter (where ${schema.pullRequests.state} = 'open')::int`
    })
    .from(schema.pullRequests)
    .where(inArray(schema.pullRequests.repoId, repoIds));
  // Packages that reached the default branch: changes in runs whose PR was merged.
  const [packageStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.packageChanges)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.packageChanges.runId))
    .innerJoin(
      schema.pullRequests,
      and(eq(schema.pullRequests.repoId, schema.runs.repoId), eq(schema.pullRequests.number, schema.runs.prNumber))
    )
    .where(
      and(
        inArray(schema.runs.repoId, repoIds),
        eq(schema.pullRequests.state, 'merged'),
        gte(schema.pullRequests.mergedAt, since),
        eq(schema.pullRequests.lastRunId, schema.runs.id)
      )
    );

  return {
    repos: repoIds.length,
    prsMerged: prStats?.merged || 0,
    openPrs: prStats?.open || 0,
    packagesUpdated: packageStats?.count || 0,
    runs: runStats?.runs || 0,
    held: runStats?.held || 0
  };
}

export async function runsForUser(
  userId: number,
  { status = '', repoId = 0, limit = 100 }: { status?: string; repoId?: number; limit?: number } = {}
) {
  const accountIds = await accountIdsForUser(userId);

  if (accountIds.length === 0) {
    return [];
  }

  const db = await getDb();
  const conditions = [inArray(schema.repos.accountId, accountIds)];

  if (status) {
    conditions.push(eq(schema.runs.status, status));
  }

  if (repoId) {
    conditions.push(eq(schema.runs.repoId, repoId));
  }

  return db
    .select({
      run: {
        id: schema.runs.id,
        runId: schema.runs.runId,
        status: schema.runs.status,
        gate: schema.runs.gate,
        message: schema.runs.message,
        source: schema.runs.source,
        finishedAt: schema.runs.finishedAt,
        createdAt: schema.runs.createdAt,
        durationMs: schema.runs.durationMs,
        directChanged: schema.runs.directChanged,
        transitiveChanged: schema.runs.transitiveChanged,
        totalChanged: schema.runs.totalChanged,
        prNumber: schema.runs.prNumber,
        prUrl: schema.runs.prUrl,
        cooldown: schema.runs.cooldown,
        checks: schema.runs.checks
      },
      repo: { id: schema.repos.id, fullName: schema.repos.fullName }
    })
    .from(schema.runs)
    .innerJoin(schema.repos, eq(schema.repos.id, schema.runs.repoId))
    .where(and(...conditions))
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit);
}

export async function runDetailForUser(userId: number, runId: string) {
  const accountIds = await accountIdsForUser(userId);

  if (accountIds.length === 0) {
    return null;
  }

  const db = await getDb();
  const [row] = await db
    .select({ run: schema.runs, repo: schema.repos })
    .from(schema.runs)
    .innerJoin(schema.repos, eq(schema.repos.id, schema.runs.repoId))
    .where(and(eq(schema.runs.runId, runId), inArray(schema.repos.accountId, accountIds)))
    .limit(1);

  if (!row) {
    return null;
  }

  const changes = await db
    .select()
    .from(schema.packageChanges)
    .where(eq(schema.packageChanges.runId, row.run.id))
    .orderBy(schema.packageChanges.kind, schema.packageChanges.name);
  const [pullRequest] = row.run.prNumber
    ? await db
        .select()
        .from(schema.pullRequests)
        .where(and(eq(schema.pullRequests.repoId, row.repo.id), eq(schema.pullRequests.number, row.run.prNumber)))
        .limit(1)
    : [];

  return { ...row, changes, pullRequest: pullRequest || null };
}

export async function repoDetailForUser(userId: number, fullName: string) {
  const accountIds = await accountIdsForUser(userId);

  if (accountIds.length === 0) {
    return null;
  }

  const db = await getDb();
  const [repo] = await db
    .select()
    .from(schema.repos)
    .where(and(sql`lower(${schema.repos.fullName}) = lower(${fullName})`, inArray(schema.repos.accountId, accountIds)))
    .limit(1);

  if (!repo) {
    return null;
  }

  const pullRequests = await db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.repoId, repo.id))
    .orderBy(desc(schema.pullRequests.number))
    .limit(20);
  const runs = await runsForUser(userId, { repoId: repo.id, limit: 50 });
  return { repo, pullRequests, runs };
}

export async function apiKeysForAccounts(accountIds: number[]) {
  if (accountIds.length === 0) {
    return [];
  }

  const db = await getDb();
  return db
    .select()
    .from(schema.apiKeys)
    .where(and(inArray(schema.apiKeys.accountId, accountIds), isNull(schema.apiKeys.revokedAt)))
    .orderBy(desc(schema.apiKeys.createdAt));
}
