import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowRight, Ban, Check, CheckCheck, CircleHelp, Inbox, Layers, MessageSquareText, PartyPopper, Pencil, ShieldAlert, Sparkles, Undo2, X,
} from 'lucide-react';
import type { Mapping, Question } from '@shared/types';
import { useApi, useApp, useAssistantFocus } from '@/lib/app';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import {
  Badge, Button, Card, Confidence, cx, Empty, Kbd, Mono, PageHeader, PathBadge, Progress, SectionLabel, Segmented, Skeleton, Tabs,
} from '@/components/ui';
import { AgentAvatar, PersonAvatar } from '@/components/agents';
import { agentIdByName, EvidenceBar, evidenceMeta, FlowNodes, isPending, PrecedentList, statusMeta } from '@/components/b/shared';

type Filter = 'pending' | 'named' | 'expert' | 'quick' | 'auto' | 'decided';
type Mode = null | 'approve' | 'reject' | 'change' | 'not_migrated';

const riskRank = { high: 0, medium: 1, low: 2 } as const;
// Review risk from the decision layer comes first (5 = highest); the agent's risk level breaks ties.
const byRiskThenConfidence = (a: Mapping, b: Mapping) => (b.riskScore ?? 0) - (a.riskScore ?? 0) || riskRank[a.risk] - riskRank[b.risk] || a.confidence - b.confidence;

function matches(m: Mapping, f: Filter) {
  if (f === 'decided') return !isPending(m);
  if (!isPending(m)) return false;
  if (f === 'pending') return true;
  if (f === 'auto') return m.path === 'auto';
  return m.path === f;
}

// ---------------- Queue row ----------------

function QueueRow({ m, selected, onClick }: { m: Mapping; selected: boolean; onClick: () => void }) {
  const st = statusMeta[m.status];
  return (
    <motion.button layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20, height: 0 }} onClick={onClick}
      data-id={m.id}
      className={cx('relative w-full border-b border-line px-3 py-2.5 text-left transition-colors last:border-0', selected ? 'bg-accent-soft/60' : 'hover:bg-surface-2')}>
      {selected && <motion.span layoutId="review-sel" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <div className="flex items-center gap-2">
        <span className={cx('size-1.5 shrink-0 rounded-full', m.risk === 'high' ? 'bg-crit' : m.risk === 'medium' ? 'bg-warn' : 'bg-ink-4')} title={`${m.risk} risk`} />
        <span className="font-mono text-[11px] text-ink-3">{m.id}</span>
        <Mono className="min-w-0 flex-1 truncate font-medium text-ink">{m.sourceElements.join(' + ')}</Mono>
        <Confidence value={m.confidence} showBar={false} />
      </div>
      <div className="mt-1 flex items-center gap-1.5 pl-3.5">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">→ {m.conceptLabel}</span>
        {!!m.skills?.length && <Badge tone="agent" title={`Shaped by ${m.skills.map((s) => `${s.name} v${s.version}`).join(', ')}`}>Skill</Badge>}
        {m.riskScore !== undefined && <Badge tone={m.riskScore >= 4 ? 'crit' : m.riskScore === 3 ? 'warn' : 'neutral'} title="Review risk, 1 to 5">Risk {m.riskScore}</Badge>}
        {m.safetyCritical && <Badge tone="crit">Safety</Badge>}
        {m.regulatory && <Badge tone="crit">Regulatory</Badge>}
        {m.custom && <Badge tone="warn">Custom</Badge>}
        {m.status === 'question' && <Badge tone="warn">Question</Badge>}
        {!isPending(m) && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>
    </motion.button>
  );
}

// ---------------- Detail ----------------

function DecisionPanel({ m, mode, setMode, onDone }: { m: Mapping; mode: Mode; setMode: (m: Mode) => void; onDone: (id: string) => void }) {
  const { persona, act } = useApp();
  const [note, setNote] = useState('');
  const [target, setTarget] = useState(m.target);
  const [rule, setRule] = useState(m.rule);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setNote(''); setTarget(m.target); setRule(m.rule); }, [m.id, m.target, m.rule]);
  useEffect(() => { if (mode) setTimeout(() => noteRef.current?.focus(), 30); }, [mode]);

  const named = m.path === 'named';
  const submit = async (decision: 'approve' | 'reject' | 'change' | 'not_migrated') => {
    if (!persona) return;
    const body: Record<string, unknown> = { decision, actor: persona.id, note: note.trim() || undefined };
    if (decision === 'change') body.change = { target, rule };
    const label = { approve: 'Approved', reject: 'Rejected', change: 'Change sent back to the agent', not_migrated: 'Marked not migrated' }[decision];
    const r = await act(() => api.post<Mapping>(`/mappings/${m.id}/decision`, body), `${label} · ${m.id} · recorded against ${persona.name}`);
    if (r) { setMode(null); onDone(m.id); }
  };

  const needsNote = mode === 'reject' || mode === 'change' || mode === 'not_migrated' || (mode === 'approve' && named);
  const placeholder = {
    approve: 'Named review note, e.g. "Checked against the compliance register"',
    reject: 'Why is this wrong? The agent learns from your reason.',
    change: 'Tell the agent what you changed and why',
    not_migrated: 'Why will this not be migrated?',
  } as const;

  if (!isPending(m) && !mode) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <Badge tone={statusMeta[m.status].tone}>{statusMeta[m.status].label}</Badge>
        <span className="text-xs text-ink-3">{m.reviewer ? <>by <b className="font-medium text-ink-2">{m.reviewer}</b></> : 'Accepted automatically at ≥ 0.95'}{m.reviewNote ? ` · “${m.reviewNote}”` : ''}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface shadow-pop">
      <AnimatePresence initial={false}>
        {mode && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-line">
            <div className="space-y-2.5 p-3">
              {mode === 'change' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-ink-3">IFS Cloud target
                    <input value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs text-ink-3">Transformation rule
                    <input value={rule} onChange={(e) => setRule(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent" />
                  </label>
                </div>
              )}
              <textarea ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={placeholder[mode]}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && note.trim()) submit(mode); if (e.key === 'Escape') setMode(null); }}
                className="block w-full resize-none rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] outline-none placeholder:text-ink-4 focus:border-accent" />
              <div className="flex items-center gap-2">
                <Button size="sm" variant={mode === 'reject' ? 'danger' : mode === 'approve' ? 'ok' : 'primary'} disabled={needsNote && !note.trim()} onClick={() => submit(mode)} kbd="Ctrl ↵">
                  {{ approve: 'Approve as named reviewer', reject: 'Reject with reason', change: 'Send change to agent', not_migrated: 'Confirm not migrated' }[mode]}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                <span className="ml-auto text-[11px] text-ink-4">Recorded against {persona?.name}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <Button variant="ok" icon={Check} kbd="A" onClick={() => (named ? setMode('approve') : submit('approve'))}>Approve</Button>
        <Button icon={Pencil} kbd="C" onClick={() => setMode('change')}>Change</Button>
        <Button variant="danger" icon={X} kbd="R" onClick={() => setMode('reject')}>Reject</Button>
        <Button variant="ghost" icon={Ban} kbd="N" onClick={() => setMode('not_migrated')}>Not migrated</Button>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-3">
          {persona && <><PersonAvatar initials={persona.initials} size="sm" /><span className="hidden sm:inline">Signed in as <b className="font-medium text-ink-2">{persona.name}</b> · {persona.role}</span></>}
        </div>
      </div>
    </div>
  );
}

function Detail({ m, mode, setMode, onDone }: { m: Mapping; mode: Mode; setMode: (m: Mode) => void; onDone: (id: string) => void }) {
  const { ask } = useApp();
  useAssistantFocus(m.id, m.sourceElements.join(' + '));
  const label = m.sourceElements.join(' + ');
  const agentId = agentIdByName[m.agent] ?? 'aligner';
  return (
    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      {m.path === 'named' && isPending(m) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-crit/30 bg-crit-soft px-3.5 py-2.5 text-[12.5px] text-crit">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div><b className="font-semibold">{m.safetyCritical ? 'Safety-critical' : 'Regulatory'} · named reviewer required.</b> Add a note to approve. Allowed roles: data expert, data owner, IFS consultant.</div>
        </div>
      )}
      {m.status === 'question' && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn">
          <CircleHelp className="mt-0.5 size-4 shrink-0" />
          <div>Open business questions block this item. <Link to="/review?tab=questions" className="font-semibold underline underline-offset-2">Answer them</Link> and the Code List Agent re-proposes it.</div>
        </div>
      )}
      {m.path === 'auto' && isPending(m) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok-soft px-3.5 py-2.5 text-[12.5px] text-ok">
          <Layers className="mt-0.5 size-4 shrink-0" />
          <div>Auto-accepted at ≥ 0.95 · <b className="font-semibold">selected for spot check</b></div>
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">{m.id}</span>
          <PathBadge path={m.path} />
          <Badge tone={m.risk === 'high' ? 'crit' : m.risk === 'medium' ? 'warn' : 'neutral'}>{m.risk} risk</Badge>
          {m.custom && <Badge tone="warn">Custom element</Badge>}
          <Badge tone="neutral">{m.kind.replace(/_/g, ' ')}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <AgentAvatar id={agentId} size="sm" />
            <span className="text-xs text-ink-3">{m.agent} · v{m.version}</span>
          </div>
        </div>
        <FlowNodes m={m} />
        {m.targetNote && (
          <div className="mt-2"><Badge tone="warn">{m.targetNote.replace(/^Requires IFS configuration:\s*/i, 'Requires ')}</Badge></div>
        )}
        <div className="mt-4 rounded-lg bg-sunken px-3 py-2.5">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">Transformation rule</div>
          <div className="mt-0.5 text-[13px] text-ink">{m.rule}</div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <SectionLabel>Calibrated confidence</SectionLabel>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-semibold tracking-tight tabular">{m.confidence.toFixed(2)}</span>
              <span className="text-xs text-ink-3">≈ {pct(m.confidence, 0)} of past proposals at this score were approved</span>
            </div>
          </div>
          <Button size="sm" variant="ghost" icon={Sparkles} className="text-agent" kbd="?" onClick={() => ask(`Why was ${m.id} proposed?`, { itemId: m.id, label })}>Why?</Button>
        </div>
        <EvidenceBar m={m} />
        <ul className="mt-4 space-y-2">
          {m.evidence.map((e, i) => {
            const meta = evidenceMeta[e.type];
            return (
              <li key={i} className="flex gap-3">
                <div className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-sunken', meta.text)}><meta.icon className="size-3.5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={cx('font-semibold', meta.text)}>{meta.label}</span>
                    <span className="truncate text-ink-4">{e.source}</span>
                    <span className="ml-auto font-mono text-ink-4">+{Math.round(e.weight * 100)}</span>
                  </div>
                  <div className="text-[13px] leading-relaxed text-ink-2">{e.content}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card>
          <SectionLabel>Sample values</SectionLabel>
          {m.samples.length ? (
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[11px] text-ink-4"><th className="pb-1.5 font-medium">Maximo</th><th /><th className="pb-1.5 font-medium">IFS Cloud</th></tr></thead>
              <tbody>
                {m.samples.map((s, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 pr-2 font-mono text-ink-2">{s.source}</td>
                    <td className="px-1"><ArrowRight className="size-3 text-ink-4" /></td>
                    <td className="py-1.5 font-mono text-ink">{s.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="text-xs text-ink-3">No sample values attached. Samples stay in the tenant's isolated storage.</div>}
        </Card>
        <Card>
          <SectionLabel right={<Badge tone="agent">Mapping memory</Badge>}>Seen in earlier projects</SectionLabel>
          <PrecedentList items={m.precedents} />
        </Card>
      </div>

      {m.alternatives.length > 0 && (
        <Card>
          <SectionLabel>Alternatives considered</SectionLabel>
          <ul className="space-y-2">
            {m.alternatives.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-dashed border-line px-3 py-2">
                <Undo2 className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
                <div className="min-w-0 flex-1">
                  <Mono className="text-ink">{a.target}</Mono>
                  <div className="text-xs text-ink-3">Not chosen: {a.whyNot}</div>
                </div>
                <Confidence value={a.confidence} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {m.reviewNote && isPending(m) && (
        <Card><SectionLabel>Reviewer note</SectionLabel><p className="text-[13px] text-ink-2">{m.reviewNote}</p></Card>
      )}

      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-bg via-bg to-transparent pb-1 pt-4">
        <DecisionPanel m={m} mode={mode} setMode={setMode} onDone={onDone} />
      </div>
    </motion.div>
  );
}

// ---------------- Bulk approval ----------------

function BulkCard({ items, onDone }: { items: Mapping[]; onDone: () => void }) {
  const { persona, act, toast } = useApp();
  const groups = useMemo(() => {
    const g = new Map<string, Mapping[]>();
    for (const m of items) if (m.patternKey && m.status === 'proposed' && m.path !== 'named') g.set(m.patternKey, [...(g.get(m.patternKey) ?? []), m]);
    return [...g.entries()].filter(([, ms]) => ms.length > 1);
  }, [items]);
  if (!groups.length) return null;
  return (
    <div className="space-y-2">
      {groups.map(([key, ms]) => (
        <div key={key} className="flex items-center gap-3 rounded-xl border border-accent-line bg-accent-soft/60 px-3.5 py-2.5">
          <CheckCheck className="size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1 text-[12.5px]">
            <b className="font-semibold text-ink">{ms.length} items share the evidence pattern “{key}”</b>
            <div className="truncate text-[11px] text-ink-3">{ms.map((m) => m.sourceElements[0]).join(' · ')}</div>
          </div>
          <Button size="sm" variant="primary" onClick={async () => {
            const r = await act(() => api.post<{ approved: string[] }>('/mappings/bulk', { ids: ms.map((m) => m.id), actor: persona?.id }));
            if (r) { onDone(); toast(`${r.approved.length} items approved in bulk. Named items are never bulk-approved.`); }
          }}>Approve all {ms.length}</Button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Questions ----------------

function Questions({ questions }: { questions: Question[] }) {
  const { meta, persona, act, setPersona } = useApp();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const open = questions.filter((q) => q.status === 'open');
  const done = questions.filter((q) => q.status === 'answered');
  const answer = (q: Question, text: string) => act(() => api.post(`/questions/${q.id}`, { answer: text, actor: persona?.id }), `Answer recorded for ${q.id}`);
  return (
    <div className="space-y-3">
      {open.length === 0 && <Empty icon={PartyPopper} title="No open business questions">Every business question has an answer.</Empty>}
      {open.map((q) => {
        const who = meta?.people.find((p) => p.id === q.assignedTo);
        const isMe = persona?.id === q.assignedTo;
        return (
          <motion.div key={q.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="font-mono text-ink-3">{q.id}</span>
                <Badge tone="neutral">About {q.item}</Badge>
                {who && <span className="ml-auto flex items-center gap-1.5 text-ink-3"><PersonAvatar initials={who.initials} size="sm" />Assigned to <b className="font-medium text-ink-2">{who.name}</b> · {who.role}</span>}
              </div>
              <p className="text-[14px] font-medium leading-relaxed text-ink">{q.text}</p>
              {!isMe && who && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">
                  <AlertTriangle className="size-3.5" /> Assigned to {who.name} · {who.role}
                  <button className="font-semibold underline underline-offset-2" onClick={() => setPersona(who.id)}>Switch user</button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options?.map((o) => <Button key={o} size="sm" disabled={!isMe} onClick={() => answer(q, o)}>{o}</Button>)}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={draft[q.id] ?? ''} onChange={(e) => setDraft({ ...draft, [q.id]: e.target.value })} disabled={!isMe} placeholder="Or write your own answer…"
                  className="h-8 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] outline-none focus:border-accent disabled:opacity-50" />
                <Button size="sm" variant="primary" disabled={!isMe || !draft[q.id]?.trim()} onClick={() => answer(q, draft[q.id])}>Answer</Button>
              </div>
            </Card>
          </motion.div>
        );
      })}
      {done.length > 0 && (
        <div>
          <SectionLabel>Answered</SectionLabel>
          <div className="space-y-2">
            {done.map((q) => (
              <div key={q.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px]">
                <Check className="mt-0.5 size-4 text-ok" />
                <div><div className="text-ink-2">{q.text}</div><div className="mt-0.5 font-medium text-ink">→ {q.answer}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Page ----------------

export default function Review() {
  const { data: mappings, reload } = useApi<Mapping[]>('/mappings');
  const { data: questions } = useApi<Question[]>('/questions');
  const { ask, persona, act } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'questions' ? 'questions' : 'queue';
  const filter = (params.get('path') as Filter) || 'pending';
  const [selId, setSelId] = useState<string | null>(params.get('item'));
  const [mode, setMode] = useState<Mode>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = mappings ?? [];
  const counts = useMemo(() => ({
    pending: all.filter((m) => matches(m, 'pending')).length,
    named: all.filter((m) => matches(m, 'named')).length,
    expert: all.filter((m) => matches(m, 'expert')).length,
    quick: all.filter((m) => matches(m, 'quick')).length,
    auto: all.filter((m) => matches(m, 'auto')).length,
    decided: all.filter((m) => matches(m, 'decided')).length,
  }), [all]);
  const list = useMemo(() => all.filter((m) => matches(m, filter)).sort(byRiskThenConfidence), [all, filter]);
  const selected = all.find((m) => m.id === selId) ?? list[0];

  // keep URL in sync with the selection
  useEffect(() => {
    if (selected && params.get('item') !== selected.id && tab === 'queue') {
      const p = new URLSearchParams(params); p.set('item', selected.id); setParams(p, { replace: true });
    }
  }, [selected, params, setParams, tab]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${selected?.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);

  const setFilter = (f: Filter) => { const p = new URLSearchParams(params); p.set('path', f); p.delete('item'); setParams(p); setSelId(null); setMode(null); };
  const setTab = (t: 'queue' | 'questions') => { const p = new URLSearchParams(params); if (t === 'questions') p.set('tab', 'questions'); else p.delete('tab'); setParams(p); };

  const move = useCallback((d: number) => {
    if (!list.length) return;
    const i = Math.max(0, Math.min(list.length - 1, (selected ? list.findIndex((m) => m.id === selected.id) : -1) + d));
    setSelId(list[i].id); setMode(null);
  }, [list, selected]);

  const onDone = useCallback((id: string) => {
    // advance to the next pending item in the current order
    const i = list.findIndex((m) => m.id === id);
    const rest = list.filter((m) => m.id !== id);
    const next = rest[Math.min(i, rest.length - 1)];
    setSelId(filter === 'decided' ? id : next?.id ?? null);
    reload();
  }, [list, filter, reload]);

  const quickApprove = useCallback(async () => {
    if (!selected || !persona) return;
    const r = await act(() => api.post<Mapping>(`/mappings/${selected.id}/decision`, { decision: 'approve', actor: persona.id }), `Approved · ${selected.id} · recorded against ${persona.name}`);
    if (r) onDone(selected.id);
  }, [selected, persona, act, onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== 'queue' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (!selected || !isPending(selected)) return;
      else if (k === 'a') { e.preventDefault(); if (selected.path === 'named') setMode('approve'); else quickApprove(); }
      else if (k === 'r') { e.preventDefault(); setMode('reject'); }
      else if (k === 'c') { e.preventDefault(); setMode('change'); }
      else if (k === 'n') { e.preventDefault(); setMode('not_migrated'); }
      else if (e.key === '?') { e.preventDefault(); ask(`Why was ${selected.id} proposed?`, { itemId: selected.id, label: selected.sourceElements.join(' + ') }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, move, selected, ask, quickApprove]);

  const total = all.length;
  const decided = counts.decided;
  const openQ = questions?.filter((q) => q.status === 'open').length ?? 0;

  return (
    <div className="@container">
      <PageHeader
        eyebrow={<><Inbox className="size-3.5" />Stage 7 · {counts.pending} pending</>}
        title="Review queue"
        description="Sorted by risk, then lowest confidence first."
        actions={
          <div className="w-56">
            <div className="mb-1 flex justify-between text-xs text-ink-3"><span>Decided</span><span className="tabular">{decided}/{total}</span></div>
            <Progress value={total ? decided / total : 0} tone="ok" />
          </div>
        }
      />

      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Mappings', count: counts.pending }, { id: 'questions', label: 'Business questions', count: openQ }]} />

      {tab === 'questions' ? (
        questions ? <Questions questions={questions} /> : <Skeleton className="h-48" />
      ) : !mappings ? (
        <div className="grid gap-4 @3xl:grid-cols-[320px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Segmented value={filter} onChange={setFilter} size="sm" options={[
              { id: 'pending', label: 'All pending', count: counts.pending },
              { id: 'named', label: 'Named', count: counts.named },
              { id: 'expert', label: 'Expert', count: counts.expert },
              { id: 'quick', label: 'Quick', count: counts.quick },
              { id: 'auto', label: 'Auto sample', count: counts.auto },
              { id: 'decided', label: 'Decided', count: counts.decided },
            ]} />
            <div className="ml-auto hidden items-center gap-1.5 text-[11px] text-ink-4 @3xl:flex">
              <Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>C</Kbd> change · <Kbd>R</Kbd> reject · <Kbd>?</Kbd> ask
            </div>
          </div>
          {filter !== 'decided' && <div className="mb-3"><BulkCard items={list} onDone={reload} /></div>}

          <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(260px,320px)_1fr]">
            <Card pad={false} className="@3xl:sticky @3xl:top-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11px] text-ink-3">
                <span>{list.length} items · risk, then confidence</span>
              </div>
              <div ref={listRef} className="max-h-[340px] overflow-y-auto @3xl:max-h-[calc(100vh-280px)]">
                <AnimatePresence initial={false}>
                  {list.map((m) => <QueueRow key={m.id} m={m} selected={selected?.id === m.id} onClick={() => { setSelId(m.id); setMode(null); }} />)}
                </AnimatePresence>
                {!list.length && (
                  <div className="px-4 py-10 text-center">
                    <PartyPopper className="mx-auto mb-2 size-6 text-ok" />
                    <div className="text-sm font-medium">Queue clear</div>
                    <div className="mt-1 text-xs text-ink-3">Nothing left in this view. Try another filter.</div>
                  </div>
                )}
              </div>
            </Card>
            <div className="min-w-0">
              <AnimatePresence mode="wait">
                {selected ? (
                  <Detail key={selected.id} m={selected} mode={mode} setMode={setMode} onDone={onDone} />
                ) : (
                  <Empty icon={MessageSquareText} title="Nothing selected">Pick an item from the queue.</Empty>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
