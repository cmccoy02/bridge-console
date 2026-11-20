import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { vi } from 'vitest';

import { ACTIONS_ISSUER, setJwksForTests } from '@/lib/oidc';

export const TRUSTED_WORKFLOW = 'cmccoy02/bridge-cli/.github/workflows/bridge.yml@refs/heads/main';

let signingKey: CryptoKey | null = null;

export async function installTestJwks() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  setJwksForTests(createLocalJWKSet({ keys: [jwk] }));
  signingKey = privateKey;
}

export async function actionsToken(overrides: Record<string, unknown> = {}, options: { audience?: string; expiresIn?: string } = {}) {
  if (!signingKey) {
    throw new Error('Call installTestJwks() first');
  }

  return new SignJWT({
    repository: 'acme/web',
    repository_id: '1001',
    repository_owner: 'acme',
    repository_owner_id: '9',
    job_workflow_ref: TRUSTED_WORKFLOW,
    workflow_ref: 'acme/web/.github/workflows/bridge.yml@refs/heads/main',
    ref: 'refs/heads/main',
    sha: 'a'.repeat(40),
    run_id: '555',
    run_attempt: '1',
    event_name: 'schedule',
    actor: 'octocat',
    ...overrides
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(ACTIONS_ISSUER)
    .setAudience(options.audience || 'https://bridge.test')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn || '5m')
    .sign(signingKey);
}

export interface FakeGitHub {
  calls: Array<{ method: string; url: string; body: unknown; authorization: string }>;
  slack: string[];
  installed: Set<string>;
}

/** Stubs fetch for the GitHub API and Slack. */
export function stubGitHub(): FakeGitHub {
  const state: FakeGitHub = { calls: [], slack: [], installed: new Set(['acme/web']) };

  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const headers = (init.headers || {}) as Record<string, string>;
    state.calls.push({ method, url, body, authorization: headers.authorization || '' });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

    if (url.startsWith('https://hooks.slack.com/')) {
      state.slack.push(body?.text || '');
      return new Response('ok', { status: 200 });
    }

    const match = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/installation$/);

    if (match) {
      return state.installed.has(match[1])
        ? json({ id: 77, account: { id: 9, login: 'acme', type: 'Organization' } })
        : json({ message: 'Not Found' }, 404);
    }

    if (url === 'https://api.github.com/app/installations/77/access_tokens' && method === 'POST') {
      return json({ token: 'ghs_test_installation_token', expires_at: '2026-11-20T01:00:00Z' }, 201);
    }

    if (url.startsWith('https://api.github.com/users/')) {
      return json({ id: 4242, login: 'bridge-test[bot]' });
    }

    return json({ message: `Unexpected ${method} ${url}` }, 500);
  });

  return state;
}
