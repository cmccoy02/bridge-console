import Link from 'next/link';

import { Shell } from '@/components/Shell';
import { StatusLabel } from '@/components/Status';
import { duration } from '@/lib/format';
import { runsForUser } from '@/lib/queries';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ledger' };

const FILTERS = [
  { value: '', label: 'All runs' },
  { value: 'pr_opened', label: 'Pull requests opened' },
  { value: 'blocked', label: 'Held' },
  { value: 'failed', label: 'Failed' },
  { value: 'up_to_date', label: 'Up to date' }
];

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const { status = '' } = await searchParams;
  const activeFilter = FILTERS.some((filter) => filter.value === status) ? status : '';
  const rows = await runsForUser(user.id, { status: activeFilter, limit: 300 });
  const days = new Map<string, typeof rows>();

  for (const row of rows) {
    const when = row.run.finishedAt || row.run.createdAt;
    const key = when.toISOString().slice(0, 10);
    days.set(key, [...(days.get(key) || []), row]);
  }

  return (
    <Shell user={user} active="/ledger">
      <h1>Ledger</h1>
      <p className="mt-3 max-w-2xl text-slate">
        Every Bridge run across your repositories, newest first: what changed, what was held back and why.
      </p>

      <nav aria-label="Filter runs" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/ledger?status=${filter.value}` : '/ledger'}
            aria-current={activeFilter === filter.value ? 'page' : undefined}
            className={`rounded border px-3 py-1 text-sm hover:no-underline ${
              activeFilter === filter.value ? 'border-steel bg-steel text-white' : 'border-rule bg-white text-ink'
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-8 text-slate">
          No runs {activeFilter ? 'match this filter' : 'yet'}. Runs appear here when the Bridge workflow finishes in one of your
          repositories.
        </p>
      ) : (
        [...days.entries()].map(([day, dayRows]) => (
          <section key={day} className="mt-8">
            <h2 className="text-base">{dayLabel(new Date(`${day}T00:00:00Z`))}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="data-table ledger-table min-w-[760px]">
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[20%]" />
                  <col className="w-[36%]" />
                  <col className="w-[16%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Repository</th>
                    <th scope="col">Result</th>
                    <th scope="col">Changes</th>
                    <th scope="col">Pull request</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map(({ run, repo }) => (
                    <tr key={run.id}>
                      <td>
                        <Link href={`/runs/${encodeURIComponent(run.runId)}`}>
                          {(run.finishedAt || run.createdAt).toISOString().slice(11, 16)}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/repos/${repo.fullName}`}>{repo.fullName}</Link>
                      </td>
                      <td>
                        <StatusLabel status={run.status} gate={run.gate} />
                        {run.status === 'blocked' && run.message ? (
                          <div className="mt-1 max-w-md text-sm text-slate">{run.message}</div>
                        ) : null}
                      </td>
                      <td>
                        {run.totalChanged > 0 ? (
                          `${run.directChanged} direct, ${run.transitiveChanged} transitive`
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>{run.prUrl ? <a href={run.prUrl}>#{run.prNumber}</a> : <span className="text-muted">—</span>}</td>
                      <td>{duration(run.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
      <p className="mt-6 text-sm text-slate">Times are UTC.</p>
    </Shell>
  );
}
