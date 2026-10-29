import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BrainCircuit, Network, Puzzle, Search, Settings2, Sparkles, Target, X } from 'lucide-react';
import type { Mapping } from '@shared/types';
import { useApi, useApp, useAssistantFocus } from '@/lib/app';
import { pct } from '@/lib/format';
import { Badge, Button, Card, Confidence, cx, Empty, Mono, PageHeader, PathBadge, ScriptedNote, SectionLabel, Segmented, Skeleton, Stat } from '@/components/ui';
import { AgentAvatar } from '@/components/agents';
import { agentIdByName, EvidenceBar, evidenceMeta, needsConfig, PrecedentList, statusMeta } from '@/components/b/shared';

function Row({ m, selected, onClick }: { m: Mapping; selected: boolean; onClick: () => void }) {
  const st = statusMeta[m.status];
  return (
    <button onClick={onClick}
      className={cx('group grid w-full grid-cols-[minmax(0,1fr)_20px_minmax(0,1.1fr)_20px_minmax(0,1fr)_auto] items-center gap-1 px-3 py-2 text-left transition-colors', selected ? 'bg-accent-soft/50' : 'hover:bg-surface-2')}>
      <div className="min-w-0">
        <Mono className="block truncate font-medium text-ink">{m.sourceElements.join(' + ')}</Mono>
        <div className="mt-0.5 flex gap-1">
          {m.custom && <Badge tone="warn">Custom</Badge>}
          {m.safetyCritical && <Badge tone="crit">Safety</Badge>}
          {m.regulatory && <Badge tone="crit">Regulatory</Badge>}
        </div>
      </div>
      <Connector conf={m.confidence} />
      <div className="min-w-0 rounded-lg border border-agent/25 bg-agent-soft px-2 py-1">
        <div className="truncate text-[12.5px] font-semibold text-agent">{m.conceptLabel}</div>
        <Mono className="block truncate text-[10.5px] text-agent/70">{m.conceptId}</Mono>
      </div>
      <Connector conf={m.confidence} />
      <Mono className={cx('block truncate', m.target === 'Not migrated' ? 'text-ink-4 line-through' : 'text-accent')}>{m.target}</Mono>
      <div className="flex flex-col items-end gap-1 pl-2">
        <Confidence value={m.confidence} />
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
    </button>
  );
}

function Connector({ conf }: { conf: number }) {
  return (
    <div className="relative flex h-full items-center">
      <div className={cx('h-px w-full', conf >= 0.95 ? 'bg-ok' : conf >= 0.75 ? 'bg-info' : 'border-t border-dashed border-warn bg-transparent')} />
      <ArrowRight className={cx('absolute -right-1 size-3', conf >= 0.95 ? 'text-ok' : conf >= 0.75 ? 'text-info' : 'text-warn')} />
    </div>
  );
}

function SidePanel({ m, onClose }: { m: Mapping; onClose: () => void }) {
  const { ask } = useApp();
  const label = m.sourceElements.join(' + ');
  useAssistantFocus(m.id, label);
  return (
    <motion.div key={m.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
      <Card className="space-y-4">
        <div className="flex items-start gap-2.5">
          <AgentAvatar id={agentIdByName[m.agent] ?? 'aligner'} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="font-mono text-xs text-ink-3">{m.id}</span><PathBadge path={m.path} /></div>
            <Mono className="mt-1 block truncate text-[13px] font-semibold text-ink">{label}</Mono>
            <div className="text-xs text-ink-3">Proposed by {m.agent}</div>
          </div>
          <button onClick={onClose} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-sunken" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div>
          <SectionLabel right={<Confidence value={m.confidence} />}>Evidence</SectionLabel>
          <EvidenceBar m={m} />
          <ul className="mt-3 space-y-2">
            {m.evidence.map((e, i) => {
              const meta = evidenceMeta[e.type];
              return (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                  <meta.icon className={cx('mt-0.5 size-3.5 shrink-0', meta.text)} />
                  <span>{e.content}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <SectionLabel right={<span className="text-[10.5px] text-ink-4">simulated history</span>}>Seen in earlier projects</SectionLabel>
          <PrecedentList items={m.precedents} limit={3} />
        </div>
        <div className="rounded-lg bg-sunken px-3 py-2 text-[12px] text-ink-2"><b className="font-medium text-ink">Rule:</b> {m.rule}</div>
        {needsConfig(m) && (
          <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">
            <Settings2 className="mt-0.5 size-3.5 shrink-0" />
            <span>{m.targetNote ?? 'Needs IFS configuration'}. The Target Designer only proposes it; the IFS solution consultant approves.</span>
          </div>
        )}
        <div className="flex gap-2">
          <Link to={`/review?item=${m.id}`} className="flex-1"><Button variant="primary" className="w-full" icon={ArrowRight}>Open in review</Button></Link>
          <Button variant="agent" icon={Sparkles} onClick={() => ask(`Why was ${m.id} proposed?`, { itemId: m.id, label })}>Ask why</Button>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Alignment() {
  const { data } = useApi<Mapping[]>('/mappings');
  const [object, setObject] = useState('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'low'>('all');
  const [sel, setSel] = useState<string | null>(null);

  const all = data ?? [];
  const objects = useMemo(() => [...new Set(all.map((m) => m.object))], [all]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((m) =>
      (object === 'all' || m.object === object) &&
      (view === 'all' || m.confidence < 0.75) &&
      (!t || `${m.id} ${m.sourceElements.join(' ')} ${m.conceptLabel} ${m.conceptId} ${m.target}`.toLowerCase().includes(t)));
  }, [all, object, q, view]);
  const groups = useMemo(() => {
    const g = new Map<string, Mapping[]>();
    for (const m of filtered) g.set(m.object, [...(g.get(m.object) ?? []), m]);
    return [...g.entries()];
  }, [filtered]);
  const selected = all.find((m) => m.id === sel);

  const avg = all.length ? all.reduce((s, m) => s + m.confidence, 0) / all.length : 0;
  const withPrec = all.filter((m) => m.precedents.some((p) => p.outcome === 'approved')).length;
  const custom = all.filter((m) => m.custom).length;
  const config = all.filter(needsConfig).length;

  return (
    <div className="@container">
      <PageHeader
        eyebrow={<><Network className="size-3.5" />Stages 5–6 · Concept Aligner, Hierarchy Agent, Code List Agent, Target Designer <ScriptedNote className="ml-2" /></>}
        title="Ontology alignment"
        description="Agents map through meaning, not through column names. Each Maximo element is bound to an Industrial Asset Ontology concept, and each concept to its IFS Cloud home, with evidence and a calibrated confidence."
      />

      {!data ? <Skeleton className="h-96" /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 @3xl:grid-cols-5">
            <Stat label="Bindings" value={all.length} sub={`${objects.length} Maximo objects`} icon={Network} tone="agent" />
            <Stat label="Avg confidence" value={avg.toFixed(2)} sub="calibrated on golden datasets" icon={Target} />
            <Stat label="Backed by precedent" value={pct(withPrec / (all.length || 1), 0)} sub={`${withPrec} from mapping memory`} icon={BrainCircuit} tone="ok" />
            <Stat label="Custom elements" value={custom} sub="NV_ fields and tables" icon={Puzzle} tone="warn" />
            <Stat label="Target config needed" value={config} sub="for the IFS consultant" icon={Settings2} tone="info" />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5">
              <Search className="size-3.5 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search field, concept or target" className="w-52 bg-transparent text-[13px] outline-none placeholder:text-ink-4" />
            </div>
            <select value={object} onChange={(e) => setObject(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none">
              <option value="all">All objects</option>
              {objects.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <Segmented size="sm" value={view} onChange={setView} options={[{ id: 'all', label: 'All' }, { id: 'low', label: 'Low confidence < 0.75', count: all.filter((m) => m.confidence < 0.75).length }]} />
            <span className="ml-auto text-[11px] text-ink-4">IFS Cloud names are to be confirmed with IFS</span>
          </div>

          <div className={cx('grid items-start gap-4', selected && '@5xl:grid-cols-[1fr_360px]')}>
            <Card pad={false} className="min-w-0 overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1.1fr)_20px_minmax(0,1fr)_auto] gap-1 border-b border-line bg-surface-2 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">
                <span>Maximo 7.6</span><span /><span className="text-agent/80">Ontology concept · {all[0] ? 'IAO 2.4' : ''}</span><span /><span className="text-accent/80">IFS Cloud</span><span className="pl-2 text-right">Confidence</span>
              </div>
              {groups.length === 0 && <div className="p-6"><Empty icon={Search} title="No bindings match">Try another filter.</Empty></div>}
              {groups.map(([obj, ms]) => (
                <div key={obj}>
                  <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-1.5 backdrop-blur">
                    <span className="font-mono text-[11.5px] font-semibold text-ink">{obj}</span>
                    <span className="text-[11px] text-ink-4">{ms.length} element{ms.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-line">
                    {ms.map((m) => <Row key={m.id} m={m} selected={sel === m.id} onClick={() => setSel(sel === m.id ? null : m.id)} />)}
                  </div>
                </div>
              ))}
            </Card>
            <AnimatePresence>
              {selected && <div className="@5xl:sticky @5xl:top-0"><SidePanel m={selected} onClose={() => setSel(null)} /></div>}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
