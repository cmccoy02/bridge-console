import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** A GitHub account (org or user) that installed the Bridge GitHub App. */
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  githubAccountId: bigint('github_account_id', { mode: 'number' }),
  login: text('login').notNull(),
  type: text('type').notNull().default('Organization'),
  installationId: bigint('installation_id', { mode: 'number' }).unique(),
  installationSuspendedAt: timestamp('installation_suspended_at', { withTimezone: true }),
  installationDeletedAt: timestamp('installation_deleted_at', { withTimezone: true }),
  slackWebhookEncrypted: text('slack_webhook_encrypted'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  githubId: bigint('github_id', { mode: 'number' }).unique(),
  login: text('login').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow()
});

export const memberships = pgTable(
  'memberships',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: createdAt()
  },
  (table) => [primaryKey({ columns: [table.userId, table.accountId] })]
);

export const repos = pgTable(
  'repos',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    githubRepoId: bigint('github_repo_id', { mode: 'number' }).unique(),
    fullName: text('full_name').notNull(),
    private: boolean('private').notNull().default(true),
    defaultBranch: text('default_branch'),
    enabled: boolean('enabled').notNull().default(true),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status'),
    createdAt: createdAt()
  },
  (table) => [uniqueIndex('repos_full_name_idx').on(table.fullName)]
);

/** One Bridge run, ingested from a bridge-report.v1 document. */
export const runs = pgTable(
  'runs',
  {
    id: serial('id').primaryKey(),
    repoId: integer('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    runId: text('run_id').notNull(),
    source: text('source').notNull().default('local'),
    status: text('status').notNull(),
    gate: text('gate'),
    message: text('message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    bridgeVersion: text('bridge_version'),
    baseBranch: text('base_branch'),
    branchName: text('branch_name'),
    baseSha: text('base_sha'),
    headSha: text('head_sha'),
    directChanged: integer('direct_changed').notNull().default(0),
    transitiveChanged: integer('transitive_changed').notNull().default(0),
    totalChanged: integer('total_changed').notNull().default(0),
    byBump: jsonb('by_bump'),
    auditBefore: jsonb('audit_before'),
    auditAfter: jsonb('audit_after'),
    cooldown: jsonb('cooldown'),
    checks: jsonb('checks'),
    prNumber: integer('pr_number'),
    prUrl: text('pr_url'),
    ciRunUrl: text('ci_run_url'),
    report: jsonb('report'),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('runs_run_id_idx').on(table.runId),
    index('runs_repo_created_idx').on(table.repoId, table.createdAt)
  ]
);

export const packageChanges = pgTable(
  'package_changes',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull().default('root'),
    name: text('name').notNull(),
    fromVersion: text('from_version'),
    toVersion: text('to_version'),
    bump: text('bump').notNull(),
    kind: text('kind').notNull()
  },
  (table) => [index('package_changes_run_idx').on(table.runId), index('package_changes_name_idx').on(table.name)]
);

export const pullRequests = pgTable(
  'pull_requests',
  {
    id: serial('id').primaryKey(),
    repoId: integer('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    url: text('url').notNull(),
    title: text('title'),
    headRef: text('head_ref'),
    state: text('state').notNull().default('open'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    mergedBy: text('merged_by'),
    lastRunId: integer('last_run_id').references(() => runs.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex('pull_requests_repo_number_idx').on(table.repoId, table.number)]
);

/** Append-only audit trail: webhook deliveries, tokens issued, keys created. */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    repoId: integer('repo_id').references(() => repos.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    detail: jsonb('detail'),
    createdAt: createdAt()
  },
  (table) => [index('events_account_created_idx').on(table.accountId, table.createdAt)]
);

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  hash: text('hash').notNull().unique(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true })
});

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type Repo = typeof repos.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type PackageChange = typeof packageChanges.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
