import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, FileCode2, Gauge, Link2Off, Puzzle, ScanSearch, ShieldCheck, Sparkles, Table2, X } from 'lucide-react';
import type { CatalogueField, CatalogueTable, CodeRule } from '@shared/types';
import { useApi, useApp, useAssistantFocus } from '@/lib/app';
import { api } from '@/lib/api';
import { num } from '@/lib/format';
import { Badge, Button, Card, CardHeader, Confidence, cx, Empty, Mono, PageHeader, SectionLabel, Skeleton, Stat, Tabs } from '@/components/ui';

interface CatalogueData {
  tables: CatalogueTable[];
  stats: Record<string, number>;
  badMeter: { asset: string; meter: string; readings: { date: string; value: number }[] } | null;
}

type Tab = 'catalogue' | 'custom' | 'rules';

function MeterSpark({ readings }: { readings: { date: string; value: number }[] }) {
  const w = 160, h = 44, max = Math.max(...readings.map((r) => r.value));
  const pts = readings.map((r, i) => [(i / (readings.length - 1)) * (w - 8) + 4, h - 4 - (r.value / max) * (h - 10)]);
  const bad = readings.findIndex((r, i) => i > 0 && r.value < readings[i - 1].value);
  return (
    <svg width={w} height={h} role="img" aria-label="Runtime hours readings with one decreasing value">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--ink-4)" strokeWidth={1.5} />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === bad ? 3.5 : 2} fill={i === bad ? 'var(--crit)' : 'var(--ink-3)'} />)}
    </svg>
  );
}

function FieldRow({ f, onRule }: { f: CatalogueField; onRule: (id: string) => void }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2.5 pl-4 pr-3">
        <div className="flex items-center gap-1.5">
          <Mono className="font-medium text-ink">{f.name}</Mono>
          {f.custom && <Badge tone="warn">Custom</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">{f.description}</div>
        {f.touchedByRule && (
          <button onClick={() => onRule(f.touchedByRule!)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-info hover:underline">
            <FileCode2 className="size-3" />Touched by {f.touchedByRule}
          </button>
        )}
      </td>
      <td className="px-3 py-2.5"><Mono className="text-ink-2">{f.type}{f.length ? `(${f.length})` : ''}</Mono></td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken"><div className={cx('h-full rounded-full', f.nullRate > 30 ? 'bg-warn' : 'bg-ink-4')} style={{ width: `${Math.min(100, f.nullRate)}%` }} /></div>
          <span className="text-xs tabular text-ink-2">{f.nullRate}%</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs tabular text-ink-2">{num(f.distinct)}</td>
      <td className="px-3 py-2.5">
        {f.topValues.length ? (
          <div className="space-y-0.5">
            {f.topValues.slice(0, 3).map((v) => (
              <div key={v.value} className="flex items-center gap-1.5 text-[11px]">
                <div className="h-1 w-10 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-accent" style={{ width: `${v.pct}%` }} /></div>
                <Mono className="max-w-[110px] truncate text-[11px] text-ink-2">{v.value}</Mono>
                <span className="text-ink-4 tabular">{v.pct}%</span>
              </div>
            ))}
          </div>
        ) : f.pattern ? <Mono className="text-[11px] text-ink-3">{f.pattern}</Mono> : <span className="text-xs text-ink-4">—</span>}
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right">{f.brokenRefs ? <Badge tone="bad" icon={Link2Off}>{f.brokenRefs}</Badge> : <span className="text-xs text-ink-4">0</span>}</td>
    </tr>
  );
}

function CatalogueTab({ data, onRule }: { data: CatalogueData; onRule: (id: string) => void }) {
  const [sel, setSel] = useState('ASSET');
  const table = data.tables.find((t) => t.name === sel) ?? data.tables[0];
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <Card pad={false} className="h-fit overflow-hidden">
        <div className="border-b border-line px-3 py-2.5 text-xs font-medium text-ink-3">Source catalogue · Maximo</div>
        <ul className="max-h-[560px] overflow-y-auto p-1" role="listbox" aria-label="Tables">
          {data.tables.map((t) => (
            <li key={t.name}>
              <button role="option" aria-selected={t.name === sel} onClick={() => setSel(t.name)}
                className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition', t.name === sel ? 'bg-accent-soft' : 'hover:bg-sunken', !t.inScope && 'opacity-55')}>
                <Table2 className={cx('size-3.5 shrink-0', t.name === sel ? 'text-accent' : 'text-ink-4')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><Mono className="truncate font-medium text-ink">{t.name}</Mono>{t.custom && <span className="size-1.5 rounded-full bg-warn" title="Custom" />}</div>
                  <div className="truncate text-[11px] text-ink-3">{t.description}</div>
                </div>
                <span className="text-[11px] tabular text-ink-4">{num(t.rows)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <motion.div key={table.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
        <Card pad={false}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <div className="flex items-center gap-2"><Mono className="text-[14px] font-semibold text-ink">{table.name}</Mono>{table.custom && <Badge tone="warn">Custom table</Badge>}{!table.inScope && <Badge>Out of scope</Badge>}</div>
              <div className="mt-0.5 text-xs text-ink-3">{table.description} · {num(table.rows)} rows · {table.fields.length} fields profiled</div>
            </div>
            {table.ifsTarget && <Badge tone="accent">→ {table.ifsTarget}</Badge>}
          </div>
          {table.fields.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[11px] font-medium uppercase tracking-wider text-ink-4">
                  <tr><th className="py-2 pl-4 pr-3 font-medium">Field</th><th className="px-3 font-medium">Type</th><th className="px-3 font-medium">Null</th><th className="px-3 font-medium">Distinct</th><th className="px-3 font-medium">Top values / pattern</th><th className="pl-3 pr-4 text-right font-medium">Broken refs</th></tr>
                </thead>
                <tbody>{table.fields.map((f) => <FieldRow key={f.name} f={f} onRule={onRule} />)}</tbody>
              </table>
            </div>
          ) : (
            <div className="p-4"><Empty icon={Table2} title="Table-level profile only">Field statistics are not collected for this table.</Empty></div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

function CustomTab({ data }: { data: CatalogueData }) {
  const { ask } = useApp();
  const items = data.tables.flatMap((t) => (t.custom ? [{ name: t.name, kind: 'Table', desc: t.description, table: t.name, rule: undefined as string | undefined }] : t.fields.filter((f) => f.custom).map((f) => ({ name: `${t.name}.${f.name}`, kind: 'Field', desc: f.description, table: t.name, rule: f.touchedByRule }))));
  return (
    <Card pad={false}>
      <div className="border-b border-line px-4 py-3 text-xs text-ink-3">Fields and tables outside the Maximo standard schema.</div>
      <ul className="divide-y divide-line">
        {items.map((it, i) => (
          <motion.li key={it.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-3 px-4 py-3">
            <Puzzle className="size-4 text-warn" />
            <div className="min-w-0 flex-1">
              <Mono className="font-medium text-ink">{it.name}</Mono>
              <div className="text-xs text-ink-3">{it.desc}</div>
            </div>
            <Badge>{it.kind}</Badge>
            {it.rule && <Badge tone="info" icon={FileCode2}>{it.rule}</Badge>}
            <Badge tone="warn" dot>Marked for review</Badge>
            <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => ask(`What should we do with the custom element ${it.name}?`)}>Ask</Button>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}

function CodeView({ rule }: { rule: CodeRule }) {
  const lines = rule.snippet.split('\n');
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-sunken">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11px]">
        <Mono className="text-ink-2">{rule.sourceFile}</Mono>
        <span className="text-ink-3">{rule.language}</span>
      </div>
      <pre className="overflow-x-auto py-2 font-mono text-[12px] leading-[1.6]">
        {lines.map((l, i) => {
          const n = i + 1;
          const hi = n >= rule.highlight[0] && n <= rule.highlight[1];
          return (
            <div key={i} className={cx('flex pr-4', hi && 'border-l-2 border-agent bg-agent-soft')}>
              <span className={cx('w-10 shrink-0 select-none pr-3 text-right text-ink-4', !hi && 'border-l-2 border-transparent')}>{n}</span>
              <span className={cx('whitespace-pre', hi ? 'text-ink' : l.trim().startsWith('#') || l.trim().startsWith('//') ? 'text-ink-4' : 'text-ink-2')}>{l || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function RuleCard({ rule, focused }: { rule: CodeRule; focused: boolean }) {
  const { act, persona, ask } = useApp();
  const decide = (decision: 'confirm' | 'dismiss') => act(() => api.post(`/code-rules/${rule.id}`, { decision, actor: persona?.id }), decision === 'confirm' ? `${rule.id} confirmed` : `${rule.id} dismissed`);
  return (
    <Card id={rule.id} className={cx('scroll-mt-6', focused && 'ring-2 ring-agent/30')}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="text-[13px] font-semibold text-ink">{rule.id}</Mono>
            <Badge tone={rule.status === 'confirmed' ? 'ok' : rule.status === 'dismissed' ? 'neutral' : 'warn'} dot>{rule.status === 'proposed' ? 'To confirm' : rule.status}</Badge>
            <Confidence value={rule.confidence} />
          </div>
          <div className="mt-1 text-xs text-ink-3">{rule.launchPoint}</div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => ask(`Explain the business rule ${rule.id} and what it means for the migration.`)}>Ask agent</Button>
          <Button size="sm" variant="danger" icon={X} disabled={rule.status === 'dismissed'} onClick={() => decide('dismiss')}>Dismiss</Button>
          <Button size="sm" variant="ok" icon={Check} disabled={rule.status === 'confirmed'} onClick={() => decide('confirm')}>Confirm</Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <CodeView rule={rule} />
        <div className="space-y-3">
          <div>
            <SectionLabel>Rule in plain language</SectionLabel>
            <p className="text-[13px] leading-relaxed text-ink">{rule.ruleText}</p>
          </div>
          <div>
            <SectionLabel>Fields touched</SectionLabel>
            <div className="flex flex-wrap gap-1.5">{rule.fieldsTouched.map((f) => <Badge key={f} tone="info"><Mono className="text-[11px]">{f}</Mono></Badge>)}</div>
          </div>
          <div className="rounded-lg border border-warn/30 bg-warn-soft p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-warn">Migration impact</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{rule.impact}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Discovery() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'catalogue';
  const focus = params.get('rule') ?? undefined;
  const { data } = useApi<CatalogueData>('/catalogue');
  const { data: rules } = useApi<CodeRule[]>('/code-rules');
  const { runStage, dashboard } = useApp();
  useAssistantFocus(undefined, undefined);

  const stats = useMemo(() => {
    if (!data) return null;
    const fields = data.tables.flatMap((t) => t.fields);
    return {
      tables: data.tables.filter((t) => t.inScope).length,
      fields: fields.length,
      custom: data.tables.filter((t) => t.custom).length + fields.filter((f) => f.custom).length,
      broken: fields.reduce((s, f) => s + (f.brokenRefs ?? 0), 0),
    };
  }, [data]);

  useEffect(() => {
    if (focus && rules) document.getElementById(focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, rules]);

  const setTab = (t: Tab) => setParams(t === 'catalogue' ? {} : { tab: t });
  const openRule = (id: string) => setParams({ tab: 'rules', rule: id });
  const busy = !!dashboard?.running;

  return (
    <>
      <PageHeader
        eyebrow={<><ScanSearch className="size-3.5" />Stages 2–4{dashboard?.stages.find((s) => s.n === 4)?.finishedAt ? ` · last run ${new Date(dashboard.stages.find((s) => s.n === 4)!.finishedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</>}
        title="Discovery"
        description="Source catalogue, data profile and business rules found in custom code."
        actions={<>
          <Button disabled={busy} onClick={() => runStage(3)}>Re-profile</Button>
          <Button variant="agent" icon={FileCode2} disabled={busy} onClick={() => runStage(4)}>Re-read custom code</Button>
        </>}
      />

      {!data || !stats ? <Skeleton className="h-28" /> : (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Tables in scope" icon={Table2} value={stats.tables} sub={`${data.tables.length - stats.tables} out of scope`} />
          <Stat label="Fields profiled" icon={Gauge} value={stats.fields} sub="across in-scope tables" />
          <Stat label="Custom elements" icon={Puzzle} tone="warn" value={stats.custom} sub="marked for review" />
          <Stat label="Broken references" icon={Link2Off} tone="bad" value={stats.broken} sub="sent to validation" />
          {data.badMeter ? (
            <Card className="h-full">
              <div className="text-xs font-medium text-ink-3">Cumulative meter goes down</div>
              <div className="mt-1"><MeterSpark readings={data.badMeter.readings} /></div>
              <div className="mt-0.5 text-xs text-ink-3"><Mono className="text-[11px]">{data.badMeter.asset}</Mono> · {data.badMeter.meter}</div>
            </Card>
          ) : (
            <Stat label="Meter readings" icon={Gauge} value="None" sub="no meter extract loaded; meter checks run once one is" />
          )}
        </div>
      )}

      <Tabs className="mb-5" value={tab} onChange={setTab}
        tabs={[
          { id: 'catalogue', label: 'Catalogue', count: data?.tables.length },
          { id: 'custom', label: 'Custom elements', count: stats?.custom },
          { id: 'rules', label: 'Hidden business rules', count: rules?.length },
        ]} />

      {!data ? <Skeleton className="h-96" /> : tab === 'catalogue' ? <CatalogueTab data={data} onRule={openRule} /> : tab === 'custom' ? <CustomTab data={data} /> : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <ShieldCheck className="size-4 text-ok" />
            Analysed with the Astra RE Harness · read-only
          </div>
          {rules?.map((r) => <RuleCard key={r.id} rule={r} focused={r.id === focus} />)}
          {rules && !rules.length && <Empty icon={FileCode2} title="No hidden rules found" />}
        </div>
      )}
    </>
  );
}
