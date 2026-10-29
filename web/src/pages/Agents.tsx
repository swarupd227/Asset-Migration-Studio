import { useState } from 'react';
import { useApi } from '@/lib/app';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Button } from '@/components/ui';
import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { Bot, CheckCircle2, Database, FlaskConical, ShieldCheck, Wrench, XCircle } from 'lucide-react';
import { useApp } from '@/lib/app';
import { Badge, Card, CardHeader, cx, Mono, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { AgentAvatar } from '@/components/agents';
import { CalibrationChart } from '@/components/c/charts';

// Tools each agent may call. Fixed per agent.
const tools: Record<string, string[]> = {
  orchestrator: ['plan.stages', 'queue.assign', 'people.ask', 'ifs.migration_job'],
  harvester: ['sql.read_dictionary', 'odata.metadata'],
  profiler: ['profile.run', 'sample.read'],
  'code-reader': ['re_harness.parse', 're_harness.trace_writes'],
  aligner: ['ontology.find_concept', 'ontology.get_concept', 'memory.get_precedents'],
  'target-designer': ['ontology.get_vendor_binding', 'odata.metadata'],
  hierarchy: ['ontology.get_constraints', 'graph.build'],
  'code-list': ['ontology.get_vendor_binding', 'profile.run'],
  builder: ['astra_data.generate', 'tests.run'],
  validator: ['rules.run'],
  remediator: ['fix.propose'],
  reconciler: ['recon.counts', 'recon.totals', 'recon.sample'],
  assistant: ['evidence.read', 'note.draft'],
  steward: ['memory.write_tenant', 'ontology.propose'],
};

interface EvalRun {
  id: string; release: string; dataset: string; model: string; passed: boolean; startedBy: string; at: string;
  gate: { regressions: { metric: string; baseline: number; now: number }[]; against: string };
  result: { metrics: Record<string, number>; calibration: { conf: number; rate: number; n: number }[]; thresholdSuggestion: { auto: number; human: number; precisionAtAuto: number }; counts: Record<string, number>; ms: number };
}
interface Evals { release: string; datasets: { id: string; name: string; source: string; pack: string }[]; runs: EvalRun[]; limits: { auto: [number, number]; human: [number, number] } }

const METRICS: { id: string; label: string; lower?: boolean }[] = [
  { id: 'binding_precision', label: 'Binding precision (without memory)' },
  { id: 'binding_recall', label: 'Binding recall (without memory)' },
  { id: 'code_list_accuracy', label: 'Code list accuracy (automatic)' },
  { id: 'code_list_coverage', label: 'Code list coverage' },
  { id: 'hierarchy_accuracy', label: 'Hierarchy accuracy' },
  { id: 'rule_detection', label: 'Rule detection' },
  { id: 'failure_mode_accuracy', label: 'Failure mode accuracy (auto-accepted)' },
  { id: 'failure_mode_coverage', label: 'Failure mode coverage' },
  { id: 'calibration_error', label: 'Calibration error', lower: true },
  { id: 'classification_accuracy', label: 'Classification accuracy' },
  { id: 'duplicate_precision', label: 'Duplicate precision' },
  { id: 'duplicate_recall', label: 'Duplicate recall' },
];

export default function Agents() {
  const { meta, activeAgents } = useApp();
  const [sel, setSel] = useState<string>('aligner');
  if (!meta) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  const current = meta.agents.find((a) => a.id === sel) ?? meta.agents[0];

  return (
    <>
      <PageHeader
        eyebrow={<><Bot className="size-3.5" /> {meta.agents.length} agents</>}
        title="Agents & evaluation"
        description="Agent roles, tools and policies, with evaluation results per release."
        badges={<><Badge tone="agent">Model: {meta.model}</Badge><Badge tone="neutral">Ontology {meta.ontologyVersion}</Badge><Badge tone="neutral">Training on customer data: off</Badge></>}
      />

      <div className="mb-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-2 sm:grid-cols-2">
          {meta.agents.map((a) => (
            <button key={a.id} onClick={() => setSel(a.id)}
              className={cx('flex items-start gap-3 rounded-xl border bg-surface p-3 text-left shadow-card transition', sel === a.id ? 'border-agent/50 ring-4 ring-agent/10' : 'border-line hover:border-line-strong')}>
              <AgentAvatar id={a.id} active={activeAgents.has(a.id)} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{a.name}</div>
                <div className="line-clamp-2 text-[11.5px] leading-snug text-ink-3">{a.job}</div>
              </div>
            </button>
          ))}
        </div>
        <motion.div key={current.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="lg:sticky lg:top-0 lg:self-start">
          <Card>
            <div className="flex items-center gap-3">
              <AgentAvatar id={current.id} size="lg" active={activeAgents.has(current.id)} />
              <div>
                <div className="text-[15px] font-semibold">{current.name}</div>
                <div className="text-xs text-ink-3">{activeAgents.has(current.id) ? 'Working now' : 'Idle'}</div>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{current.job}</p>
            <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3"><ShieldCheck className="size-3.5 text-ok" />Policy</div>
              <div className="mt-1 text-[13px] font-medium">{current.guardrail}</div>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3"><Wrench className="size-3.5" />Tools</div>
              <div className="flex flex-wrap gap-1.5">{(tools[current.id] ?? []).map((t) => <Mono key={t} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-info">{t}</Mono>)}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              <Badge tone="neutral">Calls logged</Badge><Badge tone="neutral">Source text treated as data</Badge><Badge tone="neutral">Ontology {meta.ontologyVersion}</Badge>
            </div>
          </Card>
        </motion.div>
      </div>

      <EvalSection />
    </>
  );
}

function EvalSection() {
  const { persona, act, meta } = useApp();
  const { data } = useApi<Evals>('/evals');
  if (!data) return <Skeleton className="h-64" />;
  const runs = [...data.runs].reverse().slice(-6);
  const latest = data.runs[0];
  const canRun = persona && ['Ontology curator', 'Migration lead'].includes(persona.role);
  const run = (model: 'local' | 'configured') => persona && act(() => api.post('/evals/run', { model, actor: persona.id }), 'Evaluation started; results appear here when it finishes');
  const fmt = (m: { lower?: boolean }, v?: number) => (v === undefined ? '—' : m.lower ? v.toFixed(3) : `${(v * 100).toFixed(1)}%`);
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><FlaskConical className="size-4 text-agent" />Release gate</h2>
        <div className="flex gap-2">
          <Button size="sm" icon={Play} disabled={!canRun} onClick={() => run('local')} title={canRun ? 'Runs in seconds, no model calls' : 'The ontology curator or a migration lead runs evaluations'}>Run with in-environment model</Button>
          <Button size="sm" variant="agent" icon={Play} disabled={!canRun || !meta?.liveModel} onClick={() => run('configured')}>Run with configured models</Button>
        </div>
      </div>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-2">Release {data.release}. A release ships only if <b className="text-ink">no metric drops below the previous run</b> on any golden dataset. CI runs the gate with the in-environment model on every change.</p>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {data.datasets.map((d) => (
          <Card key={d.id}>
            <div className="flex items-center gap-2"><Database className="size-4 text-ink-3" /><span className="text-[13px] font-semibold">{d.id} · {d.name}</span></div>
            <div className="mt-1.5 text-xs text-ink-3">{d.source} · {d.pack} pack</div>
            {latest && <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="neutral">{latest.result.counts.seededErrors} seeded errors</Badge><Badge tone="neutral">{latest.result.counts.failureModeRecords.toLocaleString('en-GB')} labelled work orders</Badge><Badge tone="agent">{latest.result.counts.untyped} untyped assets</Badge></div>}
          </Card>
        ))}
      </div>

      {runs.length === 0 ? <Card><p className="text-sm text-ink-3">No evaluation runs yet.</p></Card> : (
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Card pad={false} className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 text-[11px] font-medium text-ink-3">Metric · GD-01</th>
                  {runs.map((r) => (
                    <th key={r.id} className="px-3 py-3 text-right">
                      <div className="text-[12px] font-semibold">{r.release}</div>
                      <div className="text-[10.5px] font-normal text-ink-3">{r.model} · {timeAgo(r.at)}</div>
                      <div className={cx('mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium', r.passed ? 'text-ok' : 'text-crit')}>
                        {r.passed ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}{r.passed ? 'Gate passed' : 'Blocked'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{m.label}{m.lower && <span className="ml-1 text-[10.5px] text-ink-4">(lower is better)</span>}</td>
                    {runs.map((r) => {
                      const bad = r.gate.regressions.some((x) => x.metric === m.id);
                      return <td key={r.id} className={cx('px-3 py-2 text-right font-mono tabular', bad ? 'font-semibold text-crit' : 'text-ink-2')}>{fmt(m, r.result.metrics[m.id])}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
              {latest.passed ? `Latest run passed the gate (compared with the ${latest.gate.against}).` : `Latest run is blocked: ${latest.gate.regressions.map((x) => `${x.metric} ${x.now} < ${x.baseline}`).join(', ')}.`}
            </div>
          </Card>
          <Card>
            <CardHeader title="Calibration" subtitle={`Failure-mode confidence vs. correct answers · ${latest.model}`} />
            <CalibrationChart points={latest.result.calibration} />
            <p className="mt-2 text-xs text-ink-3">
              Calibration error {latest.result.metrics.calibration_error.toFixed(3)}. Suggested auto-accept threshold {latest.result.thresholdSuggestion.auto} (accepted answers {Math.round(latest.result.thresholdSuggestion.precisionAtAuto * 100)}% correct).
              Curator limits for the utilities pack: auto {data.limits.auto.join('–')}, person {data.limits.human.join('–')}.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
