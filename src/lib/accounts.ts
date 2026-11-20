import { eq, sql } from 'drizzle-orm';

import { getDb, schema } from './db';
import { findRepoInstallation, type InstallationInfo, type RepoInfo } from './github-app';
import { HttpError } from './http';
import type { ActionsIdentity } from './oidc';

export async function recordEvent(input: {
  accountId?: number | null;
  repoId?: number | null;
  kind: string;
  detail?: unknown;
}) {
  const db = await getDb();
  await db.insert(schema.events).values({
    accountId: input.accountId ?? null,
    repoId: input.repoId ?? null,
    kind: input.kind,
    detail: (input.detail ?? null) as object | null
  });
}

export async function upsertAccountFromInstallation(installation: InstallationInfo) {
  const db = await getDb();
  const [account] = await db
    .insert(schema.accounts)
    .values({
      installationId: installation.id,
      githubAccountId: installation.account.id,
      login: installation.account.login,
      type: installation.account.type || 'Organization',
      installationSuspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null
    })
    .onConflictDoUpdate({
      target: schema.accounts.installationId,
      set: {
        githubAccountId: installation.account.id,
        login: installation.account.login,
        type: installation.account.type || 'Organization',
        installationDeletedAt: null,
        installationSuspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
        updatedAt: new Date()
      }
    })
    .returning();
  return account;
}

export async function upsertRepo(accountId: number, repo: RepoInfo) {
  const db = await getDb();
  const values = {
    accountId,
    githubRepoId: repo.id,
    fullName: repo.full_name,
    private: repo.private ?? true,
    defaultBranch: repo.default_branch || null,
    removedAt: null
  };
  const [existing] = await db
    .select()
    .from(schema.repos)
    .where(sql`${schema.repos.githubRepoId} = ${repo.id} or lower(${schema.repos.fullName}) = lower(${repo.full_name})`)
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(schema.repos)
      .set({ ...values, defaultBranch: values.defaultBranch ?? existing.defaultBranch })
      .where(eq(schema.repos.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(schema.repos).values(values).returning();
  return created;
}

export async function markReposRemoved(repoIds: number[]) {
  if (repoIds.length === 0) {
    return;
  }

  const db = await getDb();

  for (const githubRepoId of repoIds) {
    await db
      .update(schema.repos)
      .set({ removedAt: new Date() })
      .where(eq(schema.repos.githubRepoId, githubRepoId));
  }
}

/**
 * Resolves the account and repo an Actions OIDC identity belongs to. Falls back to a
 * GitHub lookup when a webhook was missed. Refuses repos without an active install.
 */
export async function resolveInstalledRepo(identity: ActionsIdentity) {
  const db = await getDb();
  let [repo] = await db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.githubRepoId, identity.repositoryId))
    .limit(1);
  let account = repo
    ? (await db.select().from(schema.accounts).where(eq(schema.accounts.id, repo.accountId)).limit(1))[0]
    : undefined;

  if (!repo || !account || account.installationDeletedAt || repo.removedAt) {
    const installation = await findRepoInstallation(identity.repository);

    if (!installation) {
      throw new HttpError(
        403,
        `The Bridge GitHub App is not installed on ${identity.repository}. Install it, then re-run the workflow.`
      );
    }

    account = await upsertAccountFromInstallation(installation);
    repo = await upsertRepo(account.id, {
      id: identity.repositoryId,
      full_name: identity.repository,
      private: repo?.private ?? true
    });
  }

  if (account.installationSuspendedAt) {
    throw new HttpError(403, `The Bridge GitHub App installation for ${account.login} is suspended.`);
  }

  if (!repo.enabled) {
    throw new HttpError(403, `Bridge is turned off for ${repo.fullName} in the console.`);
  }

  if (repo.fullName !== identity.repository) {
    [repo] = await db
      .update(schema.repos)
      .set({ fullName: identity.repository })
      .where(eq(schema.repos.id, repo.id))
      .returning();
  }

  return { account, repo };
}
