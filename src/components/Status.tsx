import { GATE_LABELS, STATUS_LABELS } from '@/lib/format';

const TONE_CLASS: Record<string, string> = {
  good: 'text-clear',
  info: 'text-link',
  warn: 'text-held',
  bad: 'text-failed',
  muted: 'text-muted'
};

// Shape as well as color, so status reads without color vision.
const TONE_MARK: Record<string, string> = {
  good: '●',
  info: '○',
  warn: '▲',
  bad: '■',
  muted: '–'
};

export function StatusLabel({ status, gate }: { status: string; gate?: string | null }) {
  const entry = STATUS_LABELS[status] || { label: status, tone: 'muted' as const };

  return (
    <span className={`inline-flex items-baseline gap-1.5 font-semibold ${TONE_CLASS[entry.tone]}`}>
      <span aria-hidden="true" className="text-[0.7em]">
        {TONE_MARK[entry.tone]}
      </span>
      {entry.label}
      {status === 'blocked' && gate ? (
        <span className="font-normal text-slate">({GATE_LABELS[gate] || gate})</span>
      ) : null}
    </span>
  );
}
