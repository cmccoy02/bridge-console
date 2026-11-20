export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.round(seconds / 86400)}d ago`;
  return date.toISOString().slice(0, 10);
}

export function duration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return 'under 1s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export const STATUS_LABELS: Record<string, { label: string; tone: 'good' | 'info' | 'warn' | 'bad' | 'muted' }> = {
  pr_opened: { label: 'PR opened', tone: 'good' },
  pr_updated: { label: 'PR refreshed', tone: 'good' },
  pr_unchanged: { label: 'PR current', tone: 'info' },
  pushed: { label: 'Pushed', tone: 'info' },
  up_to_date: { label: 'Up to date', tone: 'muted' },
  blocked: { label: 'Held', tone: 'warn' },
  failed: { label: 'Failed', tone: 'bad' },
  dry_run: { label: 'Dry run', tone: 'muted' },
  pending_publish: { label: 'Publishing', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'muted' }
};

export const GATE_LABELS: Record<string, string> = {
  cooldown_block: 'Release-age cooldown',
  audit_block: 'New vulnerabilities',
  validation_block: 'Checks failed after update',
  bundle_block: 'Bundle size',
  policy_block: 'Major version policy',
  pr_lookup_failed: 'Could not check existing PRs'
};

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}
