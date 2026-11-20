import { count, eq } from 'drizzle-orm';

import { upsertAccountFromInstallation, upsertRepo } from './accounts';
import { getDb, schema } from './db';
import {
  exchangeOAuthCode,
  getAuthenticatedUser,
  listInstallationRepos,
  listUserInstallations
} from './github-app';

/**
 * Completes "Sign in with GitHub": records the user and links them to every Bridge
 * installation they can access on GitHub. Access is GitHub's own permission model.
 */
export async function completeGitHubSignIn(code: string, redirectUri: string) {
  const userToken = await exchangeOAuthCode(code, redirectUri);
  const githubUser = await getAuthenticatedUser(userToken);
  const installations = await listUserInstallations(userToken);
  const db = await getDb();

  const [user] = await db
    .insert(schema.users)
    .values({
      githubId: githubUser.id,
      login: githubUser.login,
      name: githubUser.name,
      avatarUrl: githubUser.avatar_url,
      lastLoginAt: new Date()
    })
    .onConflictDoUpdate({
      target: schema.users.githubId,
      set: { login: githubUser.login, name: githubUser.name, avatarUrl: githubUser.avatar_url, lastLoginAt: new Date() }
    })
    .returning();

  // Rebuild memberships from what GitHub says this user can access right now.
  await db.delete(schema.memberships).where(eq(schema.memberships.userId, user.id));

  for (const installation of installations) {
    const account = await upsertAccountFromInstallation(installation);
    await db.insert(schema.memberships).values({ userId: user.id, accountId: account.id }).onConflictDoNothing();
    const [{ value: repoCount }] = await db
      .select({ value: count() })
      .from(schema.repos)
      .where(eq(schema.repos.accountId, account.id));

    if (repoCount === 0) {
      try {
        for (const repo of await listInstallationRepos(installation.id)) {
          await upsertRepo(account.id, repo);
        }
      } catch (error) {
        console.warn(`Could not list repositories for installation ${installation.id}:`, error);
      }
    }
  }

  return user;
}

/** Local development only: a user who can see every account. */
export async function signInAsDeveloper() {
  const db = await getDb();
  let [user] = await db.select().from(schema.users).where(eq(schema.users.login, 'developer')).limit(1);

  if (!user) {
    [user] = await db.insert(schema.users).values({ login: 'developer', name: 'Local developer' }).returning();
  }

  for (const account of await db.select().from(schema.accounts)) {
    await db
      .insert(schema.memberships)
      .values({ userId: user.id, accountId: account.id, role: 'admin' })
      .onConflictDoNothing();
  }

  return user;
}
