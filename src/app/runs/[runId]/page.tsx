import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Shell } from '@/components/Shell';
import { StatusLabel } from '@/components/Status';
import { duration, GATE_LABELS, plural, timeAgo } from '@/lib/format';
import { runDetailForUser } from '@/lib/queries';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface CooldownVersion {
  scope?: string;
  name: string;
  version: string;
  publishedAt?: string;
  eligibleAt?: string;
  ageHours?: number;
  reason?: string;
}

interface CooldownSummary {
  days?: number;
  checked?: number;
  violations?: CooldownVersion[];
  unverified?: CooldownVersion[];
  excluded?: CooldownVersion[];
  native?: Array<{ scope?: string; applied?: boolean; reason?: string }>;
}

interface AuditTotals {
  critical?: number;
  high?: number;
  moderate?: number;
  low?: number;
  total?: number;
}

interface GateDecision {
  gate: string;
  scope?: string;
  passed: boolean;
  reason?: string;
}

interface ScriptRow {
  scope?: string;
  name?: string;
  command?: string;
  result?: string;
  durationMs?: number;
  failureKind?: string | null;
}

const GATE_NAMES: Record<string, string> = {
  validation: 'Your checks',
  bundle: 'Bundle size',
  audit: 'Security audit'
};

function headline(status: string, direct: number, transitive: number, prNumber: number | null): string {
  const changes = `${plural(direct, 'direct')} and ${transitive} transitive ${transitive === 1 ? 'update' : 'updates'}`;

  switch (status) {
    case 'pr_opened':
      return `Opened pull request #${prNumber} with ${changes}. Every check that passed before the update still passes.`;
    case 'pr_updated':
      return `Refreshed pull request #${prNumber} with ${changes}.`;
    case 'pr_unchanged':
      return `The open pull request already had these changes, so nothing was pushed.`;
    case 'up_to_date':
      return 'Every dependency was already at its newest safe version.';
    case 'blocked':
      return 'Bridge held this update back. Nothing was pushed.';
    case 'failed':
      return 'The run stopped before pushing anything.';
    case 'pending_publish':
      return 'Validated. Waiting for the publish job to push and open the pull request.';
    default:
      return '';
  }
}

function auditLine(totals: AuditTotals | null) {
  if (!totals) return '—';
  const serious = (totals.critical || 0) + (totals.high || 0);
  return `${totals.total || 0}${serious ? ` (${serious} critical or high)` : ''}`;
}

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const detail = await runDetailForUser(user.id, decodeURIComponent(runId));

  if (!detail) {
    notFound();
  }

  const { run, repo, changes, pullRequest } = detail;
  const report = (run.report || {}) as {
    outcome?: { gateDecisions?: GateDecision[]; scriptSummary?: { scripts?: ScriptRow[] } };
    environment?: { nodeVersion?: string; packageManager?: string; packageManagerVersion?: string };
  };
  const cooldown = (run.cooldown || null) as CooldownSummary | null;
  const gates = report.outcome?.gateDecisions || [];
  const scripts = report.outcome?.scriptSummary?.scripts || [];
  const direct = changes.filter((change) => change.kind === 'direct');
  const transitive = changes.filter((change) => change.kind !== 'direct');
  const auditBefore = run.auditBefore as AuditTotals | null;
  const auditAfter = run.auditAfter as AuditTotals | null;

  return (
    <Shell user={user} active="/ledger">
      <p className="text-sm">
        <Link href={`/repos/${repo.fullName}`}>{repo.fullName}</Link>
      </p>
      <h1 className="mt-1">
        <StatusLabel status={run.status} gate={run.gate} />
      </h1>
      <p className="mt-2 max-w-3xl text-[1.05rem]">{headline(run.status, run.directChanged, run.transitiveChanged, run.prNumber)}</p>

      {(run.status === 'blocked' || run.status === 'failed') && run.message ? (
        <div className={`mt-5 max-w-3xl border-l-4 bg-white px-4 py-3 ${run.status === 'blocked' ? 'border-held' : 'border-failed'}`}>
          {run.gate ? <p className="font-semibold">{GATE_LABELS[run.gate] || run.gate}</p> : null}
          <p className="mt-1">{run.message}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {run.prUrl ? (
          <a href={run.prUrl} className="button">
            Open pull request #{run.prNumber}
          </a>
        ) : null}
        {run.ciRunUrl ? (
          <a href={run.ciRunUrl} className="button button-quiet">
            View workflow run
          </a>
        ) : null}
      </div>
      {pullRequest ? (
        <p className="mt-2 text-sm text-slate">
          Pull request is {pullRequest.state === 'merged' ? `merged${pullRequest.mergedBy ? ` by ${pullRequest.mergedBy}` : ''}` : pullRequest.state}.
        </p>
      ) : null}

      <section className="mt-10">
        <h2>Safety checks</h2>
        <table className="data-table mt-3">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Result</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {cooldown && (cooldown.days || 0) > 0 ? (
              <tr>
                <td>Release-age cooldown ({plural(cooldown.days || 0, 'day')})</td>
                <td className={(cooldown.violations || []).length ? 'font-semibold text-held' : 'text-clear'}>
                  {(cooldown.violations || []).length ? `Held ${plural((cooldown.violations || []).length, 'version')}` : 'Passed'}
                </td>
                <td className="text-slate">
                  {plural(cooldown.checked || 0, 'version')} checked against the registry
                  {(cooldown.unverified || []).length ? `; ${(cooldown.unverified || []).length} could not be checked` : ''}
                  {(cooldown.native || []).some((entry) => entry.applied) ? '; enforced while resolving' : ''}.
                </td>
              </tr>
            ) : null}
            <tr>
              <td>Security audit</td>
              <td className={run.gate === 'audit_block' ? 'font-semibold text-held' : 'text-clear'}>
                {run.gate === 'audit_block' ? 'New vulnerabilities' : auditAfter ? 'No new vulnerabilities' : 'Not run'}
              </td>
              <td className="text-slate">
                {auditBefore || auditAfter ? `Before ${auditLine(auditBefore)}, after ${auditLine(auditAfter)}` : '—'}
              </td>
            </tr>
            {gates
              .filter((gate) => gate.gate !== 'audit')
              .map((gate, index) => (
                <tr key={`${gate.gate}-${gate.scope}-${index}`}>
                  <td>
                    {GATE_NAMES[gate.gate] || gate.gate}
                    {gate.scope && gate.scope !== 'root' ? ` (${gate.scope})` : ''}
                  </td>
                  <td className={gate.passed ? 'text-clear' : 'font-semibold text-held'}>{gate.passed ? 'Passed' : 'Held'}</td>
                  <td className="text-slate">{gate.reason || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {cooldown?.violations?.length ? (
        <section className="mt-10">
          <h2>Versions waiting out the cooldown</h2>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">Version</th>
                <th scope="col">Published</th>
                <th scope="col">Eligible from</th>
              </tr>
            </thead>
            <tbody>
              {cooldown.violations.map((entry) => (
                <tr key={`${entry.name}@${entry.version}`}>
                  <td className="mono">{entry.name}</td>
                  <td className="mono">{entry.version}</td>
                  <td>{entry.publishedAt ? timeAgo(entry.publishedAt) : '—'}</td>
                  <td>{entry.eligibleAt ? entry.eligibleAt.slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {changes.length > 0 ? (
        <section className="mt-10">
          <h2>Package changes</h2>
          <p className="mt-1 text-slate">
            {plural(direct.length, 'direct dependency', 'direct dependencies')} and{' '}
            {plural(transitive.length, 'transitive dependency', 'transitive dependencies')}.
          </p>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Change</th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {[...direct, ...transitive].slice(0, 400).map((change) => (
                <tr key={change.id}>
                  <td className="mono">
                    {change.name}
                    {change.scope !== 'root' ? <span className="ml-2 font-sans text-sm text-slate">({change.scope})</span> : null}
                  </td>
                  <td className="mono">{change.fromVersion || '—'}</td>
                  <td className="mono">{change.toVersion || '—'}</td>
                  <td className={change.bump === 'major' ? 'font-semibold text-held' : ''}>{change.bump}</td>
                  <td>{change.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {changes.length > 400 ? <p className="mt-2 text-sm text-slate">Showing the first 400 of {changes.length} changes.</p> : null}
        </section>
      ) : null}

      {scripts.length > 0 ? (
        <section className="mt-10">
          <h2>Your checks after the update</h2>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th scope="col">Command</th>
                <th scope="col">Result</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map((script, index) => (
                <tr key={`${script.command}-${index}`}>
                  <td className="mono">{script.command || script.name}</td>
                  <td className={script.result === 'pass' ? 'text-clear' : 'font-semibold text-held'}>
                    {script.result === 'pass'
                      ? 'Passed'
                      : script.failureKind === 'baseline'
                        ? 'Failing before the update too (not blocking)'
                        : 'Failed'}
                  </td>
                  <td>{duration(script.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-10 max-w-3xl">
        <h2>Run details</h2>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="text-slate">Finished</dt>
          <dd>{run.finishedAt ? `${run.finishedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC` : '—'}</dd>
          <dt className="text-slate">Duration</dt>
          <dd>{duration(run.durationMs)}</dd>
          <dt className="text-slate">Branch</dt>
          <dd className="mono">{run.branchName || '—'}</dd>
          <dt className="text-slate">Base commit</dt>
          <dd className="mono">{run.baseSha ? run.baseSha.slice(0, 12) : '—'}</dd>
          <dt className="text-slate">Ran in</dt>
          <dd>{run.source === 'actions' ? 'GitHub Actions' : 'A developer machine'}</dd>
          <dt className="text-slate">Toolchain</dt>
          <dd>
            {[
              report.environment?.nodeVersion ? `Node ${report.environment.nodeVersion.replace(/^v/, '')}` : '',
              report.environment?.packageManager
                ? `${report.environment.packageManager} ${report.environment.packageManagerVersion || ''}`.trim()
                : ''
            ]
              .filter(Boolean)
              .join(', ') || '—'}
          </dd>
          <dt className="text-slate">Run ID</dt>
          <dd className="mono">{run.runId}</dd>
        </dl>
      </section>
    </Shell>
  );
}
