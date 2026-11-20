import crypto from 'node:crypto';

import { SignJWT } from 'jose';

import { githubApiUrl, githubAppConfig, githubWebUrl } from './env';
import { HttpError } from './http';

// Minimal GitHub App client over fetch: app JWT, installation lookup, scoped
// installation tokens, user sign-in. Kept dependency-free so it is easy to audit.

export class GitHubApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

interface GitHubRequest {
  token?: string;
  tokenType?: 'Bearer' | 'token';
  method?: string;
  body?: unknown;
}

export async function githubFetch<T>(pathOrUrl: string, { token, method = 'GET', body }: GitHubRequest = {}): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${githubApiUrl()}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'bridge-console',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    let message = `GitHub API ${method} ${new URL(url).pathname} failed with HTTP ${response.status}`;

    try {
      const detail = (await response.json()) as { message?: string };

      if (detail?.message) {
        message = `${message}: ${detail.message}`;
      }
    } catch {
      // Keep the generic message.
    }

    throw new GitHubApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function createAppJwt(): Promise<string> {
  const { appId, privateKey } = githubAppConfig();

  if (!appId || !privateKey) {
    throw new HttpError(503, 'The Bridge GitHub App is not configured on this console (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY).');
  }

  // GitHub issues PKCS#1 keys; Node's KeyObject accepts both PKCS#1 and PKCS#8.
  const key = crypto.createPrivateKey(privateKey);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(appId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .sign(key);
}

export interface InstallationInfo {
  id: number;
  account: { id: number; login: string; type: string };
  suspended_at?: string | null;
}

export async function findRepoInstallation(fullName: string): Promise<InstallationInfo | null> {
  try {
    return await githubFetch<InstallationInfo>(`/repos/${fullName}/installation`, { token: await createAppJwt() });
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export interface RepoInfo {
  id: number;
  full_name: string;
  private: boolean;
  default_branch?: string;
}

export async function createInstallationToken(
  installationId: number,
  repositoryId: number,
  permissions: Record<string, 'read' | 'write'> = { contents: 'write', pull_requests: 'write' }
): Promise<{ token: string; expiresAt: string }> {
  const result = await githubFetch<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    {
      token: await createAppJwt(),
      method: 'POST',
      body: { repository_ids: [repositoryId], permissions }
    }
  );
  return { token: result.token, expiresAt: result.expires_at };
}

let cachedBotIdentity: { name: string; email: string } | null = null;

/** Commit identity GitHub attributes to the App's bot account. */
export async function getBotIdentity(): Promise<{ name: string; email: string }> {
  if (cachedBotIdentity) {
    return cachedBotIdentity;
  }

  const { slug } = githubAppConfig();
  const login = `${slug || 'bridge'}[bot]`;
  const configuredId = (process.env.GITHUB_APP_BOT_USER_ID || '').trim();
  let userId = configuredId;

  if (!userId && slug) {
    try {
      const user = await githubFetch<{ id: number }>(`/users/${encodeURIComponent(login)}`);
      userId = String(user.id);
    } catch {
      userId = '';
    }
  }

  cachedBotIdentity = {
    name: login,
    email: userId ? `${userId}+${login}@users.noreply.github.com` : `${login}@users.noreply.github.com`
  };
  return cachedBotIdentity;
}

/** Tests only. */
export function resetBotIdentityCache() {
  cachedBotIdentity = null;
}

// ---------------------------------------------------------------------------
// Sign in with GitHub (GitHub App user authorization)

export function authorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = githubAppConfig();
  const url = new URL(`${githubWebUrl()}/login/oauth/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  return url.toString();
}

export async function exchangeOAuthCode(code: string, redirectUri: string): Promise<string> {
  const { clientId, clientSecret } = githubAppConfig();
  const response = await fetch(`${githubWebUrl()}/login/oauth/access_token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(15000)
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };

  if (!response.ok || !body.access_token) {
    throw new HttpError(401, `GitHub sign-in failed: ${body.error_description || `HTTP ${response.status}`}`);
  }

  return body.access_token;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

export async function getAuthenticatedUser(userToken: string): Promise<GitHubUser> {
  return githubFetch<GitHubUser>('/user', { token: userToken });
}

export async function listUserInstallations(userToken: string): Promise<InstallationInfo[]> {
  const result = await githubFetch<{ installations: InstallationInfo[] }>('/user/installations?per_page=100', {
    token: userToken
  });
  return result.installations || [];
}

export async function listInstallationRepos(installationId: number): Promise<RepoInfo[]> {
  const { token } = await githubFetch<{ token: string }>(`/app/installations/${installationId}/access_tokens`, {
    token: await createAppJwt(),
    method: 'POST',
    body: { permissions: { metadata: 'read' } }
  });
  const result = await githubFetch<{ repositories: RepoInfo[] }>('/installation/repositories?per_page=100', { token });
  return result.repositories || [];
}
