import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, Cpu, Gauge, Hand, Play, Sparkles, SquareFunction, Timer, UserRound } from 'lucide-react';
import type { DecisionBatch, DecisionQuestionInfo, ModelDecision } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { num, pct, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, Confidence, cx, Empty, Mono, PageHeader, Segmented, SectionLabel, Skeleton } from '@/components/ui';

interface QuestionsInfo { questions: DecisionQuestionInfo[]; model: string; reasoningModel: string | null; thresholds: { auto: number; human: number; sample: number } }
interface Stats {
  byStep: { question_id: string; step: string; status: string; n: number; conf: number }[];
  answers: { question_id: string; answer: string; n: number }[];
  batches: DecisionBatch[];
}

const STEPS = [
  { id: 'rule', label: 'Rules', icon: SquareFunction, tone: 'bg-ink-3' },
  { id: 'model', label: 'Decision model', icon: Cpu, tone: 'bg-info' },
  { id: 'reasoning', label: 'Reasoning model', icon: Sparkles, tone: 'bg-agent' },
  { id: 'human', label: 'People', icon: UserRound, tone: 'bg-warn' },
] as const;

function Funnel({ stats, question }: { stats: Stats; question: string }) {
  const rows = stats.byStep.filter((r) => r.question_id === question);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const by = (step: string) => rows.filter((r) => r.step === step).reduce((s, r) => s + r.n, 0);
  const open = rows.filter((r) => r.status === 'needs_review').reduce((s, r) => s + r.n, 0);
  if (!total) return <Empty icon={Gauge} title="No decisions yet">Run the question to tag the records.</Empty>;
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full">
        {STEPS.map((s) => <motion.div key={s.id} className={s.tone} initial={{ width: 0 }} animate={{ width: `${(by(s.id) / total) * 100}%` }} title={`${s.label}: ${by(s.id)}`} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.id} className="rounded-lg border border-line bg-surface-2 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-ink-3"><span className={cx('size-2 rounded-sm', s.tone)} /><s.icon className="size-3.5" />{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular">{num(by(s.id))}</div>
            <div className="text-[11px] text-ink-3 tabular">{pct(by(s.id) / total)} settled here</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
        <span className="tabular">{num(total)} records</span>
        {open > 0 ? <Badge tone="warn" icon={Hand}>{num(open)} waiting for a person</Badge> : <Badge tone="ok" icon={Check}>All settled</Badge>}
      </div>
    </>
  );
}

function ReviewRow({ d, onDone }: { d: ModelDecision; onDone: () => void }) {
  const { persona, act } = useApp();
  const [choice, setChoice] = useState(d.reasoning?.answer ?? d.answer);
  const [note, setNote] = useState('');
  const ranked = Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const submit = async (decision: 'accept' | 'override') => {
    if (!persona) return;
    const r = await act(() => api.post(`/decisions/${encodeURIComponent(d.id)}`, { decision, answer: decision === 'override' ? choice : undefined, note: note || undefined, actor: persona.id }), decision === 'accept' ? `Accepted ${d.recordKey}` : `Tag set on ${d.recordKey}`);
    if (r) onDone();
  };
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-3 px-4 py-3 lg:grid-cols-[1.3fr_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Mono className="font-medium text-ink">{d.recordKey}</Mono>
          <Badge tone="neutral">{d.context.assetClass}</Badge>
          {d.sampled && <Badge tone="info">Review sample</Badge>}
          {d.reasoning && d.reasoning.answer !== d.answer && <Badge tone="warn">Models disagree</Badge>}
        </div>
        <p className="mt-1.5 rounded-lg bg-sunken px-2.5 py-1.5 text-[13px] text-ink-2">{d.input}</p>
        <div className="mt-2 space-y-1">
          {ranked.map(([opt, p]) => (
            <div key={opt} className="flex items-center gap-2 text-xs">
              <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-sunken"><div className="absolute inset-y-0 left-0 rounded-full bg-info" style={{ width: `${p * 100}%` }} /></div>
              <span className="w-9 tabular text-ink-3">{p.toFixed(2)}</span>
              <span className="truncate text-ink-2">{opt}</span>
            </div>
          ))}
        </div>
        {d.reasoning && (
          <div className="mt-2 flex gap-2 text-xs text-ink-2"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-agent" /><span><b className="font-medium text-ink">{d.reasoning.answer}</b> · {d.reasoning.explanation}</span></div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent">
          {d.options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (required to change the tag)" className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] outline-none placeholder:text-ink-4 focus:border-accent" />
        <div className="flex gap-2">
          <Button size="sm" variant="ok" icon={Check} onClick={() => submit('accept')}>Accept {d.answer.replace(/\s*\(\w+\)/, '')}</Button>
          <Button size="sm" disabled={choice === d.answer || !note.trim()} onClick={() => submit('override')}>Set tag</Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Decisions() {
  const { runStage, persona, act, dashboard } = useApp();
  const [params, setParams] = useSearchParams();
  const { data: info } = useApi<QuestionsInfo>('/decisions/questions');
  const { data: stats } = useApi<Stats>('/decisions/stats');
  const question = params.get('question') ?? info?.questions[0]?.id ?? 'wo.failure_mode';
  const status = params.get('status') ?? 'needs_review';
  const { data: list, reload } = useApi<ModelDecision[]>(`/decisions?question=${question}&status=${status}&limit=50`);
  const q = info?.questions.find((x) => x.id === question);
  const latest = useMemo(() => stats?.batches.find((b) => b.questionId === question), [stats, question]);
  const answers = (stats?.answers ?? []).filter((a) => a.question_id === question).slice(0, 8);
  const maxAnswer = Math.max(1, ...answers.map((a) => a.n));
  const canRun = persona && ['Migration lead', 'Data subject expert'].includes(persona.role);
  const run = () => persona && act(() => api.post('/decisions/run', { question, actor: persona.id }), 'Decision batch started');

  if (!info || !stats) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  return (
    <>
      <PageHeader
        eyebrow={<><Gauge className="size-3.5" />{info.model}{info.reasoningModel ? ` · reasoning ${info.reasoningModel}` : ''} · auto-accept ≥ {info.thresholds.auto} · person &lt; {info.thresholds.human}</>}
        title="Bulk decisions"
        description="Typed decisions on records, settled by rules, the decision model, the reasoning model or a person."
        actions={<>
          <Button icon={Play} disabled={!canRun || !!dashboard?.running} onClick={run} title={canRun ? undefined : 'Migration leads and data subject experts run decision batches'}>Run {q?.label.toLowerCase()}</Button>
          <Button variant="agent" icon={Play} disabled={!!dashboard?.running} onClick={() => runStage(8)}>Start dry run</Button>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={q?.label} subtitle={q?.description} icon={Gauge} right={<Badge tone="neutral">{q?.kind} · {q?.fields.join(', ')}</Badge>} />
          <Funnel stats={stats} question={question} />
        </Card>
        <Card>
          <CardHeader title="Last batch" icon={Timer} subtitle={latest ? `${timeAgo(latest.finishedAt)} · ${latest.model}` : 'Not run yet'} />
          {latest ? (
            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
              {[
                ['Records', num(latest.counts.records)],
                ['Distinct texts', num(latest.counts.unique)],
                ['Answered from cache', num(latest.counts.cacheHits)],
                ['Model calls', num(latest.counts.modelCalls)],
                ['Review sample', num(latest.counts.sampled)],
                ['Tokens', num(latest.tokens)],
                ['Cost', `$${latest.costUsd.toFixed(4)}`],
                ['Elapsed', `${(latest.ms / 1000).toFixed(1)} s`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface-2 px-2.5 py-2"><div className="text-[11px] text-ink-3">{k}</div><div className="mt-0.5 font-semibold tabular">{v}</div></div>
              ))}
            </div>
          ) : <Empty icon={Timer} title="No batches yet" />}
        </Card>
      </div>

      {answers.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Settled answers" subtitle="Accepted and corrected tags" />
          <div className="space-y-1.5">
            {answers.map((a) => (
              <div key={a.answer} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-72 truncate text-ink-2">{a.answer}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-sunken"><motion.div className="absolute inset-y-0 left-0 rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(a.n / maxAnswer) * 100}%` }} /></div>
                <span className="w-14 text-right tabular text-ink-3">{num(a.n)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-5">
        <SectionLabel right={
          <Segmented size="sm" value={status} onChange={(v) => { const p = new URLSearchParams(params); p.set('status', v); setParams(p); }}
            options={[{ id: 'needs_review', label: 'Needs a person' }, { id: 'accepted', label: 'Accepted' }, { id: 'overridden', label: 'Corrected' }]} />
        }>Records</SectionLabel>
        <Card pad={false}>
          {!list ? <Skeleton className="m-4 h-24" /> : list.length === 0 ? (
            <div className="p-4"><Empty icon={Check} title={status === 'needs_review' ? 'Nothing waiting for a person' : 'No records'} /></div>
          ) : status === 'needs_review' ? (
            <div className="divide-y divide-line">{list.map((d) => <ReviewRow key={d.id} d={d} onDone={reload} />)}</div>
          ) : (
            <div className="divide-y divide-line">
              {list.map((d) => (
                <div key={d.id} className="grid grid-cols-[110px_1fr_220px_90px] items-center gap-3 px-4 py-2 text-[12.5px]">
                  <Mono>{d.recordKey}</Mono>
                  <span className="truncate text-ink-2">{d.input}</span>
                  <span className="truncate font-medium">{d.answer}</span>
                  <span className="flex justify-end">{d.step === 'human' ? <Badge tone="neutral" icon={UserRound}>{d.decidedBy}</Badge> : <Confidence value={d.confidence} />}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
