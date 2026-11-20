import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

import { HttpError } from './http';

// Verifies GitHub Actions OIDC tokens: who is calling (repository, workflow, run)
// without any secret stored in the customer's repository.

export const ACTIONS_ISSUER = 'https://token.actions.githubusercontent.com';

let jwks: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  jwks ??= createRemoteJWKSet(new URL(`${ACTIONS_ISSUER}/.well-known/jwks`));
  return jwks;
}

/** Tests only. */
export function setJwksForTests(keyGetter: JWTVerifyGetKey | null) {
  jwks = keyGetter;
}

export interface ActionsIdentity {
  repository: string;
  repositoryId: number;
  repositoryOwner: string;
  repositoryOwnerId: number;
  jobWorkflowRef: string;
  workflowRef: string;
  ref: string;
  sha: string;
  runId: string;
  runAttempt: string;
  eventName: string;
  actor: string;
}

function claim(payload: JWTPayload, name: string): string {
  const value = payload[name];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

export async function verifyActionsToken(token: string, audience: string): Promise<ActionsIdentity> {
  let payload: JWTPayload;

  try {
    ({ payload } = await jwtVerify(token, getJwks(), {
      issuer: ACTIONS_ISSUER,
      audience,
      algorithms: ['RS256'],
      clockTolerance: 60
    }));
  } catch (error) {
    throw new HttpError(401, `Invalid GitHub Actions OIDC token: ${(error as Error).message}`);
  }

  const identity: ActionsIdentity = {
    repository: claim(payload, 'repository'),
    repositoryId: Number(claim(payload, 'repository_id')),
    repositoryOwner: claim(payload, 'repository_owner'),
    repositoryOwnerId: Number(claim(payload, 'repository_owner_id')),
    jobWorkflowRef: claim(payload, 'job_workflow_ref'),
    workflowRef: claim(payload, 'workflow_ref'),
    ref: claim(payload, 'ref'),
    sha: claim(payload, 'sha'),
    runId: claim(payload, 'run_id'),
    runAttempt: claim(payload, 'run_attempt'),
    eventName: claim(payload, 'event_name'),
    actor: claim(payload, 'actor')
  };

  if (!identity.repository || !Number.isFinite(identity.repositoryId) || identity.repositoryId <= 0) {
    throw new HttpError(401, 'OIDC token is missing repository claims.');
  }

  return identity;
}

export function isTrustedWorkflow(jobWorkflowRef: string, allowlist: string[]): boolean {
  return allowlist.some((prefix) => prefix && jobWorkflowRef.startsWith(prefix));
}
