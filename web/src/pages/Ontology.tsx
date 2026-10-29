import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { BookOpenText, Check, ChevronRight, CircleSlash, GitCommitHorizontal, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { CodeListEntry, Concept } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, cx, Empty, Mono, PageHeader, SectionLabel, Skeleton, Tabs } from '@/components/ui';
import type { Tone } from '@/lib/format';

interface OntologyData {
  version: string;
  pack: string;
  concepts: Concept[];
  codeList: CodeListEntry[];
  standards: { id: string; contributes: string; usedIn: string }[];
  changeLog: { version: string; date: string; change: string; reason: string; source: string; author: string }[];
  proposals: { id: string; change: string; reason: string; source: string; status: 'proposed' | 'accepted' | 'rejected' }[];
}

type Tab = 'concepts' | 'codes' | 'standards' | 'governance';

const matchTone: Record<CodeListEntry['match'], Tone> = { exact: 'ok', close: 'info', broader: 'accent', unmatched: 'crit' };
const ops = [
  ['find_concept', 'text → ranked concepts with definitions'],
  ['get_concept', 'attributes, failure modes, relations'],
  ['get_constraints', 'SHACL rules, allowed parents, ranges'],
  ['get_vendor_binding', 'how a concept appears in Maximo, SAP, IFS'],
  ['get_precedents', 'approved and rejected bindings from memory'],
];

function ConceptDetail({ c, byId, onSelect }: { c: Concept; byId: Map<string, Concept>; onSelect: (id: string) => void }) {
  const { ask } = useApp();
  const chain: Concept[] = [];
  let p = c.parent ? byId.get(c.parent) : undefined;
  while (p) { chain.unshift(p); p = p.parent ? byId.get(p.parent) : undefined; }
  const label = (id: string) => byId.get(id)?.label ?? id;
  return (
    <motion.div key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 space-y-4">
      <Card>
        <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3" aria-label="Parent chain">
          {chain.map((x) => <span key={x.id} className="flex items-center gap-1"><button className="hover:text-accent hover:underline" onClick={() => onSelect(x.id)}>{x.label}</button><ChevronRight className="size-3" /></span>)}
          <span className="font-medium text-ink-2">{c.label}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{c.label}</h2>
              <Badge tone={c.layer === 'L0' ? 'accent' : 'agent'}>{c.layer === 'L0' ? 'L0 Core' : 'L1 Utilities pack'}</Badge>
              {c.standard && <Badge>{c.standard}</Badge>}
            </div>
            <Mono className="text-ink-3">{c.id}</Mono>
          </div>
          <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => ask(`How do the agents use the ontology concept "${c.label}" when mapping Maximo data?`)}>Ask agent</Button>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink">{c.definition}</p>
        {c.synonyms.length > 0 && (
          <div className="mt-3">
            <SectionLabel>Synonyms and local names</SectionLabel>
            <div className="flex flex-wrap gap-1.5">{c.synonyms.map((s) => <Badge key={s}>{s}</Badge>)}</div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Attributes" subtitle="Units from UCUM / QUDT, plausible ranges for semantic validation" />
          {c.attributes.length ? (
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wider text-ink-4"><tr><th className="pb-1.5 font-medium">Name</th><th className="pb-1.5 font-medium">Unit</th><th className="pb-1.5 font-medium">Range</th></tr></thead>
              <tbody>{c.attributes.map((a) => <tr key={a.name} className="border-t border-line"><td className="py-1.5 text-ink">{a.name}</td><td className="py-1.5"><Mono className="text-ink-2">{a.unit ?? '—'}</Mono></td><td className="py-1.5"><Mono className="text-ink-2">{a.range ?? '—'}</Mono></td></tr>)}</tbody>
            </table>
          ) : <p className="text-xs text-ink-3">No attributes on this concept.</p>}
        </Card>
        <Card>
          <CardHeader title="Valid failure modes" subtitle="ISO 14224 codes · checked by rule SM-02" />
          {c.failureModes.length ? <ul className="space-y-1.5">{c.failureModes.map((f) => <li key={f} className="flex items-center gap-2 text-[12.5px]"><span className="size-1.5 rounded-full bg-agent" />{f}</li>)}</ul> : <p className="text-xs text-ink-3">Not applicable.</p>}
        </Card>
      </div>

      <Card>
        <CardHeader title="Hierarchy rules" subtitle="Used by the Hierarchy Agent and rule SM-01" icon={ShieldCheck} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <SectionLabel>Allowed parents</SectionLabel>
            <div className="flex flex-wrap gap-1.5">{c.allowedParents.length ? c.allowedParents.map((p) => <button key={p} onClick={() => byId.has(p) && onSelect(p)}><Badge tone="ok" icon={Check}>{label(p)}</Badge></button>) : <span className="text-xs text-ink-3">Top level</span>}</div>
          </div>
          <div>
            <SectionLabel>Never under</SectionLabel>
            <div className="flex flex-wrap gap-1.5">{c.neverUnder?.length ? c.neverUnder.map((p) => <button key={p} onClick={() => byId.has(p) && onSelect(p)}><Badge tone="crit" icon={CircleSlash}>{label(p)}</Badge></button>) : <span className="text-xs text-ink-3">No explicit exclusions</span>}</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Vendor bindings" subtitle="L2 · how this concept appears in each system" />
        <div className="grid gap-3 md:grid-cols-3">
          {([['IBM Maximo', c.bindings.maximo], ['SAP PM', c.bindings.sap], ['IFS Cloud', c.bindings.ifs]] as const).map(([sys, v]) => (
            <div key={sys} className={cx('rounded-lg border p-3', sys === 'IFS Cloud' ? 'border-accent-line bg-accent-soft/50' : 'border-line bg-surface-2')}>
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-3">{sys}</div>
              <div className="mt-1 text-[12.5px] text-ink-2">{v ?? '—'}</div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

function ConceptsTab({ data }: { data: OntologyData }) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const selected = params.get('concept') ?? 'util:CentrifugalPump';
  const byId = useMemo(() => new Map(data.concepts.map((c) => [c.id, c])), [data]);
  const filtered = data.concepts.filter((c) => !q || `${c.label} ${c.synonyms.join(' ')} ${c.id}`.toLowerCase().includes(q.toLowerCase()));
  const select = (id: string) => setParams({ concept: id });
  const c = byId.get(selected) ?? data.concepts[0];
  return (
    <div className="grid gap-5 lg:grid-cols-[270px_1fr]">
      <div className="space-y-4">
        <Card pad={false} className="overflow-hidden">
          <div className="border-b border-line p-2">
            <label className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5">
              <Search className="size-3.5 text-ink-4" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search labels and synonyms" aria-label="Search concepts" className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-ink-4" />
            </label>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-1">
            {(['L0', 'L1'] as const).map((layer) => {
              const list = filtered.filter((x) => x.layer === layer);
              if (!list.length) return null;
              return (
                <div key={layer} className="mb-1">
                  <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">{layer === 'L0' ? 'L0 · Core' : 'L1 · Utilities pack'}</div>
                  {list.map((x) => (
                    <button key={x.id} onClick={() => select(x.id)} aria-current={x.id === c.id}
                      className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition', x.id === c.id ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-sunken')}>
                      <span className={cx('size-1.5 shrink-0 rounded-full', layer === 'L0' ? 'bg-accent' : 'bg-agent')} />
                      <span className="truncate">{x.label}</span>
                      {q && x.synonyms.some((s) => s.toLowerCase().includes(q.toLowerCase())) && <span className="ml-auto truncate text-[10.5px] text-ink-4">synonym</span>}
                    </button>
                  ))}
                </div>
              );
            })}
            {!filtered.length && <div className="px-3 py-6 text-center text-xs text-ink-3">No concept matches “{q}”.</div>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Agent API" subtitle="Operations available to agents" icon={Sparkles} />
          <ul className="space-y-2">
            {ops.map(([op, d]) => (
              <li key={op}><Mono className="text-[11.5px] font-medium text-agent">{op}()</Mono><div className="text-[11.5px] text-ink-3">{d}</div></li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-ink-4">OWL classes, SKOS code lists, SHACL constraints · graph store, JSON-LD export, vector index on labels.</p>
        </Card>
      </div>
      {c ? <ConceptDetail c={c} byId={byId} onSelect={select} /> : <Empty icon={BookOpenText} title="No concept selected" />}
    </div>
  );
}

function CodesTab({ data }: { data: OntologyData }) {
  const { ask } = useApp();
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-[13.5px] font-semibold">Work order status · concept scheme</h3>
          <p className="text-xs text-ink-3">Vendor values matched to ontology values as exact, close or broader. Unmatched codes are routed for review.</p>
        </div>
        <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => ask('Why are NV-HOLD, FLDCOMP and PEND-REG unmatched, and who decides?')}>Ask agent</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wider text-ink-4">
            <tr>{['Ontology status', 'Maximo', 'SAP PM', 'IFS Cloud', 'Match', 'Work orders'].map((h, i) => <th key={h} className={cx('px-4 py-2 font-medium', i === 5 && 'text-right')}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.codeList.map((e, i) => (
              <tr key={i} className={cx('border-t border-line', e.match === 'unmatched' && 'bg-crit-soft/40')}>
                <td className="px-4 py-2 text-ink">{e.ontology}</td>
                <td className="px-4 py-2"><Mono className="font-medium">{e.maximo}</Mono></td>
                <td className="px-4 py-2 text-ink-2">{e.sap}</td>
                <td className="px-4 py-2 text-ink-2">{e.ifs}</td>
                <td className="px-4 py-2"><Badge tone={matchTone[e.match]} dot>{e.match}</Badge></td>
                <td className="px-4 py-2 text-right tabular text-ink-2">{e.count?.toLocaleString('en-GB') ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GovernanceTab({ data }: { data: OntologyData }) {
  const { persona, act } = useApp();
  const curator = persona?.role === 'Ontology curator';
  const decide = (id: string, decision: 'accept' | 'reject') => act(() => api.post(`/ontology/proposals/${id}`, { decision, actor: persona?.id }), `Proposal ${id} ${decision === 'accept' ? 'accepted' : 'rejected'}`);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader title="Proposals from projects" subtitle="Submitted by the Ontology Steward · curator approval required" icon={Sparkles} />
        {!curator && <div className="mb-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">You are acting as {persona?.role ?? '…'}. Switch to Ari Cohen (Ontology curator) to accept or reject proposals.</div>}
        <ul className="space-y-3">
          {data.proposals.map((p) => (
            <li key={p.id} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Mono className="text-ink-3">{p.id}</Mono><Badge tone={p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'neutral' : 'warn'} dot>{p.status}</Badge></div>
                  <div className="mt-1 text-[13px] font-medium text-ink">{p.change}</div>
                  <div className="mt-0.5 text-xs text-ink-3">{p.reason} · {p.source}</div>
                </div>
              </div>
              {p.status === 'proposed' && (
                <div className="mt-2.5 flex gap-1.5">
                  <Button size="sm" variant="ok" icon={Check} disabled={!curator} onClick={() => decide(p.id, 'accept')}>Accept</Button>
                  <Button size="sm" variant="danger" icon={X} disabled={!curator} onClick={() => decide(p.id, 'reject')}>Reject</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Change log" subtitle={`Semantic versions · this project is pinned to ${data.version}`} icon={GitCommitHorizontal} />
        <ol className="relative space-y-4 border-l border-line pl-4">
          {data.changeLog.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-surface bg-accent" />
              <div className="flex items-center gap-2 text-xs"><Mono className="font-medium text-ink">{e.version}</Mono><span className="text-ink-4">{e.date}</span><Badge>{e.source}</Badge></div>
              <div className="mt-0.5 text-[12.5px] text-ink">{e.change}</div>
              <div className="text-xs text-ink-3">{e.reason}</div>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
          Release gate: every new version must pass the golden test datasets. A version that lowers mapping accuracy is not published. Each change carries its reason and its source.
        </div>
      </Card>
    </div>
  );
}

export default function Ontology() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'concepts';
  const { data } = useApi<OntologyData>('/ontology');
  const setTab = (t: Tab) => setParams(t === 'concepts' ? {} : { tab: t });
  return (
    <>
      <PageHeader
        eyebrow={<><BookOpenText className="size-3.5" />Knowledge</>}
        title="Industrial Asset Ontology"
        description="Concepts, code lists, standards and version history for the pinned ontology."
        badges={data && <><Badge tone="agent">{data.version}</Badge><Badge tone="accent">{data.pack}</Badge><Badge>{data.concepts.length} concepts</Badge></>}
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
        { id: 'concepts', label: 'Concepts', count: data?.concepts.length },
        { id: 'codes', label: 'Code lists', count: data?.codeList.length },
        { id: 'standards', label: 'Standards', count: data?.standards.length },
        { id: 'governance', label: 'Governance', count: data?.proposals.filter((p) => p.status === 'proposed').length },
      ]} />
      {!data ? <Skeleton className="h-96" /> : tab === 'concepts' ? <ConceptsTab data={data} /> : tab === 'codes' ? <CodesTab data={data} /> : tab === 'governance' ? <GovernanceTab data={data} /> : (
        <Card pad={false}>
          <div className="border-b border-line px-4 py-3 text-xs text-ink-3">Structure and vocabularies come from public standards. Artizent writes its own definitions and licenses standards where required.</div>
          <ul className="divide-y divide-line">
            {data.standards.map((s) => (
              <li key={s.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr_220px] sm:items-center">
                <span className="text-[13px] font-semibold">{s.id}</span>
                <span className="text-[12.5px] text-ink-2">{s.contributes}</span>
                <Badge className="justify-self-start sm:justify-self-end">{s.usedIn}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
