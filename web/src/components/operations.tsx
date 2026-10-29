import { useState } from 'react';
import { CircleDollarSign, Cpu, ListChecks, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useApp } from '@/lib/app';
import { num, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, Empty, Progress, Skeleton } from '@/components/ui';
import { agentName } from '@/components/agents';

interface Usage {
  days: number;
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number; errors: number; refusals: number; p50Ms: number; p95Ms: number };
  byAgent: { agent: string; calls: number; tokens: number; costUsd: number; avgMs: number }[];
  byModel: { model: string; calls: number; tokens: number; costUsd: number }[];
  inEnvironment: { batches: number; records: number };
  budgetUsd: number | null;
  monthUsd: number;
  budgetReached: boolean;
}

interface JobRow { id: string; label: string; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'; requestedBy: string; error: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; attempts: number }

const usd = (n: number) => (n < 0.01 && n > 0 ? '< $0.01' : `$${n.toFixed(2)}`);
const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const tokensK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** Model spend, tokens and latency for the project, with the monthly budget. */
export function UsagePanel() {
  const { persona, act } = useApp();
  const { data, reload } = useApi<Usage>('/usage');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (!data) return <Skeleton className="h-56" />;
  const t = data.totals;
  const lead = persona?.role === 'Migration lead';
  const share = data.budgetUsd ? Math.min(1, data.monthUsd / data.budgetUsd) : 0;
  const save = async (budgetUsd: number | null) => {
    if (!persona) return;
    await act(() => api.post('/usage/budget', { budgetUsd, actor: persona.id }), budgetUsd == null ? 'Budget removed' : 'Budget saved');
    setEditing(false);
    reload();
  };
  const maxAgent = Math.max(0.0001, ...data.byAgent.map((a) => a.costUsd));
  return (
    <Card>
      <CardHeader title="Model usage" icon={CircleDollarSign} subtitle={`External model calls in the last ${data.days} days`}
        right={data.budgetReached ? <Badge tone="crit" dot>Budget used</Badge> : share >= 0.8 ? <Badge tone="warn" dot>{Math.round(share * 100)}% of budget</Badge> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Spend" value={usd(t.costUsd)} sub={`${usd(data.monthUsd)} this month`} />
        <Metric label="Calls" value={num(t.calls)} sub={t.errors || t.refusals ? `${t.errors} failed · ${t.refusals} declined` : 'none failed'} />
        <Metric label="Tokens" value={tokensK(t.inputTokens + t.outputTokens)} sub={`${tokensK(t.inputTokens)} in · ${tokensK(t.outputTokens)} out`} />
        <Metric label="Latency" value={secs(t.p50Ms)} sub={`p95 ${secs(t.p95Ms)}`} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-ink-3">
          <span>Monthly budget</span>
          {editing ? (
            <span className="flex items-center gap-1.5">
              <span>$</span>
              <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-24 rounded-md border border-line bg-surface px-2 text-right text-xs tabular" />
              <Button size="sm" disabled={!(Number(value) >= 0) || value.trim() === ''} onClick={() => save(Number(value))}>Save</Button>
              {data.budgetUsd != null && <Button size="sm" onClick={() => save(null)}>Remove</Button>}
              <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="tabular">{data.budgetUsd != null ? `${usd(data.monthUsd)} of ${usd(data.budgetUsd)}` : 'No limit'}</span>
              {lead && <button className="font-medium text-accent hover:underline" onClick={() => { setValue(data.budgetUsd != null ? String(data.budgetUsd) : ''); setEditing(true); }}>{data.budgetUsd != null ? 'Change' : 'Set budget'}</button>}
            </span>
          )}
        </div>
        {data.budgetUsd != null && <Progress value={share} tone={data.budgetReached ? 'crit' : share >= 0.8 ? 'warn' : 'ok'} />}
        {data.budgetReached && <p className="mt-1.5 text-[11.5px] text-ink-3">External calls are paused until next month. Decisions continue on the in-environment model; the reasoning check and the assistant's model answers resume when the budget allows.</p>}
      </div>

      <div className="mt-4 space-y-1.5">
        {data.byAgent.map((a) => (
          <div key={a.agent} className="grid grid-cols-[120px_minmax(0,1fr)_64px_64px] items-center gap-2 text-xs">
            <span className="truncate font-medium text-ink-2">{agentName[a.agent] ?? a.agent}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-agent" style={{ width: `${(a.costUsd / maxAgent) * 100}%` }} /></div>
            <span className="text-right tabular text-ink-3">{num(a.calls)} calls</span>
            <span className="text-right tabular">{usd(a.costUsd)}</span>
          </div>
        ))}
        {!data.byAgent.length && <p className="text-xs text-ink-3">No external model calls in this period.</p>}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
        <Cpu className="size-3.5" />
        <span>{num(data.inEnvironment.records)} records settled in the environment ({num(data.inEnvironment.batches)} batches) at no model cost.</span>
      </div>
    </Card>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-sunken/60 p-2.5">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="text-lg font-semibold tabular">{value}</div>
      <div className="truncate text-[11px] text-ink-4">{sub}</div>
    </div>
  );
}

const jobTone = { queued: 'neutral', running: 'agent', done: 'ok', failed: 'crit', cancelled: 'neutral' } as const;

/** Queued, running and recent background jobs of the project. */
export function BackgroundWork() {
  const { data } = useApi<JobRow[]>('/jobs');
  if (!data) return <Skeleton className="h-40" />;
  return (
    <Card pad={false}>
      <div className="border-b border-line px-4 py-3"><CardHeader className="mb-0" title="Background work" icon={ListChecks} subtitle="Stage runs, decision batches and model training run on the platform's workers, one job per project at a time." /></div>
      {data.length ? (
        <ul className="divide-y divide-line">
          {data.slice(0, 6).map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
              {j.status === 'running' ? <Loader2 className="size-3.5 animate-spin text-agent" /> : <span className={cx('size-2 rounded-full', j.status === 'done' ? 'bg-ok' : j.status === 'failed' ? 'bg-crit' : 'bg-ink-4')} />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{j.label}</div>
                <div className="truncate text-[11.5px] text-ink-3">
                  {j.requestedBy} · {timeAgo(j.createdAt)}
                  {j.startedAt && j.finishedAt ? ` · took ${secs(new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime())}` : ''}
                  {j.attempts > 1 ? ` · attempt ${j.attempts}` : ''}
                  {j.error ? ` · ${j.error}` : ''}
                </div>
              </div>
              <Badge tone={jobTone[j.status]}>{j.status}</Badge>
            </li>
          ))}
        </ul>
      ) : <div className="p-4"><Empty icon={ListChecks} title="No background work yet">Starting a stage or a decision batch queues a job here.</Empty></div>}
    </Card>
  );
}
