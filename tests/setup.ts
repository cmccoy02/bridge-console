import crypto from 'node:crypto';

// Every test file runs in its own process with a fresh in-memory database.
process.env.PGLITE_DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;
process.env.BRIDGE_PUBLIC_URL = 'https://bridge.test';
process.env.BRIDGE_TRUSTED_WORKFLOWS = 'cmccoy02/bridge-cli/.github/workflows/bridge.yml@refs/heads/main,cmccoy02/bridge-cli/.github/workflows/bridge.yml@refs/tags/';
process.env.GITHUB_APP_ID = '123';
process.env.GITHUB_APP_SLUG = 'bridge-test';
process.env.GITHUB_APP_CLIENT_ID = 'Iv1.test';
process.env.GITHUB_APP_CLIENT_SECRET = 'client-secret';
process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-0123456789';
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
