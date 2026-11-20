// Central place for configuration. Read lazily so tests can set process.env first.

function read(name: string): string {
  return (process.env[name] || '').trim();
}

export function publicUrl(): string {
  return (read('BRIDGE_PUBLIC_URL') || 'http://localhost:3000').replace(/\/+$/, '');
}

export function oidcAudience(): string {
  const explicit = read('BRIDGE_OIDC_AUDIENCE');

  if (explicit) {
    return explicit;
  }

  try {
    return new URL(publicUrl()).origin;
  } catch {
    return publicUrl();
  }
}

export function trustedWorkflows(): string[] {
  // Only Bridge's reusable workflow from its main branch or a release tag.
  const raw =
    read('BRIDGE_TRUSTED_WORKFLOWS') ||
    'cmccoy02/bridge-cli/.github/workflows/bridge.yml@refs/heads/main,cmccoy02/bridge-cli/.github/workflows/bridge.yml@refs/tags/';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function devLoginEnabled(): boolean {
  return read('BRIDGE_DEV_LOGIN') === '1' && process.env.NODE_ENV !== 'production';
}

export function sessionSecret(): Uint8Array {
  const secret = read('SESSION_SECRET');

  if (secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (32+ characters) in production.');
  }

  return new TextEncoder().encode('bridge-local-development-session-secret-not-for-production');
}

export function encryptionKey(): Buffer {
  const raw = read('ENCRYPTION_KEY');

  if (raw) {
    const key = Buffer.from(raw, 'base64');

    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).');
    }

    return key;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be set in production.');
  }

  return Buffer.alloc(32, 7);
}

export interface GitHubAppConfig {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
}

export function githubAppConfig(): GitHubAppConfig {
  let privateKey = read('GITHUB_APP_PRIVATE_KEY');

  if (privateKey && !privateKey.includes('BEGIN')) {
    privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
  }

  return {
    appId: read('GITHUB_APP_ID'),
    slug: read('GITHUB_APP_SLUG'),
    clientId: read('GITHUB_APP_CLIENT_ID'),
    clientSecret: read('GITHUB_APP_CLIENT_SECRET'),
    privateKey: privateKey.replace(/\\n/g, '\n'),
    webhookSecret: read('GITHUB_WEBHOOK_SECRET')
  };
}

export function githubAppConfigured(): boolean {
  const config = githubAppConfig();
  return Boolean(config.appId && config.privateKey);
}

export function githubApiUrl(): string {
  return (read('GITHUB_API_URL') || 'https://api.github.com').replace(/\/+$/, '');
}

export function githubWebUrl(): string {
  return (read('GITHUB_WEB_URL') || 'https://github.com').replace(/\/+$/, '');
}

export function installUrl(): string {
  const { slug } = githubAppConfig();
  return slug ? `${githubWebUrl()}/apps/${slug}/installations/new` : '';
}
