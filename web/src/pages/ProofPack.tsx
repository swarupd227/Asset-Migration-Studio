import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Download, FileCheck2, FileDown, Fingerprint, Link2, Lock, PenLine, Play, ShieldCheck, UserRound } from 'lucide-react';
import type { AuditEntry, DqSnapshot, LoadRun, Project, ReconciliationCheck } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { day, num, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, Mono, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { ColumnChart, downloadFile, StatusDot } from '@/components/c/charts';

interface ProofData {
  project: Project;
  run: LoadRun;
  runs: { id: string; number: number; dqScore: number; startedAt: string; transformationVersion: string; failing: number; loaded: number; failed: number }[];
  approvals: AuditEntry[];
  lineage: { source: string; concept: string; mapping: string; transformation: string; target: string; rule: string; run: string }[];
  signoffs: { role: string; name: string; at: string; runId: string }[];
  auditIntegrity: { ok: boolean; entries: number; head?: string; brokenAt?: number };
  validationOpen: number;
  dq: DqSnapshot;
}

const kindLabel: Record<ReconciliationCheck['kind'], string> = { count: 'Counts', total: 'Totals', hierarchy: 'Hierarchy', sample: 'Sampled records' };
const outcomeTone = { pass: 'ok', fail: 'crit', explained: 'warn' } as const;
const SIGNERS = ['Customer data owner', 'IFS solution consultant'] as const;

export default function ProofPack() {
  const { data } = useApi<ProofData>('/proofpack');
  const { persona, act, runStage, dashboard, meta } = useApp();
  const [trend, setTrend] = useState<'dq' | 'failing' | 'failed'>('dq');
  const [kind, setKind] = useState<'all' | ReconciliationCheck['kind']>('all');
  if (!data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;

  const run = data.run;
  const checks = run.reconciliation ?? [];
  const failing = checks.filter((c) => c.outcome === 'fail');
  const runSigs = data.signoffs.filter((s) => s.runId === run.id);
  const busy = !!dashboard?.running;
  const canSignRole = persona && SIGNERS.includes(persona.role as (typeof SIGNERS)[number]);
  const sign = () => act(() => api.post('/signoff', { actor: persona?.id }), `Proof pack for ${run.id} signed`);
  const totals = run.objects.reduce((s, o) => ({ source: s.source + o.source, loaded: s.loaded + o.loaded, failed: s.failed + o.failed }), { source: 0, loaded: 0, failed: 0 });

  const trendData = data.runs.map((r) => ({
    label: `Run ${r.number}`,
    value: trend === 'dq' ? Math.round(r.dqScore * 1000) / 10 : trend === 'failing' ? r.failing : r.failed,
    sub: day(r.startedAt),
  }));
  const fmt = trend === 'dq' ? (v: number) => `${v}%` : trend === 'failing' ? (v: number) => `${v} checks failing` : (v: number) => `${num(v)} records in error queue`;

  return (
    <>
      <PageHeader
        eyebrow={<><FileCheck2 className="size-3.5" /> Stages 11–12 · {runSigs.length === 2 ? 'Signed' : 'Awaiting signature'}</>}
        title={`Proof pack · ${run.id}`}
        description="Lineage, approvals, validation and reconciliation for the latest run."
        badges={<>
          <Badge tone="neutral">{run.transformationVersion}</Badge>
          <Badge tone="agent">{run.ontologyVersion}</Badge>
          <Badge tone={failing.length ? 'crit' : 'ok'} icon={failing.length ? undefined : CheckCircle2}>{failing.length ? `${failing.length} reconciliation checks failing` : 'All reconciliation checks pass'}</Badge>
          <Badge tone={data.auditIntegrity.ok ? 'ok' : 'crit'} icon={Fingerprint}>Audit chain {data.auditIntegrity.ok ? 'intact' : `broken at #${data.auditIntegrity.brokenAt}`}</Badge>
        </>}
        actions={<div className="no-print flex flex-wrap gap-2">
          <Button icon={FileDown} onClick={() => downloadFile(`proof-pack-${run.id}.json`, JSON.stringify(data, null, 2))}>Download as data</Button>
          <Button icon={Download} onClick={() => window.print()}>Export PDF</Button>
          <Button variant="agent" icon={Play} disabled={busy} onClick={() => runStage(8)}>{busy ? 'Running…' : `Start Run ${run.number + 1}`}</Button>
        </div>}
      />

      {/* Sign-off */}
      <Card className="mb-5" pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <PenLine className="size-4 text-accent" />
          <h2 className="text-[13.5px] font-semibold">Sign-off</h2>
          <span className="text-xs text-ink-3">Required: customer data owner and IFS solution consultant</span>
          <div className="ml-auto"><Badge tone={runSigs.length === 2 ? 'ok' : 'warn'} dot>{runSigs.length === 2 ? 'Signed' : `Awaiting signature · ${runSigs.length}/2`}</Badge></div>
        </div>
        <div className="grid gap-px bg-line md:grid-cols-2">
          {SIGNERS.map((role) => {
            const sig = runSigs.find((s) => s.role === role);
            const isMe = persona?.role === role;
            const reason = failing.length ? `Run ${run.number} has ${failing.length} failing reconciliation checks` : !isMe ? `Signature restricted to the ${role.toLowerCase()}` : '';
            const who = meta?.people.find((p) => p.role === role);
            return (
              <div key={role} className="bg-surface p-4">
                <div className="flex items-start gap-3">
                  <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', sig ? 'bg-ok-soft text-ok' : 'bg-sunken text-ink-3')}>{sig ? <CheckCircle2 className="size-5" /> : <UserRound className="size-5" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{role}</div>
                    {sig ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="mt-0.5 font-serif text-[20px] italic text-ink">{sig.name}</div>
                        <div className="text-xs text-ink-3">Signed {new Date(sig.at).toLocaleString('en-GB')} · {sig.runId}</div>
                      </motion.div>
                    ) : (
                      <>
                        <div className="mt-0.5 text-[13px] text-ink-2">{who?.name ?? '—'} · awaiting signature</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="primary" icon={PenLine} disabled={!!reason} onClick={sign}>Sign proof pack</Button>
                          {reason && <span className="flex items-center gap-1 text-[11.5px] text-ink-3"><Lock className="size-3" />{reason}</span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader title="Run comparison" subtitle="Dry runs, versioned code, pinned ontology" />
          <div className="mb-3"><Segmented size="sm" value={trend} onChange={setTrend} options={[{ id: 'dq', label: 'Quality score' }, { id: 'failing', label: 'Failing checks' }, { id: 'failed', label: 'Load errors' }]} /></div>
          <ColumnChart data={trendData} format={fmt} color={trend === 'dq' ? 'var(--ok)' : 'var(--accent)'} />
          <table className="mt-4 w-full text-[12px]">
            <thead><tr className="text-left text-[11px] text-ink-3"><th className="py-1 font-medium">Run</th><th className="font-medium">Code</th><th className="text-right font-medium">Loaded</th><th className="text-right font-medium">Errors</th><th className="text-right font-medium">DQ</th></tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} className={cx('border-t border-line', r.id === run.id && 'font-medium')}>
                  <td className="py-1.5">Run {r.number}<span className="ml-1 text-[11px] font-normal text-ink-4">{timeAgo(r.startedAt)}</span></td>
                  <td className="font-mono text-[11px] text-ink-3">{r.transformationVersion}</td>
                  <td className="text-right tabular">{num(r.loaded)}</td>
                  <td className="text-right tabular">{num(r.failed)}</td>
                  <td className="text-right tabular">{(r.dqScore * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[13.5px] font-semibold">Reconciliation · {run.id}</h2>
            <span className="text-xs text-ink-3 tabular">{num(totals.loaded)} of {num(totals.source)} records loaded</span>
            <div className="ml-auto"><Segmented size="sm" value={kind} onChange={setKind} options={[{ id: 'all', label: 'All' }, ...(['count', 'total', 'hierarchy', 'sample'] as const).map((k) => ({ id: k, label: kindLabel[k] }))]} /></div>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-left text-[11px] text-ink-3"><th className="px-4 py-2 font-medium">Check</th><th className="px-2 font-medium">Object</th><th className="px-2 text-right font-medium">Source</th><th className="px-2 text-right font-medium">IFS</th><th className="px-4 font-medium">Outcome</th></tr></thead>
              <tbody>
                {checks.filter((c) => kind === 'all' || c.kind === kind).map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2"><div className="text-ink">{c.check}</div>{c.note && <div className="text-[11px] text-ink-3">{c.note}</div>}</td>
                    <td className="px-2 text-ink-2">{c.object}</td>
                    <td className="px-2 text-right font-mono tabular">{c.sourceValue}</td>
                    <td className="px-2 text-right font-mono tabular">{c.targetValue}</td>
                    <td className="px-4"><Badge tone={outcomeTone[c.outcome]}><StatusDot outcome={c.outcome} />{c.outcome === 'pass' ? 'Pass' : c.outcome === 'fail' ? 'Fail' : 'Explained'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Lineage */}
      <Card className="mb-5">
        <CardHeader title="Field-level lineage" subtitle="Source field → concept → mapping → transformation → IFS target" icon={Link2} />
        <div className="space-y-2">
          {data.lineage.map((l) => (
            <div key={l.mapping} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2 p-2">
              {[
                { t: 'Source', v: l.source, tone: 'neutral' as const },
                { t: 'Concept', v: l.concept, tone: 'agent' as const },
                { t: 'Mapping', v: l.mapping, tone: 'accent' as const },
                { t: 'Transformation', v: l.transformation, tone: 'info' as const },
                { t: 'IFS Cloud', v: l.target, tone: 'ok' as const },
              ].map((s, i) => (
                <span key={s.t} className="flex items-center gap-1.5">
                  {i > 0 && <ArrowRight className="size-3.5 text-ink-4" />}
                  <span className="rounded-lg border border-line bg-surface px-2 py-1">
                    <span className="block text-[9.5px] font-semibold uppercase tracking-wider text-ink-4">{s.t}</span>
                    <span className={cx('font-mono text-[11.5px]', s.tone === 'agent' ? 'text-agent' : s.tone === 'accent' ? 'text-accent' : s.tone === 'ok' ? 'text-ok' : 'text-ink')}>{s.v}</span>
                  </span>
                </span>
              ))}
              <span className="ml-auto text-[11px] text-ink-3">{l.rule}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card pad={false}>
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[13.5px] font-semibold">Approvals</h2>
            <Badge tone="neutral">{data.approvals.length}</Badge>
            <span className="text-xs text-ink-3">Decisions by named reviewers</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <tbody>
                {[...data.approvals].reverse().map((a) => (
                  <tr key={a.seq} className="border-b border-line last:border-0">
                    <td className="px-4 py-1.5 font-mono text-[11px] text-ink-4">#{a.seq}</td>
                    <td className="py-1.5 font-medium">{a.actor}</td>
                    <td className="px-2"><Badge tone={a.action.includes('reject') ? 'neutral' : a.action.includes('sign') ? 'accent' : 'ok'}>{a.action}</Badge></td>
                    <td className="px-2 font-mono text-ink-2">{a.target}</td>
                    <td className="max-w-[200px] truncate px-2 text-ink-3">{a.detail}</td>
                    <td className="whitespace-nowrap px-4 text-right text-[11px] text-ink-3">{timeAgo(a.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Audit integrity" subtitle="Write-once log, each entry hashes the previous one" icon={ShieldCheck} />
          <div className={cx('flex items-center gap-3 rounded-xl p-3', data.auditIntegrity.ok ? 'bg-ok-soft' : 'bg-crit-soft')}>
            <Fingerprint className={cx('size-6', data.auditIntegrity.ok ? 'text-ok' : 'text-crit')} />
            <div>
              <div className={cx('text-[13px] font-semibold', data.auditIntegrity.ok ? 'text-ok' : 'text-crit')}>{data.auditIntegrity.ok ? 'Chain verified' : 'Chain broken'}</div>
              <div className="text-xs text-ink-2">{data.auditIntegrity.entries} entries, SHA-256 linked</div>
            </div>
          </div>
          {data.auditIntegrity.head && (
            <div className="mt-3">
              <div className="text-[11px] text-ink-3">Head hash (signed into this pack)</div>
              <Mono className="mt-0.5 block break-all text-[11px] text-ink-2">{data.auditIntegrity.head}</Mono>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-line p-2"><div className="text-lg font-semibold tabular">{(data.dq.overallAfter * 100).toFixed(1)}%</div><div className="text-[11px] text-ink-3">quality after</div></div>
            <div className="rounded-lg border border-line p-2"><div className="text-lg font-semibold tabular">{data.validationOpen}</div><div className="text-[11px] text-ink-3">open findings</div></div>
          </div>
        </Card>
      </div>
    </>
  );
}
