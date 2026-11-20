import { redirect } from 'next/navigation';

import { devLoginEnabled, githubAppConfig } from '@/lib/env';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();

  if (user) {
    redirect('/repos');
  }

  const { error } = await searchParams;
  const signInConfigured = Boolean(githubAppConfig().clientId);

  return (
    <>
      <header className="bg-steel border-b-[3px] border-signal">
        <div className="mx-auto max-w-6xl px-5 py-3 text-[1.45rem] font-extrabold tracking-tight text-white">Bridge</div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-16">
        <div className="max-w-[38rem]">
          <h1 className="text-[2.6rem] leading-[1.08]">Your dependencies, kept current by a teammate that checks its work.</h1>
          <p className="mt-5 text-lg text-slate">
            Bridge updates packages in an isolated copy of each repository, runs your own tests and checks before and
            after, waits until new versions have been public for a few days, and opens a pull request only when nothing
            new breaks.
          </p>
          {error === 'signin' ? (
            <p role="alert" className="mt-6 border-l-4 border-failed bg-white px-4 py-3">
              Sign-in didn&apos;t complete. Try again. If it keeps failing, check that the Bridge GitHub App is
              installed on your organization.
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {signInConfigured ? (
              <a href="/api/auth/github" className="button">
                Sign in with GitHub
              </a>
            ) : (
              <p className="text-slate">
                GitHub sign-in isn&apos;t configured yet. Follow <code>docs/setup.md</code> to create the Bridge GitHub
                App.
              </p>
            )}
            {devLoginEnabled() ? (
              <a href="/api/auth/dev" className="button button-quiet">
                Continue as local developer
              </a>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
