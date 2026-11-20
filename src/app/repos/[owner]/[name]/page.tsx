import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Shell } from '@/components/Shell';
import { StatusLabel } from '@/components/Status';
import { WorkflowSnippet } from '@/components/WorkflowSnippet';
import { publicUrl } from '@/lib/env';
import { duration, timeAgo } from '@/lib/format';
import { repoDetailForUser } from '@/lib/queries';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function RepoPage({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const user = await requireUser();
  const { owner, name } = await params;
  const detail = await repoDetailForUser(user.id, `${owner}/${name}`);

  if (!detail) {
    notFound();
  }

  const { repo, pullRequests, runs } = detail;

  return (
    <Shell user={user} active="/repos">
      <p className="text-sm">
        <Link href="/repos">Repositories</Link>
      </p>
      <h1 className="mt-1">{repo.fullName}</h1>
      <p className="mt-2 flex flex-wrap gap-x-6 text-slate">
        <a href={`https://github.com/${repo.fullName}`}>View on GitHub</a>
        {repo.defaultBranch ? <span>Default branch: {repo.defaultBranch}</span> : null}
      </p>

      {runs.length === 0 ? (
        <section className="mt-8">
          <h2>No runs yet</h2>
          <div className="mt-3">
            <WorkflowSnippet consoleUrl={publicUrl()} />
          </div>
        </section>
      ) : null}

      {pullRequests.length > 0 ? (
        <section className="mt-10">
          <h2>Bridge pull requests</h2>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th scope="col">Pull request</th>
                <th scope="col">State</th>
                <th scope="col">Opened</th>
                <th scope="col">Closed</th>
              </tr>
            </thead>
            <tbody>
              {pullRequests.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <a href={pr.url}>#{pr.number}</a> <span className="text-slate">{pr.title}</span>
                  </td>
                  <td className={pr.state === 'merged' ? 'font-semibold text-clear' : pr.state === 'open' ? 'text-link' : 'text-muted'}>
                    {pr.state === 'merged' ? `Merged${pr.mergedBy ? ` by ${pr.mergedBy}` : ''}` : pr.state === 'open' ? 'Open' : 'Closed without merging'}
                  </td>
                  <td>{timeAgo(pr.openedAt || pr.createdAt)}</td>
                  <td>{timeAgo(pr.mergedAt || pr.closedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {runs.length > 0 ? (
        <section className="mt-10">
          <h2>Runs</h2>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Result</th>
                <th scope="col">Changes</th>
                <th scope="col">Pull request</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(({ run }) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/runs/${encodeURIComponent(run.runId)}`}>{timeAgo(run.finishedAt || run.createdAt)}</Link>
                  </td>
                  <td>
                    <StatusLabel status={run.status} gate={run.gate} />
                  </td>
                  <td>
                    {run.totalChanged > 0 ? `${run.directChanged} direct, ${run.transitiveChanged} transitive` : <span className="text-muted">—</span>}
                  </td>
                  <td>{run.prUrl ? <a href={run.prUrl}>#{run.prNumber}</a> : <span className="text-muted">—</span>}</td>
                  <td>{duration(run.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </Shell>
  );
}
