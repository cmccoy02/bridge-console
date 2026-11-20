import { Shell } from '@/components/Shell';
import { WorkflowSnippet } from '@/components/WorkflowSnippet';
import { githubWebUrl, installUrl, publicUrl } from '@/lib/env';
import { timeAgo } from '@/lib/format';
import { accountsForUser, apiKeysForAccounts } from '@/lib/queries';
import { requireUser } from '@/lib/session';

import { removeSlackWebhook, revokeApiKeyAction } from './actions';
import { CreateKeyForm, SlackForm } from './forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();
  const accounts = await accountsForUser(user.id);
  const keys = await apiKeysForAccounts(accounts.map((entry) => entry.account.id));
  const install = installUrl();

  return (
    <Shell user={user} active="/settings">
      <h1>Settings</h1>

      {accounts.length === 0 ? (
        <section className="mt-8 max-w-2xl">
          <h2>Install the Bridge GitHub App</h2>
          <p className="mt-2 text-slate">
            You don&apos;t have access to any organization with Bridge installed. Install the app, then sign in again.
          </p>
          {install ? (
            <a href={install} className="button mt-4">
              Install the GitHub App
            </a>
          ) : null}
        </section>
      ) : null}

      {accounts.map(({ account }) => {
        const accountKeys = keys.filter((key) => key.accountId === account.id);
        const manageUrl = account.installationId
          ? account.type === 'Organization'
            ? `${githubWebUrl()}/organizations/${account.login}/settings/installations/${account.installationId}`
            : `${githubWebUrl()}/settings/installations/${account.installationId}`
          : '';

        return (
          <section key={account.id} className="mt-10 border-t border-rule pt-8">
            <h2 className="text-[1.45rem]">{account.login}</h2>

            <div className="mt-6 grid gap-10 lg:grid-cols-2">
              <div>
                <h3 className="font-bold">GitHub App</h3>
                <p className="mt-1 text-slate">
                  {account.installationDeletedAt
                    ? 'The Bridge app was uninstalled. Reinstall it to resume runs.'
                    : account.installationSuspendedAt
                      ? 'The Bridge app is suspended for this account. Runs cannot push until it is resumed.'
                      : account.installationId
                        ? 'Installed. Choose which repositories Bridge can work on in GitHub.'
                        : 'Not installed. Runs are uploaded with API keys only.'}
                </p>
                {manageUrl ? (
                  <a href={manageUrl} className="mt-2 inline-block">
                    Manage repository access on GitHub
                  </a>
                ) : install ? (
                  <a href={install} className="mt-2 inline-block">
                    Install the GitHub App
                  </a>
                ) : null}
              </div>

              <div>
                <h3 className="font-bold">Slack</h3>
                <p className="mb-3 mt-1 text-slate">
                  {account.slackWebhookEncrypted
                    ? 'Connected. Bridge posts when it opens, holds back or gets a pull request merged.'
                    : 'Post Bridge activity to a channel. In Slack, create an incoming webhook for the channel and paste its URL.'}
                </p>
                <SlackForm accountId={account.id} connected={Boolean(account.slackWebhookEncrypted)} />
                {account.slackWebhookEncrypted ? (
                  <form action={removeSlackWebhook} className="mt-2">
                    <input type="hidden" name="accountId" value={account.id} />
                    <button type="submit" className="cursor-pointer text-sm text-failed hover:underline">
                      Disconnect Slack
                    </button>
                  </form>
                ) : null}
              </div>
            </div>

            <div className="mt-10">
              <h3 className="font-bold">API keys for runs on a developer machine</h3>
              <p className="mb-3 mt-1 max-w-2xl text-slate">
                Runs in GitHub Actions need no key. To record <code>bridge patch</code> runs from a laptop, create a key and
                set <code>BRIDGE_API_URL</code> and <code>BRIDGE_API_TOKEN</code>.
              </p>
              <CreateKeyForm accountId={account.id} consoleUrl={publicUrl()} />
              {accountKeys.length > 0 ? (
                <table className="data-table mt-4 max-w-3xl">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Key</th>
                      <th scope="col">Last used</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountKeys.map((key) => (
                      <tr key={key.id}>
                        <td>{key.name}</td>
                        <td className="mono">{key.prefix}…</td>
                        <td>{key.lastUsedAt ? timeAgo(key.lastUsedAt) : 'Never'}</td>
                        <td className="text-right">
                          <form action={revokeApiKeyAction}>
                            <input type="hidden" name="accountId" value={account.id} />
                            <input type="hidden" name="keyId" value={key.id} />
                            <button type="submit" className="cursor-pointer text-sm text-failed hover:underline">
                              Revoke
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </section>
        );
      })}

      <section className="mt-12 border-t border-rule pt-8">
        <h2>Add Bridge to a repository</h2>
        <div className="mt-3">
          <WorkflowSnippet consoleUrl={publicUrl()} />
        </div>
      </section>
    </Shell>
  );
}
