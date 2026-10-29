import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { BookMarked, Check, Download, FileText, FlaskConical, Globe2, Library, Lock, Radar, RotateCcw, Send, ShieldCheck, Upload, X } from 'lucide-react';
import type { Skill, SkillEffect } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { day, num, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, Empty, PageHeader, SectionLabel, Skeleton, Tabs } from '@/components/ui';

type SkillRow = Skill & { uses: number; lastUsed?: string; applies: boolean };
interface SkillsData {
  library: string | null;
  libraries: { version: string; published_at: string; published_by: string }[];
  shared: SkillRow[];
  project: SkillRow[];
  triggers: { key: string; kind: string; skillId: string; firedAt: string; data: { title: string } }[];
}

const statusTone: Record<Skill['status'], 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'agent'> = {
  draft: 'warn', approved: 'ok', measured: 'ok', proposed: 'info', tested: 'info', published: 'agent', rejected: 'crit', retired: 'neutral',
};

function effectText(e: SkillEffect) {
  switch (e.type) {
    case 'decision_rule': return `Settles ${e.question} as "${e.answer}" when the text matches /${e.pattern}/`;
    case 'prompt_hint': return `Guidance for ${e.agents.join(', ')}: ${e.text}`;
    case 'location_type_rule': return `${e.locationType} locations ${e.action === 'functional_object' ? 'become functional objects' : 'are not migrated'}`;
    case 'load_precheck': return `Before each dry-run load: check ${e.check === 'default_site' ? 'the source default site' : 'class characteristics'}`;
  }
}

const evidenceLink = (kind: string, ref: string) =>
  kind === 'mapping' ? `/review?item=${ref}` : kind === 'decision' ? `/decisions?question=${ref.split(':')[0]}&status=overridden` : kind === 'load error' ? '/proof' : undefined;

function Metric({ label, before, after, pct }: { label: string; before: number | null; after: number | null; pct?: boolean }) {
  const f = (v: number | null) => (v === null ? '—' : pct ? `${Math.round(v * 100)}%` : num(v));
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold tabular">{f(before)} <span className="text-ink-4">→</span> {f(after)}</div>
    </div>
  );
}

function SkillCard({ s, sharedLearning }: { s: SkillRow; sharedLearning: boolean }) {
  const { persona, act } = useApp();
  const canPropose = s.scope === 'project' && s.status === 'measured' && persona && ['Migration lead', 'Data subject expert'].includes(persona.role);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(s.status === 'draft');
  const canDecide = s.scope === 'project' ? persona?.role === 'Data subject expert' : persona?.role === 'Ontology curator';
  const decide = (decision: 'approve' | 'reject' | 'retire') => persona && act(() => api.post(`/skills/${s.id}/decision`, { decision, reason: reason || undefined, actor: persona.id }),
    decision === 'approve' ? `Approved "${s.name}"` : decision === 'reject' ? 'Draft rejected' : 'Skill retired');
  const m = s.measuredEffect;
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <Card pad={false}>
        <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
          <div className={cx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', s.scope === 'shared' ? 'bg-agent-soft text-agent' : 'bg-accent-soft text-accent')}>
            {s.scope === 'shared' ? <Library className="size-4" /> : <BookMarked className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold">{s.name}</span>
              <Badge tone={statusTone[s.status]} dot>{s.status}</Badge>
              <Badge tone="neutral">{s.scope === 'shared' ? 'Shared library' : 'This project'} · v{s.version}</Badge>
              {s.uses > 0 && <Badge tone="info">{num(s.uses)} uses</Badge>}
              {!s.applies && <Badge tone="neutral" title="Its conditions do not match this project, so agents do not load it">Not applicable here</Badge>}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-2">{s.description}</p>
            <div className="mt-1.5 text-[11px] text-ink-3">{s.learnedFrom} · {s.owner}{s.approvedBy ? ` · approved by ${s.approvedBy}` : ''} · {day(s.createdAt)}</div>
          </div>
        </button>
        {open && (
          <div className="space-y-4 border-t border-line px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <SectionLabel>Steps</SectionLabel>
                <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-ink-2">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
                {s.examples.length > 0 && <>
                  <SectionLabel>Worked examples</SectionLabel>
                  <ul className="space-y-1 text-[12px] text-ink-2">{s.examples.map((x, i) => <li key={i} className="rounded-md bg-sunken px-2 py-1 font-mono text-[11.5px]">{x}</li>)}</ul>
                </>}
              </div>
              <div>
                <SectionLabel>What it changes</SectionLabel>
                {s.effects.length ? (
                  <ul className="space-y-1.5">{s.effects.map((e, i) => <li key={i} className="flex gap-2 text-[12.5px] text-ink-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />{effectText(e)}</li>)}</ul>
                ) : <p className="text-xs text-ink-3">Guidance only; no machine effect.</p>}
                <SectionLabel>Applies when</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {[...(s.conditions.sourceSystems ?? []), ...(s.conditions.industryPacks ?? []), ...(s.conditions.objects ?? []), ...(s.conditions.questions ?? [])].map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
                  {!Object.values(s.conditions).some((v) => v?.length) && <Badge tone="neutral">Every project</Badge>}
                </div>
              </div>
            </div>
            {s.evidence.length > 0 && (
              <div>
                <SectionLabel>Evidence</SectionLabel>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {s.evidence.slice(0, 8).map((e, i) => {
                    const to = evidenceLink(e.kind, e.ref);
                    return (
                      <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                        <Badge tone="neutral">{e.kind}</Badge>
                        {to ? <Link to={to} className="font-mono text-accent hover:underline">{e.ref}</Link> : <span className="font-mono">{e.ref}</span>}
                        <span className="truncate text-ink-3">{e.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {(s.status === 'approved' || s.status === 'measured') && (
              <div>
                <SectionLabel right={m && !m.enoughData ? <span className="text-[11px] text-ink-3">Not enough data yet ({m.uses} uses)</span> : undefined}>Measured effect</SectionLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Accepted when the skill decided" before={m?.before.acceptance ?? null} after={m?.after.acceptance ?? null} pct />
                  <Metric label="Records waiting for a person" before={m?.before.needsReview ?? null} after={m?.after.needsReview ?? null} />
                  <Metric label="Load errors" before={m?.before.loadErrors ?? null} after={m?.after.loadErrors ?? null} />
                  <Metric label="Median review time (min)" before={m?.before.reviewMinutes ?? null} after={m?.after.reviewMinutes ?? null} />
                </div>
              </div>
            )}
            {s.statusNote && <p className="text-xs text-ink-3">Note: {s.statusNote}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <a href={`/api/projects/${encodeURIComponent(localStorage.getItem('ams-project') ?? '')}/skills/${s.id}/SKILL.md`} className="inline-flex"><Button size="sm" icon={Download}>SKILL.md</Button></a>
              <div className="flex-1" />
              {canDecide && s.status !== 'rejected' && s.status !== 'retired' && (
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={s.status === 'draft' ? 'Reason (required to reject)' : 'Reason (required to retire)'}
                  className="h-7 w-64 rounded-lg border border-line bg-surface px-2.5 text-[12px] outline-none placeholder:text-ink-4 focus:border-accent" />
              )}
              {canDecide && s.status === 'draft' && <>
                <Button size="sm" variant="danger" icon={X} disabled={!reason.trim()} onClick={() => decide('reject')}>Reject</Button>
                <Button size="sm" variant="ok" icon={Check} onClick={() => decide('approve')}>Approve for this project</Button>
              </>}
              {canPropose && <Button size="sm" icon={Send} disabled={!sharedLearning} title={sharedLearning ? 'Anonymise and send to the curator' : 'Shared learning is off for this project'} onClick={() => persona && act(() => api.post(`/skills/${s.id}/propose`, { actor: persona.id }), 'Proposed to the shared library')}>Propose for sharing</Button>}
              {canDecide && ['approved', 'measured', 'published'].includes(s.status) && <Button size="sm" icon={RotateCcw} disabled={!reason.trim()} onClick={() => decide('retire')}>Retire</Button>}
              {!canDecide && s.status === 'draft' && <span className="text-[11px] text-ink-3">A data subject expert approves project skills.</span>}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

interface CuratorData { skills: Skill[]; libraries: { version: string; publishedAt: string; publishedBy: string; skills: { id: string }[] }[] }

function CuratorTab() {
  const { persona, act } = useApp();
  const { data } = useApi<CuratorData>('/curator/skills');
  const isCurator = persona?.role === 'Ontology curator';
  if (!data) return <Skeleton className="h-48" />;
  const candidates = data.skills.filter((s) => s.status === 'proposed' || s.status === 'tested');
  const tested = candidates.filter((s) => s.status === 'tested');
  const next = data.libraries[0]?.version.replace(/(\d+)\.(\d+)\.(\d+)/, (_m, a, b) => `${a}.${Number(b) + 1}.0`);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Candidates for the shared library" icon={FlaskConical} subtitle="Anonymised project skills. Each must pass the golden datasets before it can be published."
          right={<Button size="sm" variant="agent" icon={Upload} disabled={!isCurator || !tested.length} title={isCurator ? undefined : 'Only the ontology curator publishes'} onClick={() => persona && act(() => api.post('/curator/library', { actor: persona.id }), `Published ${next}`)}>Publish {next}{tested.length ? ` with ${tested.length}` : ''}</Button>} />
        {candidates.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {candidates.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[12.5px]">
                <Badge tone={statusTone[s.status]} dot>{s.status}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="truncate text-[11.5px] text-ink-3">{s.description}</div>
                  {s.testRun && <div className={cx('text-[11px]', s.testRun.passed ? 'text-ok' : 'text-crit')}>{s.testRun.passed ? 'Golden datasets: no metric lowered' : `Golden datasets: ${s.testRun.regressions.map((r) => r.metric).join(', ')} lowered`}</div>}
                </div>
                <span className="font-mono text-[11px] text-ink-3">{s.id} · from {s.sourceProjects?.length ?? 0} project</span>
                {s.status === 'proposed' && <Button size="sm" icon={FlaskConical} disabled={!isCurator} onClick={() => persona && act(() => api.post(`/curator/skills/${s.id}/test`, { actor: persona.id }), 'Golden-dataset test finished')}>Test on golden datasets</Button>}
              </li>
            ))}
          </ul>
        ) : <Empty icon={FlaskConical} title="No candidates">Projects with shared learning switched on propose measured skills that helped.</Empty>}
      </Card>
      <Card>
        <CardHeader title="Library versions" icon={Library} />
        <ul className="divide-y divide-line">
          {data.libraries.map((l) => (
            <li key={l.version} className="flex items-center gap-3 py-2 text-[12.5px]">
              <span className="font-semibold">{l.version}</span>
              <span className="text-ink-3">{l.skills.length} skills · published by {l.publishedBy} · {day(l.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function Skills() {
  const { persona, act, dashboard } = useApp();
  const sharedLearning = !!dashboard?.project.sharedLearning;
  const [params, setParams] = useSearchParams();
  const { data } = useApi<SkillsData>('/skills');
  const tab = (params.get('tab') ?? 'use') as 'use' | 'drafts' | 'retired' | 'triggers' | 'curator';
  const setTab = (t: string) => { const p = new URLSearchParams(params); p.set('tab', t); setParams(p); };
  if (!data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const inUse = [...data.shared, ...data.project.filter((s) => ['approved', 'measured', 'proposed', 'tested', 'published'].includes(s.status))];
  const drafts = data.project.filter((s) => s.status === 'draft');
  const retired = [...data.project, ...data.shared].filter((s) => s.status === 'retired' || s.status === 'rejected');
  const list = tab === 'drafts' ? drafts : tab === 'retired' ? retired : inUse;
  const canCheck = persona && ['Migration lead', 'Data subject expert'].includes(persona.role);

  return (
    <>
      <PageHeader
        eyebrow={<><Library className="size-3.5" />Pinned shared library {data.library ?? 'none'} · {data.project.length} project skills</>}
        title="Skill library"
        description="How agents do the work on this project: steps, checks and known traps."
        actions={<>
          <select value={data.library ?? ''} disabled={persona?.role !== 'Migration lead'} title={persona?.role === 'Migration lead' ? 'Pinned shared library version' : 'Only the migration lead changes the pinned library'}
            onChange={(e) => persona && act(() => api.post('/skills/library', { version: e.target.value, actor: persona.id }), `Pinned ${e.target.value}`)}
            className="h-8.5 rounded-lg border border-line bg-surface px-2 text-[13px] outline-none disabled:opacity-60">
            {data.libraries.map((l) => <option key={l.version} value={l.version}>{l.version} · {day(l.published_at)}</option>)}
          </select>
          <Button icon={sharedLearning ? Globe2 : Lock} disabled={persona?.role !== 'Customer data owner'}
            title={persona?.role === 'Customer data owner' ? 'Shared learning follows your contract' : 'The customer data owner changes shared learning'}
            onClick={() => persona && act(() => api.post('/shared-learning', { enabled: !sharedLearning, actor: persona.id }), sharedLearning ? 'Shared learning switched off' : 'Shared learning switched on')}>
            Shared learning {sharedLearning ? 'on' : 'off'}
          </Button>
          <Button icon={Radar} disabled={!canCheck} onClick={() => persona && act(() => api.post<{ fired: string[] }>('/skills/evaluate', { actor: persona.id }).then((r) => r), 'Triggers checked')}>Check triggers</Button>
        </>}
      />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: 'use', label: 'In use', count: inUse.length },
        { id: 'drafts', label: 'Drafts', count: drafts.length },
        { id: 'retired', label: 'Retired', count: retired.length },
        { id: 'triggers', label: 'Triggers', count: data.triggers.length },
        { id: 'curator', label: 'Curator' },
      ]} />
      {tab === 'curator' ? <CuratorTab /> : tab === 'triggers' ? (
        <Card pad={false}>
          {data.triggers.length ? (
            <ul className="divide-y divide-line">
              {data.triggers.map((t) => (
                <li key={t.key} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                  <Badge tone="neutral">{t.kind.replace('_', ' ')}</Badge>
                  <span className="flex-1">{t.data.title}</span>
                  <span className="font-mono text-[11px] text-ink-3">{t.skillId}</span>
                  <span className="text-[11px] text-ink-4">{timeAgo(t.firedAt)}</span>
                </li>
              ))}
            </ul>
          ) : <div className="p-4"><Empty icon={Radar} title="No triggers have fired">Drafts appear after five same-kind corrections, five load errors for one reason, a recovery or a long successful chain.</Empty></div>}
        </Card>
      ) : list.length ? (
        <div className="space-y-3">{list.map((s) => <SkillCard key={`${s.id}-${s.version}`} s={s} sharedLearning={sharedLearning} />)}</div>
      ) : (
        <Card><Empty icon={FileText} title={tab === 'drafts' ? 'No drafts waiting' : 'Nothing here'}>{tab === 'drafts' ? 'The Ontology Steward drafts a skill when a pattern repeats on this project.' : undefined}</Empty></Card>
      )}
      <Card className="mt-5">
        <CardHeader title="Rules skills cannot break" icon={ShieldCheck} />
        <p className="text-[12.5px] text-ink-2">Skills change how agents work through a fixed set of effects. They cannot change guardrails, permissions, safety-critical or regulatory rules, or the ontology. Only the ontology curator publishes shared skills, and each project stays on its pinned library version until the migration lead upgrades it.</p>
      </Card>
    </>
  );
}
