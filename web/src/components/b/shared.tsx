import { ArrowRight, BarChart3, BrainCircuit, Database, FileCode2, Network, UserCheck, type LucideIcon } from 'lucide-react';
import type { EvidenceType, Mapping, Precedent } from '@shared/types';
import { Badge, cx, Mono } from '@/components/ui';
import type { Tone } from '@/lib/format';

export const agentIdByName: Record<string, string> = {
  'Concept Aligner': 'aligner', 'Hierarchy Agent': 'hierarchy', 'Code List Agent': 'code-list', 'Target Designer': 'target-designer',
};

export const evidenceMeta: Record<EvidenceType, { label: string; icon: LucideIcon; bar: string; text: string }> = {
  metadata: { label: 'Metadata', icon: Database, bar: 'bg-info', text: 'text-info' },
  profile: { label: 'Value profile', icon: BarChart3, bar: 'bg-accent', text: 'text-accent' },
  ontology: { label: 'Ontology rule', icon: Network, bar: 'bg-agent', text: 'text-agent' },
  code: { label: 'Code evidence', icon: FileCode2, bar: 'bg-warn', text: 'text-warn' },
  precedent: { label: 'Precedent', icon: BrainCircuit, bar: 'bg-ok', text: 'text-ok' },
  reviewer: { label: 'Reviewer input', icon: UserCheck, bar: 'bg-ink-3', text: 'text-ink-2' },
};

export const statusMeta: Record<Mapping['status'], { label: string; tone: Tone }> = {
  proposed: { label: 'Proposed', tone: 'neutral' },
  auto_accepted: { label: 'Auto-accepted', tone: 'ok' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'crit' },
  changed: { label: 'Changed', tone: 'accent' },
  not_migrated: { label: 'Not migrated', tone: 'neutral' },
  question: { label: 'Open question', tone: 'warn' },
};

export const isPending = (m: Mapping) => m.status === 'proposed' || m.status === 'question' || (m.status === 'auto_accepted' && !!m.sampled);

export function needsConfig(m: Mapping) {
  return !!m.targetNote || /custom field/i.test(m.target);
}

/** Source → concept → IFS target as three connected nodes. */
export function FlowNodes({ m, compact }: { m: Mapping; compact?: boolean }) {
  const node = 'min-w-0 rounded-lg border px-2.5 py-1.5';
  return (
    <div className={cx('grid items-center gap-1.5', compact ? 'grid-cols-[1fr_auto_1fr_auto_1fr]' : 'grid-cols-[1fr_auto_1.1fr_auto_1fr]')}>
      <div className={cx(node, 'border-line bg-surface-2')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">Maximo</div>
        <Mono className="block truncate text-ink" >{m.sourceElements.join(' + ')}</Mono>
      </div>
      <ArrowRight className="size-3.5 text-ink-4" />
      <div className={cx(node, 'border-agent/30 bg-agent-soft')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-agent/80">Ontology concept</div>
        <div className="truncate text-[12.5px] font-semibold text-agent">{m.conceptLabel}</div>
        {!compact && <Mono className="block truncate text-[10.5px] text-agent/70">{m.conceptId}</Mono>}
      </div>
      <ArrowRight className="size-3.5 text-ink-4" />
      <div className={cx(node, m.target === 'Not migrated' ? 'border-dashed border-line-strong bg-sunken' : 'border-accent-line bg-accent-soft')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-accent/80">IFS Cloud</div>
        <Mono className={cx('block truncate', m.target === 'Not migrated' ? 'text-ink-3' : 'text-accent')}>{m.target}</Mono>
      </div>
    </div>
  );
}

export function EvidenceBar({ m }: { m: Mapping }) {
  const total = m.evidence.reduce((s, e) => s + e.weight, 0) || 1;
  const types = [...new Set(m.evidence.map((e) => e.type))];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
        {m.evidence.map((e, i) => (
          <div key={i} className={cx(evidenceMeta[e.type].bar, 'border-r border-surface last:border-0')} style={{ width: `${(e.weight / total) * m.confidence * 100}%` }} title={`${evidenceMeta[e.type].label}: ${Math.round(e.weight * 100)}%`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 text-[11px] text-ink-3">
            <span className={cx('size-2 rounded-sm', evidenceMeta[t].bar)} />{evidenceMeta[t].label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PrecedentList({ items, limit }: { items: Precedent[]; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) return <div className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-3">No precedent in the mapping memory. This is the first time the agents have seen this element, which lowers confidence.</div>;
  return (
    <ul className="space-y-1.5">
      {list.map((p) => (
        <li key={p.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
          <BrainCircuit className="size-3.5 shrink-0 text-ok" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{p.project}</div>
            <div className="truncate text-[11px] text-ink-3">{p.note || 'Approved'} · {p.count}× in that project</div>
          </div>
          <Badge tone={p.outcome === 'approved' ? 'ok' : p.outcome === 'changed' ? 'accent' : 'crit'}>{p.outcome}</Badge>
        </li>
      ))}
    </ul>
  );
}
