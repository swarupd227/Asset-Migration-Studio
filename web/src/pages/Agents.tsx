import { useState } from 'react';
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

// Evaluation results per release on golden dataset GD-01.
const metrics = [
  { id: 'Binding precision', higher: true, r: [0.912, 0.934, 0.941] },
  { id: 'Binding recall', higher: true, r: [0.874, 0.902, 0.909] },
  { id: 'Code list accuracy', higher: true, r: [0.951, 0.963, 0.968] },
  { id: 'Hierarchy accuracy', higher: true, r: [0.968, 0.977, 0.975] },
  { id: 'Rule detection', higher: true, r: [0.89, 0.93, 0.94] },
  { id: 'Calibration error', higher: false, r: [0.061, 0.043, 0.038] },
  { id: 'Reviewer acceptance', higher: true, r: [0.81, 0.85, 0.87] },
  { id: 'Hidden rule recall', higher: true, r: [0.78, 0.86, 0.88] },
];
const releases = [
  { id: '1.0.0', note: 'IAO 2.3.0', date: 'Aug 2026' },
  { id: '1.1.0', note: 'Precedent weighting · IAO 2.3.2', date: 'Sep 2026' },
  { id: '1.2.0-rc', note: 'Release candidate · IAO 2.4.0', date: 'Oct 2026' },
];
const datasets = [
  { name: 'GD-01 · Water utility', src: 'Maximo 7.6', size: '2,000 assets · 15k WOs', known: '41 known errors · 3 hidden rules' },
  { name: 'GD-02 · Electric distribution', src: 'Maximo MAS Manage', size: '3,400 assets · 22k WOs', known: '57 known errors · 5 hidden rules' },
  { name: 'GD-03 · Multi-utility', src: 'Maximo 7.6, heavily customised', size: '1,200 assets · 9k WOs', known: '33 known errors · 9 hidden rules' },
];
const calibration = [
  { conf: 0.55, rate: 0.49, n: 38 }, { conf: 0.65, rate: 0.61, n: 54 }, { conf: 0.75, rate: 0.73, n: 97 }, { conf: 0.85, rate: 0.87, n: 162 }, { conf: 0.92, rate: 0.9, n: 211 }, { conf: 0.97, rate: 0.98, n: 305 },
];

function gate(i: number) {
  if (i === 0) return { pass: true, why: 'First release' };
  const drop = metrics.find((m) => (m.higher ? m.r[i] < m.r[i - 1] : m.r[i] > m.r[i - 1]));
  return drop ? { pass: false, why: `${drop.id} dropped` } : { pass: true, why: 'No metric dropped' };
}

export default function Agents() {
  const { meta, activeAgents } = useApp();
  const [sel, setSel] = useState<string>('aligner');
  if (!meta) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  const current = meta.agents.find((a) => a.id === sel) ?? meta.agents[0];

  return (
    <>
      <PageHeader
        eyebrow={<><Bot className="size-3.5" /> {meta.agents.length} agents · {datasets.length} golden datasets</>}
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

      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><FlaskConical className="size-4 text-agent" />Release gate</h2>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-2">A release ships only if <b className="text-ink">no metric drops below the previous release</b> on any golden dataset.</p>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {datasets.map((d) => (
          <Card key={d.name}>
            <div className="flex items-center gap-2"><Database className="size-4 text-ink-3" /><span className="text-[13px] font-semibold">{d.name}</span></div>
            <div className="mt-1.5 text-xs text-ink-3">{d.src}</div>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="neutral">{d.size}</Badge><Badge tone="agent">{d.known}</Badge></div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card pad={false} className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 text-[11px] font-medium text-ink-3">Metric · GD-01</th>
                {releases.map((r, i) => {
                  const g = gate(i);
                  return (
                    <th key={r.id} className="px-3 py-3 text-right">
                      <div className="text-[12.5px] font-semibold">{r.id}</div>
                      <div className="text-[10.5px] font-normal text-ink-3">{r.date}</div>
                      <div className={cx('mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium', g.pass ? 'text-ok' : 'text-crit')}>
                        {g.pass ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}{g.pass ? 'Gate passed' : 'Blocked'}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{m.id}{!m.higher && <span className="ml-1 text-[10.5px] text-ink-4">(lower is better)</span>}</td>
                  {m.r.map((v, i) => {
                    const worse = i > 0 && (m.higher ? v < m.r[i - 1] : v > m.r[i - 1]);
                    return <td key={i} className={cx('px-3 py-2 text-right font-mono tabular', worse ? 'font-semibold text-crit' : i === m.r.length - 1 ? 'text-ink' : 'text-ink-3')}>{m.higher ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
            {(() => { const g = gate(2); return g.pass ? 'Release candidate 1.2.0 can ship.' : `Release candidate 1.2.0 is blocked: ${g.why} on GD-01. `; })()}
          </div>
        </Card>
        <Card>
          <CardHeader title="Calibration" subtitle="Confidence vs. reviewer approval rate" right={<Segmented size="sm" value="gd" onChange={() => {}} options={[{ id: 'gd', label: 'Golden + project history' }]} />} />
          <CalibrationChart points={calibration} />
          <p className="mt-2 text-xs text-ink-3">Calibration error {metrics[5].r[2].toFixed(3)} on release 1.2.0-rc · review thresholds 0.75 / 0.95.</p>
        </Card>
      </div>
    </>
  );
}
