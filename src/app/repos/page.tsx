import Link from 'next/link';

import { Shell } from '@/components/Shell';
import { StatusLabel } from '@/components/Status';
import { WorkflowSnippet } from '@/components/WorkflowSnippet';
import { installUrl, publicUrl } from '@/lib/env';
import { plural, timeAgo } from '@/lib/format';
import { reposForUser, summaryForUser } from '@/lib/queries';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Repositories' };

interface CooldownSummary {
  violations?: unknown[];
}

interface AuditTotals {
  total?: number;
  critical?: number;
  high?: number;
}

function vulnerabilities(audit: AuditTotals | null) {
  if (!audit) {
    return <span className="text-muted">—</span>;
  }

  const serious = (audit.critical || 0) + (audit.high || 0);
  return (
    <span className={serious > 0 ? 'font-semibold text-failed' : ''}>
      {audit.total || 0}
      {serious > 0 ? ` (${serious} critical or high)` : ''}
    </span>
  );
}

export default async function ReposPage() {
  const user = await requireUser();
  const [rows, summary] = await Promise.all([reposForUser(user.id), summaryForUser(user.id)]);
  const install = installUrl();

  return (
    <Shell user={user} active="/repos">
      <h1>Repositories</h1>
      {summary.runs > 0 ? (
        <p className="mt-3 max-w-3xl text-[1.05rem] text-slate">
          In the last 30 days Bridge merged <strong className="text-ink">{plural(summary.prsMerged, 'pull request')}</strong>{' '}
          carrying <strong className="text-ink">{plural(summary.packagesUpdated, 'package update')}</strong>
          {summary.openPrs > 0 ? (
            <>
              , and <strong className="text-ink">{summary.openPrs}</strong> {summary.openPrs === 1 ? 'is' : 'are'} waiting for review
            </>
          ) : null}
          .{' '}
          {summary.held > 0 ? (
            <>
              <strong className="text-ink">{plural(summary.held, 'run')}</strong> held updates back for a safety check.
            </>
          ) : null}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <section className="mt-8 space-y-6">
          <div className="max-w-2xl">
            <h2>Connect your first repository</h2>
            <p className="mt-2 text-slate">
              Install the Bridge GitHub App on the repositories you want kept current, then add the workflow below.
              Runs show up here as soon as the first one finishes.
            </p>
            {install ? (
              <a href={install} className="button mt-4">
                Install the GitHub App
              </a>
            ) : null}
          </div>
          <WorkflowSnippet consoleUrl={publicUrl()} />
        </section>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Last run</th>
                <th scope="col">Bridge PR</th>
                <th scope="col">Held back</th>
                <th scope="col">Known vulnerabilities</th>
                <th scope="col">Merged (30 days)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ repo, lastRun, openPr, merged30 }) => {
                const held = ((lastRun?.cooldown as CooldownSummary | null)?.violations || []).length;
                return (
                  <tr key={repo.id}>
                    <td>
                      <Link href={`/repos/${repo.fullName}`} className="font-semibold">
                        {repo.fullName}
                      </Link>
                      {!repo.enabled ? <div className="text-sm text-muted">Turned off</div> : null}
                    </td>
                    <td>
                      {lastRun ? (
                        <>
                          <Link href={`/runs/${encodeURIComponent(lastRun.runId)}`} className="hover:no-underline">
                            <StatusLabel status={lastRun.status} gate={lastRun.gate} />
                          </Link>
                          <div className="text-sm text-slate">{timeAgo(lastRun.finishedAt || lastRun.createdAt)}</div>
                        </>
                      ) : (
                        <span className="text-muted">No runs yet</span>
                      )}
                    </td>
                    <td>
                      {openPr ? (
                        <a href={openPr.url}>#{openPr.number} open</a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {held > 0 ? (
                        <span className="text-held">{plural(held, 'version')} in cooldown</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{vulnerabilities((lastRun?.auditAfter as AuditTotals | null) || null)}</td>
                    <td>{merged30 || <span className="text-muted">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
