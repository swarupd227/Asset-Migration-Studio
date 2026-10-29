import { useState } from 'react';
import { Check, Cpu, Send, Sparkles, X } from 'lucide-react';
import type { Concept, EnhancementItem, EnhancementSuggestion, OntologyProposalRecord, RelationType, RelationTypeDef } from '@shared/types';
import { useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, cx, Mono, Skeleton } from '@/components/ui';
import { relationFamily, type ConceptIndex } from './graph';

// Review of suggested additions to a concept. The ontology curator accepts or rejects each one;
// everyone else proposes them to the curator. Nothing changes the ontology without the curator.

type ItemState = 'proposed' | 'accepted' | 'rejected' | 'busy';
const kindLabel: Record<EnhancementItem['kind'], string> = { synonym: 'Synonym', property: 'Property', failureMode: 'Failure mode', relation: 'Relationship' };
const systemLabel = { general: '', maximo: 'IBM Maximo', sap: 'SAP PM', ifs: 'IFS Cloud' } as const;
const order: EnhancementItem['kind'][] = ['synonym', 'property', 'failureMode', 'relation'];

export function EnhancePanel({ c, byId, types, suggestion, loading, onSelect, onClose, onChanged }: {
  c: Concept; byId: ConceptIndex; types: Map<RelationType, RelationTypeDef>; suggestion?: EnhancementSuggestion; loading: boolean;
  onSelect: (id: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const { persona, act } = useApp();
  const curator = persona?.role === 'Ontology curator';
  const [state, setState] = useState<Record<string, ItemState>>({});

  const send = async (items: EnhancementItem[], decision: 'propose' | 'accept' | 'reject') => {
    if (!suggestion || !items.length) return;
    setState((s) => ({ ...s, ...Object.fromEntries(items.map((i) => [i.key, 'busy' as const])) }));
    const ok = { propose: 'Sent to the ontology curator', accept: 'Accepted and published', reject: 'Rejected' }[decision];
    const r = await act(() => api.post<{ proposals: OntologyProposalRecord[]; version?: string }>(`/ontology/concepts/${encodeURIComponent(c.id)}/proposals`, {
      actor: persona?.id, origin: suggestion.source, model: suggestion.model, items, decision,
    }), items.length > 1 ? `${items.length} additions: ${ok.toLowerCase()}` : ok);
    const done = new Map((r?.proposals ?? []).map((p) => [p.item?.key, p.status]));
    setState((s) => {
      const next = { ...s };
      for (const i of items) {
        if (r) next[i.key] = done.get(i.key) ?? 'proposed';
        else delete next[i.key];
      }
      return next;
    });
    if (r) onChanged();
  };

  const open = suggestion?.items.filter((i) => !state[i.key]) ?? [];
  const label = (id: string) => byId.get(id)?.label ?? id;

  return (
    <Card className="border-agent/40">
      <CardHeader
        title={`Suggested additions · ${c.label}`}
        subtitle={curator ? 'Accept or reject each addition. Accepted additions publish a new ontology version.' : 'Propose additions to the ontology curator, who accepts or rejects them.'}
        icon={Sparkles}
        right={<Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label="Close suggestions">Close</Button>}
      />
      {loading || !suggestion ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-3">The Ontology Steward is reviewing {c.label.toLowerCase()} against its neighbours, the standards and the source catalogue…</p>
          <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
        </div>
      ) : (
        <>
          <div className={cx('mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', suggestion.source === 'model' ? 'border-transparent bg-agent-soft text-agent' : 'border-line bg-surface-2 text-ink-2')}>
            {suggestion.source === 'model' ? <Sparkles className="mt-0.5 size-3.5 shrink-0" /> : <Cpu className="mt-0.5 size-3.5 shrink-0" />}
            <div>
              <div className="font-medium">{suggestion.source === 'model' ? `Suggested by ${suggestion.model}` : 'Derived in-environment, without a model call'}</div>
              <div className="opacity-90">{suggestion.basis}{suggestion.dropped > 0 && ` ${suggestion.dropped} suggestion${suggestion.dropped === 1 ? ' was' : 's were'} dropped because ${suggestion.dropped === 1 ? 'it' : 'they'} did not fit the ontology.`}</div>
            </div>
          </div>
          <p className="mb-3 text-[12.5px] text-ink-2">{suggestion.summary}</p>
          {!suggestion.items.length && <p className="text-xs text-ink-3">Nothing new to add. Every candidate is already in the ontology or waiting for the curator.</p>}
          <div className="space-y-4">
            {order.map((kind) => {
              const list = suggestion.items.filter((i) => i.kind === kind);
              if (!list.length) return null;
              return (
                <div key={kind}>
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">{kindLabel[kind]}s</div>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {list.map((i) => {
                      const st = state[i.key];
                      return (
                        <li key={i.key} className={cx('flex flex-wrap items-start gap-3 px-3 py-2', st && st !== 'busy' && 'bg-surface-2')}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink">
                              {i.kind === 'synonym' && <><span className="font-medium">{i.value}</span>{i.system && i.system !== 'general' && <Badge>{systemLabel[i.system]}</Badge>}</>}
                              {i.kind === 'failureMode' && <span className="font-medium">{i.value}</span>}
                              {i.kind === 'property' && i.property && <>
                                <span className="font-medium">{i.property.name}</span>
                                <Badge>{i.property.datatype}</Badge>
                                {i.property.unit && <Mono className="text-ink-2">{i.property.unit}</Mono>}
                                {i.property.range && <Mono className="text-ink-3">{i.property.range}</Mono>}
                              </>}
                              {i.kind === 'relation' && i.relation && <>
                                <span className="text-ink-3">{c.label}</span>
                                <Badge tone={relationFamily[i.relation.type].tone}>{types.get(i.relation.type)?.label ?? i.relation.type}</Badge>
                                <button className="font-medium text-accent hover:underline" onClick={() => onSelect(i.relation!.target)}>{label(i.relation.target)}</button>
                                {i.relation.cardinality && <Mono className="text-ink-3">[{i.relation.cardinality}]</Mono>}
                              </>}
                            </div>
                            {i.property?.definition && <div className="mt-0.5 text-xs text-ink-3">{i.property.definition}</div>}
                            {i.rationale && <div className="mt-0.5 text-xs text-ink-3">{i.rationale}</div>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {st && st !== 'busy' ? (
                              <Badge tone={st === 'accepted' ? 'ok' : st === 'rejected' ? 'neutral' : 'warn'} dot>{st === 'proposed' ? 'with the curator' : st}</Badge>
                            ) : curator ? (
                              <>
                                <Button size="sm" variant="ok" icon={Check} disabled={st === 'busy'} onClick={() => send([i], 'accept')}>Accept</Button>
                                <Button size="sm" variant="danger" icon={X} disabled={st === 'busy'} onClick={() => send([i], 'reject')}>Reject</Button>
                              </>
                            ) : (
                              <Button size="sm" icon={Send} disabled={st === 'busy'} onClick={() => send([i], 'propose')}>Propose</Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          {open.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <span className="mr-auto text-xs text-ink-3">{open.length} additions not yet decided</span>
              {curator
                ? <Button size="sm" variant="ok" icon={Check} onClick={() => send(open, 'accept')}>Accept all</Button>
                : <Button size="sm" variant="primary" icon={Send} onClick={() => send(open, 'propose')}>Propose all</Button>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
