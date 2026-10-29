import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Bot, Check, ChevronRight, Copy, Cpu, Gauge, History, MapPin, Search, Sparkle, Sparkles, Wrench } from 'lucide-react';
import { useApi, useApp } from '@/lib/app';
import { Badge, Button, Card, CardHeader, cx, Mono, PageHeader, SectionLabel, Segmented, Skeleton } from '@/components/ui';

interface AiAsset {
  '@context': Record<string, string>;
  '@id': string;
  '@type': string[];
  label: string;
  ontologyClass: { id: string; label: string; definition: string; standard?: string; version: string };
  identity: { objectId: string; serialNo?: string; manufacturer?: string; model?: string; installed?: string };
  placement: { site: { id: string; name: string }; functionalPath: string[]; parentObject: string; children: { id: string; class?: string }[] };
  criticality: { value: string; scale: string; source: string };
  technicalAttributes: { name: string; value: string | number; unit?: string }[];
  failureVocabulary: { code?: string; label: string; scheme: string }[];
  allowedParents: (string | undefined)[];
  measurements: { parameter: string; concept: string; cumulative: boolean; lastValue: number; unit: string; lastRead: string }[];
  maintenance: { pmActions: { id: string; name: string; trigger: string }[] };
  failureHistory?: { mode: string; code: string | null; count: number; confidence: number; needsReview: number }[];
  workHistory: { openWorkOrders: number; closedLast5Years?: number; topFailureModes?: { code: string; count: number }[]; meanTimeBetweenFailuresDays?: number };
  provenance: { source: string; mappings: string[]; loadRun?: string; transformation?: string };
}

/** Tiny JSON syntax highlighter (no HTML injection). */
function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) out.push(<span key={i++} className="text-accent">{m[1]}</span>, m[2]);
    else if (m[1]) out.push(<span key={i++} className={m[1].startsWith('"util:') || m[1].startsWith('"core:') ? 'text-agent' : 'text-ok'}>{m[1]}</span>);
    else if (m[3]) out.push(<span key={i++} className="text-warn">{m[3]}</span>);
    else out.push(<span key={i++} className="text-info">{m[4]}</span>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <pre className="overflow-auto whitespace-pre p-4 font-mono text-[11.5px] leading-[1.6] text-ink-2">{out}</pre>;
}

const unitFallback: Record<string, string> = { RATEDFLOW: 'm³/h', RATEDHEAD: 'm', RATEDPOWER: 'kW', RATINGKVA: 'kVA', VOLTAGE: 'V', SPEED: 'rpm', SIZE: 'mm', DOSERATE: 'kg/day' };
const attrLabel = (n: string) => ({ RATEDFLOW: 'Rated flow', RATEDHEAD: 'Rated head', RATEDPOWER: 'Rated power', SEALTYPE: 'Seal type', DRIVER: 'Driver type', RATINGKVA: 'Rating', VOLTAGE: 'Voltage' } as Record<string, string>)[n] ?? n;

function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return <div className="flex justify-between gap-3 py-1 text-[12.5px]"><span className="text-ink-3">{k}</span><span className={cx('truncate text-right text-ink', mono && 'font-mono text-[12px]')}>{v}</span></div>;
}

export default function AiReady() {
  const [assetInput, setAssetInput] = useState('');
  const [asset, setAsset] = useState<string | null>(null);
  const { data } = useApi<AiAsset>(asset ? `/ai-ready?asset=${encodeURIComponent(asset)}` : '/ai-ready');
  const { ask, toast } = useApp();
  const [view, setView] = useState<'jsonld' | 'raw'>('jsonld');
  const [copied, setCopied] = useState(false);

  if (!data) return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-[520px]" /></div>;
  const a = data;
  const rawRow: [string, string][] = [
    ['ASSETNUM', a.identity.objectId], ['DESCRIPTION', a.label], ['CLASSSTRUCTUREID', 'PUMP\\CENTRIFUGAL'], ['SERIALNUM', a.identity.serialNo ?? ''],
    ['LOCATION', a.placement.parentObject], ['NV_CRITCODE', String('EDCBA'.indexOf(a.criticality.value) + 1)], ['STATUS', 'OPERATING'],
    ...a.technicalAttributes.slice(0, 4).map((t) => [`ASSETSPEC.${t.name}`, String(t.value)] as [string, string]),
    ['FAILURECODE', 'PUMPS'], ['METERNAME', 'RUNHRS'],
  ];
  const meaning: Record<string, string> = {
    CLASSSTRUCTUREID: `${a.ontologyClass.label} · ${a.ontologyClass.id}`,
    NV_CRITCODE: `Asset criticality ${a.criticality.value} (highest is A)`,
    LOCATION: `Functional object in ${a.placement.functionalPath.at(-1)}`,
    FAILURECODE: `${a.failureVocabulary.length} valid failure modes, ISO 14224`,
    METERNAME: 'Runtime hours, cumulative (never decreases)',
    SERIALNUM: 'Serial number of a physical asset',
  };
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(a, null, 2));
    setCopied(true);
    toast('JSON-LD copied');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <PageHeader
        eyebrow={<><Sparkle className="size-3.5" /> Deliver · {a.provenance.loadRun}</>}
        title="AI-ready asset context"
        description="Ontology-tagged asset record as delivered to IFS.ai, Loops and Resolve."
        actions={<>
          <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); setAsset(assetInput.trim() || null); }}>
            <div className="flex h-8.5 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 shadow-card">
              <Search className="size-3.5 text-ink-4" />
              <input value={assetInput} onChange={(e) => setAssetInput(e.target.value.toUpperCase())} placeholder={a.identity.objectId} className="w-28 bg-transparent font-mono text-[12px] outline-none" aria-label="Asset id" />
            </div>
            <Button type="submit">Load asset</Button>
          </form>
          <Button variant="agent" icon={Sparkles} onClick={() => ask(`How would a Loops Digital Worker use the context for asset ${a.identity.objectId}?`)}>Ask agent</Button>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        {/* Asset card */}
        <Card pad={false} className="overflow-hidden">
          <div className="border-b border-line bg-gradient-to-br from-agent-soft to-transparent p-5">
            <div className="flex items-center gap-1 text-[11.5px] text-ink-3">
              <MapPin className="size-3.5" />
              {a.placement.functionalPath.map((p, i) => <span key={p} className="flex items-center gap-1">{i > 0 && <ChevronRight className="size-3 text-ink-4" />}{p}</span>)}
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-semibold tracking-tight">{a.label}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="agent">{a.ontologyClass.label}</Badge>
                  <Mono className="text-ink-3">{a.ontologyClass.id}</Mono>
                  {a.ontologyClass.standard && <Badge tone="neutral">{a.ontologyClass.standard}</Badge>}
                </div>
              </div>
              <div className="text-center">
                <div className="grid size-12 place-items-center rounded-xl bg-crit-soft text-xl font-bold text-crit">{a.criticality.value}</div>
                <div className="mt-1 text-[10.5px] text-ink-3">Criticality</div>
              </div>
            </div>
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink-2">{a.ontologyClass.definition}</p>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface p-4">
              <SectionLabel>Identity</SectionLabel>
              <Row k="Object id" v={a.identity.objectId} mono />
              <Row k="Serial no" v={a.identity.serialNo} mono />
              <Row k="Manufacturer" v={`${a.identity.manufacturer} ${a.identity.model}`} />
              <Row k="Installed" v={a.identity.installed} />
              <Row k="IFS site" v={`${a.placement.site.id} · ${a.placement.site.name}`} />
            </div>
            <div className="bg-surface p-4">
              <SectionLabel>Technical attributes</SectionLabel>
              {a.technicalAttributes.map((t) => <Row key={t.name} k={attrLabel(t.name)} v={<>{t.value}{(t.unit ?? unitFallback[t.name]) && <span className="ml-1 text-ink-3">{t.unit ?? unitFallback[t.name]}</span>}</>} />)}
            </div>
            <div className="bg-surface p-4 sm:col-span-2">
              <SectionLabel>Failure vocabulary · valid for this class</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {a.failureVocabulary.map((f) => (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px]">
                    <Mono className="font-semibold text-agent">{f.code}</Mono>{f.label}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[11.5px] text-ink-3">Allowed parents: {a.allowedParents.filter(Boolean).join(', ')}. Never a valve, meter or instrument.</div>
            </div>
            <div className="bg-surface p-4">
              <SectionLabel>Measurements & maintenance</SectionLabel>
              {a.measurements.map((m) => (
                <div key={m.parameter} className="flex items-center gap-2 py-1 text-[12.5px]">
                  <Gauge className="size-3.5 text-info" /><span className="flex-1">{m.parameter}{m.cumulative && <span className="ml-1 text-[11px] text-ink-3">(cumulative)</span>}</span>
                  <span className="font-mono tabular">{m.lastValue.toLocaleString('en-GB')} {m.unit}</span>
                </div>
              ))}
              {a.maintenance.pmActions.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1 text-[12.5px]"><Wrench className="size-3.5 text-ink-3" /><span className="flex-1 truncate">{p.name}</span><span className="text-[11px] text-ink-3">{p.trigger}</span></div>
              ))}
            </div>
            <div className="bg-surface p-4">
              <SectionLabel>Work history</SectionLabel>
              <Row k="Open work orders" v={a.workHistory.openWorkOrders} />
              {a.workHistory.closedLast5Years !== undefined && <Row k="Closed, last 5 years" v={a.workHistory.closedLast5Years} />}
              {a.workHistory.meanTimeBetweenFailuresDays !== undefined && <Row k="Mean time between failures" v={`${a.workHistory.meanTimeBetweenFailuresDays} days`} />}
              {!!a.failureHistory?.length && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-medium text-ink-3">Failure modes tagged in work history</div>
                  {a.failureHistory.map((f) => (
                    <div key={f.mode} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate text-ink-2">{f.code ? <b className="mr-1 font-mono text-[11px] text-ink">{f.code}</b> : null}{f.mode.replace(/\s*\(\w+\)/, '')}</span>
                      <span className="shrink-0 tabular text-ink-3">{f.count} · {f.confidence.toFixed(2)}{f.needsReview ? ` · ${f.needsReview} to review` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {!!a.workHistory.topFailureModes?.length && (
                <div className="mt-1.5 flex gap-1.5">
                  {a.workHistory.topFailureModes.map((f) => <Badge key={f.code} tone="neutral"><History className="size-3" />{f.code} × {f.count}</Badge>)}
                </div>
              )}
            </div>
            <div className="bg-surface p-4 sm:col-span-2">
              <SectionLabel>Provenance</SectionLabel>
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <Badge tone="neutral">{a.provenance.source}</Badge>
                <span className="text-ink-4">via</span>
                {a.provenance.mappings.map((m) => <Link key={m} to={`/review?item=${m}`} className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] text-accent hover:underline">{m}</Link>)}
                <span className="text-ink-4">·</span>
                <span className="text-ink-3">{a.provenance.loadRun} · {a.provenance.transformation} · {a.ontologyClass.version}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* JSON-LD / raw */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card pad={false} className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <Segmented size="sm" value={view} onChange={setView} options={[{ id: 'jsonld', label: 'JSON-LD' }, { id: 'raw', label: 'Source row' }]} />
              <div className="flex-1" />
              {view === 'jsonld' && <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>}
            </div>
            {view === 'jsonld' ? (
              <div className="max-h-[560px] overflow-auto bg-surface-2"><JsonView value={a} /></div>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="border-b border-line text-left text-[11px] text-ink-3"><th className="px-4 py-2 font-medium">Maximo field</th><th className="px-2 py-2 font-medium">Value</th><th className="px-4 py-2 font-medium">Ontology binding</th></tr></thead>
                  <tbody>
                    {rawRow.map(([k, v]) => (
                      <tr key={k} className="border-b border-line last:border-0">
                        <td className="px-4 py-1.5 font-mono text-ink-2">{k}</td>
                        <td className="max-w-[160px] truncate px-2 py-1.5 font-mono text-ink">{v}</td>
                        <td className="px-4 py-1.5 text-ink-4">{k.startsWith('NV_') ? 'Unbound custom field' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Semantic tags" subtitle="Source fields resolved to ontology meaning" icon={Bot} />
            <div className="space-y-1.5">
              {Object.entries(meaning).map(([field, m]) => (
                <div key={field} className="grid grid-cols-[minmax(0,9rem)_auto_1fr] items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px]">
                  <Mono className="truncate text-ink-3">{field}</Mono>
                  <ChevronRight className="size-3.5 text-agent" />
                  <span className="text-ink">{m}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[{ icon: Cpu, t: 'IFS.ai', d: 'Class and attributes' }, { icon: Bot, t: 'Loops', d: 'Failure modes and history' }, { icon: Activity, t: 'Resolve', d: 'Identity and placement' }].map((x) => (
                <div key={x.t} className="rounded-lg border border-line p-2">
                  <x.icon className="mx-auto size-4 text-agent" />
                  <div className="mt-1 text-[12px] font-semibold">{x.t}</div>
                  <div className="text-[10.5px] leading-snug text-ink-3">{x.d}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
