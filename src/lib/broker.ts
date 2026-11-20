import { recordEvent, resolveInstalledRepo } from './accounts';
import { oidcAudience, trustedWorkflows } from './env';
import { createInstallationToken, getBotIdentity } from './github-app';
import { HttpError } from './http';
import { isTrustedWorkflow, verifyActionsToken } from './oidc';

// The token broker: exchanges a GitHub Actions OIDC token from Bridge's publish job
// for a one-hour GitHub App installation token scoped to that single repository.

export const BROKER_PERMISSIONS = { contents: 'write', pull_requests: 'write' } as const;

export async function issueRepositoryToken(oidcToken: string, requestedRepository = '') {
  if (!oidcToken) {
    throw new HttpError(401, 'Missing bearer token. Send the GitHub Actions OIDC token.');
  }

  const identity = await verifyActionsToken(oidcToken, oidcAudience());

  if (!isTrustedWorkflow(identity.jobWorkflowRef, trustedWorkflows())) {
    throw new HttpError(
      403,
      `Tokens are only issued to Bridge's publish workflow, not ${identity.jobWorkflowRef || 'this workflow'}.`
    );
  }

  if (requestedRepository && requestedRepository.toLowerCase() !== identity.repository.toLowerCase()) {
    throw new HttpError(403, `This workflow runs in ${identity.repository}, not ${requestedRepository}.`);
  }

  const { account, repo } = await resolveInstalledRepo(identity);

  if (!account.installationId) {
    throw new HttpError(403, `${identity.repository} has no Bridge GitHub App installation.`);
  }

  const issued = await createInstallationToken(account.installationId, identity.repositoryId, {
    ...BROKER_PERMISSIONS
  });
  const commitAuthor = await getBotIdentity();

  await recordEvent({
    accountId: account.id,
    repoId: repo.id,
    kind: 'token_issued',
    detail: {
      repository: identity.repository,
      workflow: identity.jobWorkflowRef,
      runId: identity.runId,
      runAttempt: identity.runAttempt,
      expiresAt: issued.expiresAt
    }
  });

  return {
    token: issued.token,
    expiresAt: issued.expiresAt,
    repository: identity.repository,
    permissions: BROKER_PERMISSIONS,
    commitAuthor
  };
}
