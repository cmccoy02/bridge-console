import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { recordEvent, resolveInstalledRepo } from './accounts';
import { verifyApiKey } from './api-keys';
import { getDb, schema } from './db';
import { oidcAudience, publicUrl, trustedWorkflows } from './env';
import { HttpError } from './http';
import { isTrustedWorkflow, verifyActionsToken } from './oidc';
import { notifyAccount, runMessage } from './slack';

// Ingests bridge-report.v1 documents uploaded by the CLI (`bridge patch` locally with
// an API key, or `bridge publish` in Actions with an OIDC token).

const auditCounts = z.looseObject({
  critical: z.number().optional(),
  high: z.number().optional(),
  moderate: z.number().optional(),
  low: z.number().optional(),
  info: z.number().optional(),
  total: z.number().optional()
});

export const reportSchema = z.looseObject({
  schemaVersion: z.string().optional(),
  run: z.looseObject({
    id: z.string().min(1).max(200),
    status: z.string().max(60),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: z.number().optional(),
    bridgeVersion: z.string().optional()
  }),
  repository: z.looseObject({ fullName: z.string().optional(), url: z.string().optional() }).nullish(),
  ci: z.looseObject({ provider: z.string().optional(), runUrl: z.string().optional() }).nullish(),
  git: z
    .looseObject({
      baseBranch: z.string().optional(),
      branchName: z.string().optional(),
      baseSha: z.string().optional(),
      headSha: z.string().optional()
    })
    .nullish(),
  outcome: z
    .looseObject({
      dependencySummary: z
        .looseObject({
          totalChanged: z.number().optional(),
          directChanged: z.number().optional(),
          transitiveChanged: z.number().optional(),
          byBump: z.record(z.string(), z.number()).optional()
        })
        .nullish(),
      dependencyDeltas: z
        .array(
          z.looseObject({
            name: z.string(),
            from: z.string().nullish(),
            to: z.string().nullish(),
            bump: z.string().optional(),
            kind: z.string().optional(),
            scope: z.string().optional()
          })
        )
        .nullish(),
      audits: z
        .array(z.looseObject({ scope: z.string().optional(), before: auditCounts.nullish(), after: auditCounts.nullish() }))
        .nullish(),
      cooldown: z.looseObject({}).nullish(),
      scriptSummary: z.looseObject({ totals: z.looseObject({}).optional() }).nullish(),
      pullRequest: z
        .looseObject({ status: z.string().optional(), url: z.string().optional(), number: z.number().nullish() })
        .nullish(),
      failure: z.looseObject({ message: z.string().optional() }).nullish(),
      earlyExit: z.looseObject({ code: z.string().optional(), message: z.string().optional() }).nullish()
    })
    .nullish(),
  publish: z
    .looseObject({
      status: z.string().optional(),
      message: z.string().optional(),
      branchName: z.string().optional(),
      headSha: z.string().optional(),
      pullRequest: z
        .looseObject({ status: z.string().optional(), url: z.string().optional(), number: z.number().nullish(), reused: z.boolean().optional() })
        .nullish()
    })
    .nullish()
});

export type BridgeReport = z.infer<typeof reportSchema>;

const GATE_CODES = new Set([
  'policy_block',
  'audit_block',
  'bundle_block',
  'validation_block',
  'cooldown_block',
  'pr_lookup_failed'
]);

function sumAudits(audits: unknown, side: 'before' | 'after') {
  const totals = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
  let seen = false;

  for (const entry of (audits || []) as Array<Record<string, Record<string, number> | null | undefined>>) {
    const counts = entry?.[side];

    if (!counts) {
      continue;
    }

    seen = true;

    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] += Number(counts[key]) || 0;
    }
  }

  return seen ? totals : null;
}

function pullRequestNumber(url?: string | null): number | null {
  const match = String(url || '').match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function toDate(value?: string): Date | null {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function deriveStatus(report: BridgeReport): { status: string; gate: string | null; message: string | null } {
  const publish = report.publish;
  const outcome = report.outcome;
  const earlyCode = outcome?.earlyExit?.code || '';
  const gate = GATE_CODES.has(earlyCode) ? earlyCode : null;
  const failureMessage = outcome?.failure?.message || null;

  if (publish?.status) {
    switch (publish.status) {
      case 'created':
      case 'pushed':
        return { status: 'pr_opened', gate: null, message: publish.message || null };
      case 'updated':
        return { status: 'pr_updated', gate: null, message: null };
      case 'reused':
        return { status: 'pr_unchanged', gate: null, message: null };
      case 'up_to_date':
        return { status: 'up_to_date', gate: null, message: null };
      case 'blocked':
        return { status: 'blocked', gate, message: publish.message || failureMessage };
      default:
        return { status: 'failed', gate, message: publish.message || failureMessage };
    }
  }

  const pr = outcome?.pullRequest;

  switch (report.run.status) {
    case 'pushed':
      if (pr?.status === 'created') return { status: 'pr_opened', gate: null, message: null };
      if (pr?.status === 'existing' && (pr as { reused?: boolean }).reused) return { status: 'pr_unchanged', gate: null, message: null };
      if (pr?.status === 'existing') return { status: 'pr_updated', gate: null, message: null };
      return { status: 'pushed', gate: null, message: pr?.status ? `Branch pushed; pull request ${pr.status}` : null };
    case 'up_to_date':
      return { status: 'up_to_date', gate: null, message: null };
    case 'dry_run':
      return { status: 'dry_run', gate: null, message: null };
    case 'handoff_ready':
      return { status: 'pending_publish', gate: null, message: null };
    case 'cancelled':
      return { status: 'cancelled', gate: null, message: failureMessage };
    default:
      return gate
        ? { status: 'blocked', gate, message: failureMessage || outcome?.earlyExit?.message || null }
        : { status: 'failed', gate: null, message: failureMessage };
  }
}

/** Removes fields that only make sense on the machine that ran Bridge (home paths). */
function sanitizeReport(report: BridgeReport): BridgeReport {
  const copy = structuredClone(report) as Record<string, unknown>;
  delete copy.artifacts;
  delete copy.agentEventStream;

  if (copy.config && typeof copy.config === 'object') {
    delete (copy.config as Record<string, unknown>).path;
  }

  return copy as BridgeReport;
}

export function runUrl(runId: string): string {
  return `${publicUrl()}/runs/${encodeURIComponent(runId)}`;
}

async function resolveUploader(bearer: string, report: BridgeReport) {
  if (!bearer) {
    throw new HttpError(401, 'Missing bearer token (API key or GitHub Actions OIDC token).');
  }

  const db = await getDb();

  if (bearer.startsWith('brk_')) {
    const key = await verifyApiKey(bearer);

    if (!key) {
      throw new HttpError(401, 'Unknown or revoked API key.');
    }

    const fullName = String(report.repository?.fullName || '').trim();

    if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
      throw new HttpError(
        422,
        'The report does not name a GitHub repository (report.repository.fullName). Run Bridge in a clone whose origin is on GitHub.'
      );
    }

    const [existing] = await db
      .select()
      .from(schema.repos)
      .where(sql`lower(${schema.repos.fullName}) = lower(${fullName})`)
      .limit(1);

    if (existing && existing.accountId !== key.accountId) {
      throw new HttpError(403, `${fullName} belongs to a different Bridge account.`);
    }

    const repo =
      existing ||
      (
        await db
          .insert(schema.repos)
          .values({ accountId: key.accountId, fullName, private: true })
          .returning()
      )[0];
    return { accountId: key.accountId, repo, source: 'local' as const };
  }

  const identity = await verifyActionsToken(bearer, oidcAudience());

  if (!isTrustedWorkflow(identity.jobWorkflowRef, trustedWorkflows())) {
    throw new HttpError(403, `Runs are only accepted from Bridge's workflow, not ${identity.jobWorkflowRef}.`);
  }

  const { account, repo } = await resolveInstalledRepo(identity);
  return { accountId: account.id, repo, source: 'actions' as const };
}

export async function ingestRun(bearer: string, body: unknown) {
  const parsed = reportSchema.safeParse((body as { report?: unknown })?.report);

  if (!parsed.success) {
    throw new HttpError(422, `Not a Bridge run report: ${parsed.error.issues[0]?.message || 'invalid'}`);
  }

  const report = sanitizeReport(parsed.data);
  const { accountId, repo, source } = await resolveUploader(bearer, report);
  return storeRun({ accountId, repo, report, source });
}

/** Persists a validated report for a known repository. */
export async function storeRun({
  accountId,
  repo,
  report,
  source,
  notify = true,
  createdAt
}: {
  accountId: number;
  repo: typeof schema.repos.$inferSelect;
  report: BridgeReport;
  source: 'actions' | 'local';
  notify?: boolean;
  createdAt?: Date;
}) {
  const db = await getDb();
  const derived = deriveStatus(report);
  const outcome = report.outcome || {};
  const summary = outcome.dependencySummary || {};
  const pr = report.publish?.pullRequest || outcome.pullRequest || null;
  const prUrl = pr?.url || null;
  const prNumber = (pr?.number ?? null) || pullRequestNumber(prUrl);
  const runId = report.run.id;

  const [existingRun] = await db.select().from(schema.runs).where(eq(schema.runs.runId, runId)).limit(1);

  if (existingRun && existingRun.repoId !== repo.id) {
    throw new HttpError(409, `Run ${runId} already belongs to a different repository.`);
  }

  const values = {
    repoId: repo.id,
    runId,
    source: report.ci?.provider === 'github-actions' ? 'actions' : source,
    status: derived.status,
    gate: derived.gate,
    message: derived.message ? derived.message.slice(0, 2000) : null,
    startedAt: toDate(report.run.startedAt),
    finishedAt: toDate(report.run.finishedAt),
    durationMs: typeof report.run.durationMs === 'number' ? Math.round(report.run.durationMs) : null,
    bridgeVersion: report.run.bridgeVersion || null,
    baseBranch: report.git?.baseBranch || null,
    branchName: report.publish?.branchName || report.git?.branchName || null,
    baseSha: report.git?.baseSha || null,
    headSha: report.publish?.headSha || report.git?.headSha || null,
    directChanged: summary.directChanged || 0,
    transitiveChanged: summary.transitiveChanged || 0,
    totalChanged: summary.totalChanged || 0,
    byBump: summary.byBump || null,
    auditBefore: sumAudits(outcome.audits, 'before'),
    auditAfter: sumAudits(outcome.audits, 'after'),
    cooldown: (outcome.cooldown as object) || null,
    checks: (outcome.scriptSummary?.totals as object) || null,
    prNumber,
    prUrl,
    ciRunUrl: report.ci?.runUrl || null,
    report: report as object,
    ...(createdAt ? { createdAt } : {})
  };

  const [run] = existingRun
    ? await db.update(schema.runs).set(values).where(eq(schema.runs.id, existingRun.id)).returning()
    : await db.insert(schema.runs).values(values).returning();

  await db.delete(schema.packageChanges).where(eq(schema.packageChanges.runId, run.id));
  const deltas = (outcome.dependencyDeltas || []).slice(0, 5000);

  for (let index = 0; index < deltas.length; index += 500) {
    await db.insert(schema.packageChanges).values(
      deltas.slice(index, index + 500).map((delta) => ({
        runId: run.id,
        scope: delta.scope || 'root',
        name: delta.name,
        fromVersion: delta.from ?? null,
        toVersion: delta.to ?? null,
        bump: delta.bump || 'other',
        kind: delta.kind || 'transitive'
      }))
    );
  }

  if (prNumber && prUrl) {
    const [existingPr] = await db
      .select()
      .from(schema.pullRequests)
      .where(and(eq(schema.pullRequests.repoId, repo.id), eq(schema.pullRequests.number, prNumber)))
      .limit(1);

    if (existingPr) {
      await db
        .update(schema.pullRequests)
        .set({ lastRunId: run.id, updatedAt: new Date(), headRef: values.branchName || existingPr.headRef })
        .where(eq(schema.pullRequests.id, existingPr.id));
    } else {
      await db.insert(schema.pullRequests).values({
        repoId: repo.id,
        number: prNumber,
        url: prUrl,
        title: 'bridge: update dependencies (non-breaking)',
        headRef: values.branchName,
        state: 'open',
        openedAt: values.finishedAt || new Date(),
        lastRunId: run.id
      });
    }
  }

  await db
    .update(schema.repos)
    .set({ lastRunAt: values.finishedAt || new Date(), lastStatus: derived.status })
    .where(eq(schema.repos.id, repo.id));
  await recordEvent({ accountId, repoId: repo.id, kind: 'run_ingested', detail: { runId, status: derived.status } });

  const text = runMessage({
    repo: repo.fullName,
    status: derived.status,
    direct: values.directChanged,
    transitive: values.transitiveChanged,
    prUrl,
    prNumber,
    message: derived.message,
    runUrl: runUrl(runId)
  });

  if (notify && text && !existingRun) {
    await notifyAccount(accountId, text);
  }

  return { id: run.id, runId, status: derived.status, url: runUrl(runId) };
}
