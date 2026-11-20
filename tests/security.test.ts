import { describe, expect, it } from 'vitest';

import { generateApiKey } from '@/lib/api-keys';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { isTrustedWorkflow } from '@/lib/oidc';
import { createSessionToken, readSessionToken } from '@/lib/session';
import { isSlackWebhookUrl } from '@/lib/slack';

describe('security helpers', () => {
  it('encrypts secrets at rest and detects tampering', () => {
    const sealed = encryptSecret('https://hooks.slack.com/services/T/B/X');
    expect(sealed).not.toContain('hooks.slack.com');
    expect(decryptSecret(sealed)).toBe('https://hooks.slack.com/services/T/B/X');

    const parts = sealed.split('.');
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('generates API keys that are stored only as hashes', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key.startsWith('brk_')).toBe(true);
    expect(key.startsWith(prefix)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key);
  });

  it('signs and verifies sessions', async () => {
    const token = await createSessionToken(42);
    expect(await readSessionToken(token)).toBe(42);
    expect(await readSessionToken(`${token}x`)).toBeNull();
  });

  it('only trusts Bridge’s reusable workflow', () => {
    const allow = ['cmccoy02/bridge-cli/.github/workflows/bridge.yml@'];
    expect(isTrustedWorkflow('cmccoy02/bridge-cli/.github/workflows/bridge.yml@refs/heads/main', allow)).toBe(true);
    expect(isTrustedWorkflow('evil/bridge-cli/.github/workflows/bridge.yml@refs/heads/main', allow)).toBe(false);
    expect(isTrustedWorkflow('acme/web/.github/workflows/bridge.yml@refs/heads/main', allow)).toBe(false);
  });

  it('only accepts Slack incoming webhook URLs', () => {
    expect(isSlackWebhookUrl('https://hooks.slack.com/services/T/B/X')).toBe(true);
    expect(isSlackWebhookUrl('http://hooks.slack.com/services/T/B/X')).toBe(false);
    expect(isSlackWebhookUrl('https://evil.example/services/x')).toBe(false);
  });
});
