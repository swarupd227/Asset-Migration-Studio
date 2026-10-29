import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowRight, Check, CircleX, Play, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { LoadRun, Rule, ValidationFailure } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { day } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, Empty, Mono, PageHeader, SectionLabel, Segmented, Skeleton } from '@/components/ui';
import { ColumnChart } from '@/components/c/charts';

interface ValidationData { rules: Rule[]; failures: ValidationFailure[]; runs: Omit<LoadRun, 'reconciliation' | 'errors'>[] }

const LEVELS: Rule['level'][] = ['Structural', 'Reference', 'Semantic', 'Business', 'Data quality'];
const levelTone: Record<Rule['level'], 'neutral' | 'info' | 'agent' | 'warn' | 'accent'> = { Structural: 'neutral', Reference: 'info', Semantic: 'agent', Business: 'warn', 'Data quality': 'accent' };

// Where to resolve a finding that has no fix proposal.
const ruleLink: Record<string, { to: string; label: string }> = {
  'SM-04': { to: '/review?item=M-050', label: 'Review M-050' },
  'ST-02': { to: '/review?item=M-046', label: 'Review M-046' },
  'RF-01': { to: '/hierarchy', label: 'Open hierarchy' },
  'SM-02': { to: '/review?item=M-071', label: 'Review M-071' },
};

function countOf(f: ValidationFailure) {
  const m = f.record.match(/^(\d+)\s/);
  return m ? Number(m[1]) : 1;
}

function PumpUnderValve({ failure, onFix }: { failure?: ValidationFailure; onFix: () => void }) {
  return (
    <Card className="overflow-hidden" pad={false}>
      <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
        <div className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="agent">SM-01 · Semantic</Badge>
            <span className="text-[11px] text-ink-3">Source: ontology allowed-parent rules</span>
          </div>
          <h3 className="text-[15px] font-semibold">Pump placed under a valve</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
            {failure ? failure.reason : 'No violations. All pumps sit under an allowed parent.'}
          </p>
          {failure && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="ok" icon={Check} onClick={onFix} disabled={!failure.fixId}>Approve fix</Button>
              <Link to="/hierarchy"><Button size="sm" icon={ArrowRight}>See it in the hierarchy</Button></Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:border-l md:border-t-0">
          {[
            { ok: false, title: 'In Maximo', parent: 'Valve', parentSub: 'VALVE\\GATE', child: 'Centrifugal pump', childSub: failure?.record ?? 'PU-…' },
            { ok: true, title: 'Proposed in IFS', parent: 'Functional location', parentSub: 'Pumping station position', child: 'Centrifugal pump', childSub: 'Serial object' },
          ].map((s) => (
            <div key={s.title} className="flex flex-col items-center gap-1.5 bg-surface-2 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{s.title}</div>
              <div className="w-full max-w-[150px] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center">
                <div className="text-[12px] font-medium">{s.parent}</div>
                <div className="font-mono text-[10px] text-ink-3">{s.parentSub}</div>
              </div>
              <div className={cx('h-5 w-px', s.ok ? 'bg-ok' : 'bg-crit')} />
              <div className={cx('w-full max-w-[150px] rounded-lg border px-2.5 py-1.5 text-center', s.ok ? 'border-ok/40 bg-ok-soft' : 'border-crit/40 bg-crit-soft')}>
                <div className="text-[12px] font-medium">{s.child}</div>
                <div className="font-mono text-[10px] text-ink-3">{s.childSub}</div>
              </div>
              <div className={cx('mt-1 flex items-center gap-1 text-[11px] font-medium', s.ok ? 'text-ok' : 'text-crit')}>
                {s.ok ? <ShieldCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
                {s.ok ? 'Allowed parent' : 'Not allowed'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function Validation() {
  const { data, loading } = useApi<ValidationData>('/validation');
  const { persona, act, runStage, ask, dashboard } = useApp();
  const [level, setLevel] = useState<'all' | Rule['level']>('all');
  const [rule, setRule] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');

  const byRule = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of data?.failures ?? []) m.set(f.rule, (m.get(f.rule) ?? 0) + countOf(f));
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const levelOf = new Map(data.rules.map((r) => [r.id, r.level]));
    return data.failures.filter((f) => (level === 'all' || levelOf.get(f.rule) === level) && (!rule || f.rule === rule) && (severity === 'all' || f.severity === severity));
  }, [data, level, rule, severity]);

  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-48" /><Skeleton className="h-96" /></div>;

  const busy = !!dashboard?.running;
  const errors = data.failures.filter((f) => f.severity === 'error').length;
  const sm01 = data.failures.find((f) => f.rule === 'SM-01');
  const approveFix = (id: string) => act(() => api.post(`/fixes/${id}`, { decision: 'approve', actor: persona?.id }), 'Fix approved. It runs in the next transformation.');
  const lastRun = data.runs.at(-1);
  const trend = data.runs.map((r) => ({ label: `Run ${r.number}`, value: r.validation.reduce((s, v) => s + v.failures, 0), sub: day(r.startedAt) }));
  const nextRun = (lastRun?.number ?? 0) + 1;

  return (
    <>
      <PageHeader
        eyebrow={<><ShieldAlert className="size-3.5" /> Stage 10 · {data.failures.length} findings</>}
        title="Validation"
        description="Rule results for the latest run, with proposed fixes."
        badges={<>
          <Badge tone={errors ? 'crit' : 'ok'} icon={errors ? CircleX : ShieldCheck}>{errors} errors</Badge>
          <Badge tone="warn" icon={AlertTriangle}>{data.failures.length - errors} warnings</Badge>
          <Badge tone="neutral">{data.rules.length} rules · 4 levels</Badge>
          {lastRun && <Badge tone="neutral">Last run: Run {lastRun.number} · {lastRun.transformationVersion}</Badge>}
        </>}
        actions={<>
          <Button icon={Sparkles} onClick={() => ask('What is blocking a clean validation run?')}>Summarise blockers</Button>
          <Button variant="agent" icon={Play} disabled={busy} onClick={() => runStage(10)}>{busy ? 'Running…' : `Re-run validation · Run ${nextRun}`}</Button>
        </>}
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <PumpUnderValve failure={sm01} onFix={() => sm01?.fixId && approveFix(sm01.fixId)} />
        <Card>
          <CardHeader title="Findings per run" />
          <ColumnChart data={trend} format={(v) => `${v} findings`} />
          <p className="mt-3 text-xs text-ink-3">Open after approved fixes: <b className="text-ink-2 tabular">{[...byRule.values()].reduce((a, b) => a + b, 0)}</b> · applied in Run {nextRun}</p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        {/* Rule catalogue */}
        <Card pad={false} className="h-fit">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[13.5px] font-semibold">Rule catalogue</h2>
            <p className="text-xs text-ink-3">Click a rule to filter the findings</p>
          </div>
          <div className="p-2">
            {LEVELS.map((lv) => {
              const rs = data.rules.filter((r) => r.level === lv);
              return (
                <div key={lv} className="mb-2">
                  <div className="flex items-center justify-between px-2 pb-1 pt-2">
                    <Badge tone={levelTone[lv]}>{lv}</Badge>
                    <span className="text-[11px] text-ink-4">{rs[0]?.source}</span>
                  </div>
                  {rs.map((r) => {
                    const n = byRule.get(r.id) ?? 0;
                    return (
                      <button key={r.id} onClick={() => setRule(rule === r.id ? null : r.id)}
                        className={cx('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition', rule === r.id ? 'bg-accent-soft ring-1 ring-accent-line' : 'hover:bg-sunken')}>
                        <Mono className="mt-px w-11 shrink-0 text-ink-3">{r.id}</Mono>
                        <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">{r.text}</span>
                        {n ? <span className="shrink-0 rounded bg-crit-soft px-1.5 text-[11px] font-semibold tabular text-crit">{n}</span> : <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-label="passing" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Findings */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={level} onChange={(v) => { setLevel(v); setRule(null); }}
              options={[{ id: 'all', label: 'All levels' }, ...LEVELS.map((l) => ({ id: l, label: l }))]} />
            <Segmented size="sm" value={severity} onChange={setSeverity}
              options={[{ id: 'all', label: 'All' }, { id: 'error', label: 'Errors' }, { id: 'warning', label: 'Warnings' }]} />
            {rule && <button onClick={() => setRule(null)} className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{rule} <X className="size-3" /></button>}
            <span className="ml-auto text-xs text-ink-3 tabular">{filtered.length} findings</span>
          </div>
          {!filtered.length ? (
            <Empty icon={ShieldCheck} title="No findings for this filter">Every record in scope passes these rules.</Empty>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {filtered.map((f) => {
                  const link = ruleLink[f.rule];
                  return (
                    <motion.div key={f.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <Card className="flex gap-3">
                        <div className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', f.severity === 'error' ? 'bg-crit-soft text-crit' : 'bg-warn-soft text-warn')}>
                          {f.severity === 'error' ? <CircleX className="size-4" /> : <AlertTriangle className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={levelTone[data.rules.find((r) => r.id === f.rule)?.level ?? 'Structural']}>{f.rule}</Badge>
                            <Mono className="text-ink">{f.record}</Mono>
                            <span className="text-[11px] text-ink-3">· {f.object} · {f.site}</span>
                            <Badge tone={f.severity === 'error' ? 'crit' : 'warn'} className="ml-auto">{f.severity === 'error' ? 'Error' : 'Warning'}</Badge>
                          </div>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{f.reason}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                            <Sparkles className="size-3.5 shrink-0 text-agent" />
                            <span className="min-w-0 flex-1 text-[12.5px] text-ink-2"><span className="font-medium text-ink">Proposed fix:</span> {f.proposedFix}</span>
                            {f.fixId ? (
                              <Button size="sm" variant="ok" icon={Check} onClick={() => approveFix(f.fixId!)}>Approve fix</Button>
                            ) : link ? (
                              <Link to={link.to}><Button size="sm" icon={ArrowRight}>{link.label}</Button></Link>
                            ) : (
                              <Button size="sm" icon={Sparkles} onClick={() => ask(`How should we resolve ${f.rule} on ${f.record}?`)}>Ask</Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          <SectionLabel>{' '}</SectionLabel>
          <p className="text-xs text-ink-3">Mapping failures return to stage 5, code failures to stage 8, data issues to <Link to="/quality" className="text-accent hover:underline">Data quality</Link>.</p>
        </div>
      </div>
    </>
  );
}
