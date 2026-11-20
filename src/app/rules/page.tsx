import { Shell } from '@/components/Shell';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rules' };

const RULES = [
  {
    rule: 'Release-age cooldown',
    behavior: 'Wait 3 days after a version is published before proposing it. Most hijacked releases are pulled within hours.',
    setting: 'cooldownDays, cooldownExclude'
  },
  {
    rule: 'Your checks',
    behavior: 'Run your typecheck, lint, tests and build on the current code and again after the update. Only new failures hold the update.',
    setting: 'afterScripts, skipBeforeScripts'
  },
  {
    rule: 'Security audit',
    behavior: 'Hold the update if it adds critical or high vulnerabilities.',
    setting: 'blockOnNewVulnerabilities'
  },
  {
    rule: 'Major versions',
    behavior: 'Never propose a major version of a direct dependency automatically.',
    setting: 'allowMajorUpdates'
  },
  {
    rule: 'Transitive majors',
    behavior: 'Warn when a sub-dependency jumps a major version.',
    setting: 'transitiveMajorPolicy'
  },
  {
    rule: 'Bundle size',
    behavior: 'If configured, hold the update when the production bundle grows past the limit.',
    setting: 'bundleAnalysis.maxIncreasePercent'
  },
  {
    rule: 'Credentials',
    behavior: 'Install scripts and checks never see GitHub tokens. Only the publish step can push, and it runs no package code.',
    setting: 'env.allow'
  },
  {
    rule: 'What Bridge may push',
    behavior: 'Only dependency manifests and lockfiles, only to bridge/ branches, never to your default branch.',
    setting: 'Fixed'
  }
];

export default async function RulesPage() {
  const user = await requireUser();

  return (
    <Shell user={user} active="/rules">
      <h1>Rules</h1>
      <p className="mt-3 max-w-2xl text-slate">
        Bridge applies these rules on every run. Today you change them per repository in <code>bridge.config.json</code>;
        editing them here is next.
      </p>
      <div className="mt-8 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">What Bridge does</th>
              <th scope="col">Config setting</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((entry) => (
              <tr key={entry.rule}>
                <td className="font-semibold whitespace-nowrap">{entry.rule}</td>
                <td className="max-w-xl">{entry.behavior}</td>
                <td>{entry.setting === 'Fixed' ? <span className="text-slate">Not configurable</span> : <code>{entry.setting}</code>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
