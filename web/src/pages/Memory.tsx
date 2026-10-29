import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { BrainCircuit, Building2, Globe2, Lock, ShieldOff, Sparkles, Users } from 'lucide-react';
import type { Precedent } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { pct } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, Mono, PageHeader, Skeleton, Stat } from '@/components/ui';

interface MemoryData {
  sharedLearning: boolean;
  tenantDecisions: number;
  precedents: (Precedent & { mapping: string; concept: string })[];
  fromPrecedent: number;
  total: number;
}

const privacy = [
  { title: 'Kept in tenant memory', icon: Building2, tone: 'accent', items: ['All mappings, decisions, reviewer notes and sample values for this customer', 'Customer code lists and their mappings', 'Business rules set by the customer'] },
  { title: 'Kept in shared memory', icon: Globe2, tone: 'agent', items: ['Source element signatures, such as “Maximo field ASSET.X with this type and pattern”', 'Approved bindings from source signature to ontology concept, with counts', 'Generic code list equivalences, such as vendor status to ontology status', 'Reasons for rejection, rewritten without customer details'] },
  { title: 'Never in shared memory', icon: ShieldOff, tone: 'crit', items: ['Data values and samples', 'Customer, site, person or asset names', 'Free text from source records', 'Customer business rules'] },
] as const;

const rules = [
  'Shared learning is switched on only when the customer contract allows it. The default is off.',
  'An anonymisation step removes names and values, and a person checks a sample of each batch before it enters the shared memory.',
  'A customer can ask for its contributions to be removed. Each pattern records which projects contributed to it.',
  'Customer data is never used to train or fine-tune a model.',
];

const outcomeTone = { approved: 'ok', rejected: 'crit', changed: 'warn' } as const;

export default function Memory() {
  const { data } = useApi<MemoryData>('/memory');
  const { ask } = useApp();
  const projects = useMemo(() => new Set(data?.precedents.map((p) => p.project)).size, [data]);
  return (
    <>
      <PageHeader
        eyebrow={<><BrainCircuit className="size-3.5" />Knowledge · D2</>}
        title="Mapping memory"
        description="Every approved mapping, rejected mapping and reviewer note is kept as a precedent. Each project makes the next one more accurate, and agents show which precedents they used for every proposal."
        badges={data && <Badge tone={data.sharedLearning ? 'ok' : 'neutral'} icon={Lock}>Shared learning {data.sharedLearning ? 'on' : 'off for this contract'}</Badge>}
        actions={<Button icon={Sparkles} onClick={() => ask('How does the mapping memory change confidence for a proposal?')}>Ask agent</Button>}
      />
      {!data ? <Skeleton className="h-96" /> : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Proposals from precedents" icon={BrainCircuit} tone="agent" value={pct(data.fromPrecedent / data.total, 0)} sub={`${data.fromPrecedent} of ${data.total} proposals (ML-04)`} />
            <Stat label="Precedents used" icon={Sparkles} value={data.precedents.length} sub="cited in this project's proposals" />
            <Stat label="Contributing projects" icon={Users} value={projects} sub="anonymised" />
            <Stat label="Tenant decisions stored" icon={Building2} tone="accent" value={data.tenantDecisions} sub="this customer only (ML-01)" />
          </div>

          <Card className="mb-5" pad={false}>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[13.5px] font-semibold">Privacy model</h2>
              <p className="text-xs text-ink-3">Two levels: a private memory for each customer, and a shared memory that holds only anonymised patterns.</p>
            </div>
            <div className="grid gap-px bg-line md:grid-cols-3">
              {privacy.map((col, i) => (
                <motion.div key={col.title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-surface p-4">
                  <div className={cx('mb-3 flex items-center gap-2 text-[13px] font-semibold', col.tone === 'crit' ? 'text-crit' : col.tone === 'agent' ? 'text-agent' : 'text-accent')}>
                    <col.icon className="size-4" />{col.title}
                  </div>
                  <ul className="space-y-2">{col.items.map((it) => <li key={it} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2"><span className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', col.tone === 'crit' ? 'bg-crit' : col.tone === 'agent' ? 'bg-agent' : 'bg-accent')} />{it}</li>)}</ul>
                </motion.div>
              ))}
            </div>
            <ul className="grid gap-2 border-t border-line px-4 py-3 md:grid-cols-2">
              {rules.map((r) => <li key={r} className="flex gap-2 text-xs leading-relaxed text-ink-3"><Lock className="mt-0.5 size-3.5 shrink-0 text-ok" />{r}</li>)}
            </ul>
          </Card>

          <Card pad={false}>
            <div className="px-4 pt-4"><CardHeader title="Precedents cited by this project" subtitle="Simulated history from earlier projects, anonymised" /></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="text-[11px] uppercase tracking-wider text-ink-4">
                  <tr>{['Signature', 'Concept', 'Project', 'Outcome', 'Count', 'Note', 'Used in'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.precedents.map((p, i) => (
                    <tr key={`${p.mapping}-${p.id}-${i}`} className="border-t border-line">
                      <td className="px-4 py-2"><Mono className="text-ink">{p.signature}</Mono></td>
                      <td className="px-4 py-2 text-ink-2">{p.concept}</td>
                      <td className="px-4 py-2 text-ink-2">{p.project}</td>
                      <td className="px-4 py-2"><Badge tone={outcomeTone[p.outcome]} dot>{p.outcome}</Badge></td>
                      <td className="px-4 py-2 tabular text-ink-2">{p.count}</td>
                      <td className="max-w-[260px] truncate px-4 py-2 text-ink-3" title={p.note}>{p.note || '—'}</td>
                      <td className="px-4 py-2"><Link to={`/review?item=${p.mapping}`} className="font-mono text-[12px] font-medium text-accent hover:underline">{p.mapping}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
