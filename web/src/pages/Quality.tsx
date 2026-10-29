import { useEffect, useMemo, useState } from 'react';
import { animate, AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Archive, Check, CheckCheck, Copy, GitMerge, Gauge, Shapes, Sparkles, Tag, Undo2, Workflow, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DqSnapshot, FixProposal } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Confidence, cx, Empty, Mono, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { BeforeAfterRow } from '@/components/c/charts';

interface QualityData { dq: DqSnapshot; fixes: FixProposal[] }

const kinds: { id: FixProposal['kind']; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'merge_duplicate', label: 'Duplicate merges', icon: GitMerge, blurb: 'Same serial, manufacturer and model at one site (DQ-01)' },
  { id: 'reparent', label: 'Re-parents', icon: Workflow, blurb: 'Hierarchy repairs from ontology allowed-parent rules (SM-01)' },
  { id: 'classify', label: 'Classifications', icon: Shapes, blurb: 'Untyped assets get an ontology class (DQ-02)' },
  { id: 'meter_correction', label: 'Meter corrections', icon: Gauge, blurb: 'Cumulative meters must not decrease (SM-03)' },
  { id: 'archive', label: 'Archive', icon: Archive, blurb: 'Business rule set by the customer (BR-02)' },
  { id: 'code_map', label: 'Standards & ranges', icon: Tag, blurb: 'Naming standard and plausible attribute ranges' },
];

function AnimatedPct({ value, className }: { value: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(v, value * 100, { duration: 0.9, ease: 'easeOut', onUpdate: setV });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={cx('tabular', className)}>{v.toFixed(1)}%</span>;
}

function StatusChip({ s }: { s: FixProposal['status'] }) {
  if (s === 'approved') return <Badge tone="ok" icon={Check}>Approved · runs next load</Badge>;
  if (s === 'rejected') return <Badge tone="neutral" icon={X}>Rejected</Badge>;
  return <Badge tone="agent" dot>Proposed</Badge>;
}

function Actions({ f, decide }: { f: FixProposal; decide: (id: string, d: 'approve' | 'reject') => void }) {
  if (f.status !== 'proposed') return <Button size="sm" variant="ghost" icon={Undo2} onClick={() => decide(f.id, f.status === 'approved' ? 'reject' : 'approve')}>{f.status === 'approved' ? 'Reject instead' : 'Approve instead'}</Button>;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="ghost" icon={X} onClick={() => decide(f.id, 'reject')}>Reject</Button>
      <Button size="sm" variant="ok" icon={Check} onClick={() => decide(f.id, 'approve')}>Approve</Button>
    </div>
  );
}

function MergeCard({ f, decide }: { f: FixProposal; decide: (id: string, d: 'approve' | 'reject') => void }) {
  const [keep, dup] = f.records;
  const rows = f.diff ?? [];
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card pad={false} className={cx('overflow-hidden', f.status === 'approved' && 'border-ok/40', f.status === 'rejected' && 'opacity-60')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <GitMerge className="size-4 text-agent" />
          <span className="text-[13px] font-semibold">{f.title}</span>
          <span className="min-w-0 truncate text-xs text-ink-3">{f.detail}</span>
          <div className="ml-auto flex items-center gap-2"><Confidence value={f.confidence} /><StatusChip s={f.status} /></div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0">
          <div className="p-3">
            <div className="mb-1 flex items-center gap-1.5"><Badge tone="ok">Keep</Badge><Mono className="font-semibold">{keep}</Mono></div>
            {rows.map((r) => <div key={r.field} className="flex justify-between gap-2 py-0.5 text-[12px]"><span className="text-ink-3">{r.field}</span><span className="truncate font-mono text-ink">{r.to}</span></div>)}
          </div>
          <div className="grid place-items-center border-x border-line bg-surface-2 px-2"><ArrowRight className="size-4 rotate-180 text-ink-4" /></div>
          <div className="p-3">
            <div className="mb-1 flex items-center gap-1.5"><Badge tone="warn">Duplicate</Badge><Mono className="font-semibold line-through decoration-ink-4">{dup}</Mono></div>
            {rows.map((r) => <div key={r.field} className="flex justify-between gap-2 py-0.5 text-[12px]"><span className="text-ink-3">{r.field}</span><span className={cx('truncate font-mono', r.from === r.to ? 'text-ink-2' : 'text-warn')}>{r.from}</span></div>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-2 px-4 py-2">
          {f.evidence.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}
          <div className="ml-auto"><Actions f={f} decide={decide} /></div>
        </div>
      </Card>
    </motion.div>
  );
}

function FixCard({ f, decide }: { f: FixProposal; decide: (id: string, d: 'approve' | 'reject') => void }) {
  const k = kinds.find((x) => x.id === f.kind)!;
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cx(f.status === 'approved' && 'border-ok/40', f.status === 'rejected' && 'opacity-60')}>
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-agent-soft text-agent"><k.icon className="size-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold">{f.title}</span>
              <Badge tone="neutral">{f.rule}</Badge>
              <div className="ml-auto flex items-center gap-2"><Confidence value={f.confidence} /><StatusChip s={f.status} /></div>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-2">{f.detail}</p>
            {!!f.diff?.length && (
              <div className="mt-2 overflow-hidden rounded-lg border border-line">
                {f.diff.map((d, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_auto_1fr] items-center gap-2 border-b border-line px-2.5 py-1.5 text-[12px] last:border-0">
                    <span className="truncate text-ink-3">{d.field}</span>
                    <span className="truncate font-mono text-crit line-through decoration-crit/40">{d.from}</span>
                    <ArrowRight className="size-3 text-ink-4" />
                    <span className="truncate font-mono text-ok">{d.to}</span>
                  </div>
                ))}
              </div>
            )}
            {f.records.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {f.records.slice(0, 10).map((r) => <Mono key={r} className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-ink-2">{r}</Mono>)}
                {f.records.length > 10 && <span className="text-[11px] text-ink-3">+{f.records.length - 10} more</span>}
              </div>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {f.evidence.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}
              <div className="ml-auto"><Actions f={f} decide={decide} /></div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Quality() {
  const { data, loading } = useApi<QualityData>('/quality');
  const { persona, act, ask } = useApp();
  const [kind, setKind] = useState<FixProposal['kind'] | 'all'>('all');
  const [show, setShow] = useState<'open' | 'all'>('open');

  const groups = useMemo(() => kinds.map((k) => ({ ...k, fixes: (data?.fixes ?? []).filter((f) => f.kind === k.id) })), [data]);
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;

  const { dq, fixes } = data;
  const open = fixes.filter((f) => f.status === 'proposed');
  const highMerges = open.filter((f) => f.kind === 'merge_duplicate' && f.confidence >= 0.9);
  const decide = (id: string, d: 'approve' | 'reject') => act(() => api.post(`/fixes/${id}`, { decision: d, actor: persona?.id }), d === 'approve' ? 'Fix approved. It runs in the next transformation.' : 'Fix rejected and recorded.');
  const bulk = (ids: string[]) => act(() => api.post('/fixes/bulk', { ids, actor: persona?.id }), `${ids.length} fixes approved`);
  const gain = dq.overallAfter - dq.overallBefore;
  const visible = groups.filter((g) => kind === 'all' || g.id === kind);

  return (
    <>
      <PageHeader
        eyebrow={<><CheckCheck className="size-3.5" /> {open.length} fixes awaiting approval</>}
        title="Data quality"
        description="Share of records passing every rule, before and after approved fixes."
        actions={<>
          <Button icon={Sparkles} onClick={() => ask('What is blocking a higher quality score?')}>Summarise blockers</Button>
          {highMerges.length > 0 && <Button variant="ok" icon={CheckCheck} onClick={() => bulk(highMerges.map((f) => f.id))}>Approve {highMerges.length} high-confidence merges</Button>}
        </>}
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <Card className="relative overflow-hidden">
          <div className="text-xs font-medium text-ink-3">Data quality score</div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <div className="text-[11px] text-ink-3">Before migration</div>
              <AnimatedPct value={dq.overallBefore} className="text-[30px] font-semibold tracking-tight text-ink-3" />
            </div>
            <ArrowRight className="mb-3 size-5 text-ink-4" />
            <div>
              <div className="text-[11px] text-ink-3">After approved fixes</div>
              <AnimatedPct value={dq.overallAfter} className="text-[44px] font-semibold leading-none tracking-tight text-ok" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="ok">+{(gain * 100).toFixed(1)} points</Badge>
            <Badge tone="agent">{open.length} fixes waiting</Badge>
            <Badge tone="neutral">{fixes.filter((f) => f.status === 'approved').length} approved</Badge>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">By site</div>
            {dq.bySite.map((s) => <BeforeAfterRow key={s.site} label={s.site} before={s.before} after={s.after} min={0.8} />)}
          </div>
        </Card>
        <Card>
          <CardHeader title="By object" subtitle="Grey dot = before, green = after approved fixes · axis from 80%" icon={Gauge} />
          {dq.byObject.map((o) => <BeforeAfterRow key={o.object} label={o.object} sub={`${o.records.toLocaleString('en-GB')} records`} before={o.before} after={o.after} min={0.8} />)}
          <p className="mt-2 text-xs text-ink-3">Approved fixes are applied in the next transformation run.</p>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={kind} onChange={setKind}
          options={[{ id: 'all', label: 'All fixes', count: open.length }, ...groups.map((g) => ({ id: g.id, label: g.label, count: g.fixes.filter((f) => f.status === 'proposed').length }))]} />
        <div className="ml-auto"><Segmented size="sm" value={show} onChange={setShow} options={[{ id: 'open', label: 'Waiting' }, { id: 'all', label: 'Include decided' }]} /></div>
      </div>

      <div className="space-y-6">
        {visible.map((g) => {
          const list = g.fixes.filter((f) => show === 'all' || f.status === 'proposed');
          if (!list.length) return null;
          const openInGroup = list.filter((f) => f.status === 'proposed');
          return (
            <section key={g.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <g.icon className="size-4 text-agent" />
                <h2 className="text-[13.5px] font-semibold">{g.label}</h2>
                <span className="text-xs text-ink-3">{g.blurb}</span>
                {openInGroup.length > 1 && g.id !== 'merge_duplicate' && (
                  <Button size="sm" className="ml-auto" icon={Copy} onClick={() => bulk(openInGroup.map((f) => f.id))}>Approve all {openInGroup.length}</Button>
                )}
              </div>
              <div className={cx('grid gap-3', g.id === 'merge_duplicate' ? 'xl:grid-cols-2' : '')}>
                <AnimatePresence initial={false}>
                  {list.map((f) => g.id === 'merge_duplicate' ? <MergeCard key={f.id} f={f} decide={decide} /> : <FixCard key={f.id} f={f} decide={decide} />)}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
        {!visible.some((g) => g.fixes.some((f) => show === 'all' || f.status === 'proposed')) && (
          <Empty icon={CheckCheck} title="No fixes waiting">Every fix proposal for this filter has a decision.</Empty>
        )}
      </div>
    </>
  );
}
