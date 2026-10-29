import { createHash } from 'node:crypto';
import type { Concept, ConceptProperty, ConceptRelation, EnhancementItem, RelationType } from '../types.js';
import { linkConcepts, relationTypeById } from '../data/ontology.js';

// Pure helpers over the concept graph: inheritance, item identity and applying accepted extensions.

export type ConceptIndex = Map<string, Concept>;
export const indexOf = (list: Concept[]): ConceptIndex => new Map(list.map((c) => [c.id, c]));

/** Parent chain, nearest first. Stops on a cycle. */
export function ancestorsOf(id: string, byId: ConceptIndex): Concept[] {
  const out: Concept[] = [];
  const seen = new Set([id]);
  let p = byId.get(id)?.parent;
  while (p && !seen.has(p) && byId.has(p)) {
    seen.add(p);
    out.push(byId.get(p)!);
    p = byId.get(p)!.parent;
  }
  return out;
}

/** Own and inherited properties; own ones win on name. */
export function effectiveProperties(c: Concept, byId: ConceptIndex): { property: ConceptProperty; from: string }[] {
  const out = new Map<string, { property: ConceptProperty; from: string }>();
  for (const x of [c, ...ancestorsOf(c.id, byId)]) {
    for (const p of x.properties ?? []) if (!out.has(p.name.toLowerCase())) out.set(p.name.toLowerCase(), { property: p, from: x.id });
  }
  return [...out.values()];
}

/** Own and inherited relationships (subtype links are not inherited). */
export function effectiveRelations(c: Concept, byId: ConceptIndex): { relation: ConceptRelation; from: string }[] {
  const out: { relation: ConceptRelation; from: string }[] = [...(c.relations ?? []).map((r) => ({ relation: r, from: c.id }))];
  for (const a of ancestorsOf(c.id, byId)) {
    for (const r of a.relations ?? []) {
      if (r.type === 'isA' || r.type === 'hasSubtype') continue;
      if (!out.some((x) => x.relation.type === r.type && x.relation.target === r.target)) out.push({ relation: r, from: a.id });
    }
  }
  return out;
}

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const failureCode = (s: string) => s.match(/\(([A-Z]{2,4})\)\s*$/)?.[1];

/** Stable identity of a suggested addition, so the same addition is never proposed twice. */
export function itemKey(conceptId: string, item: Pick<EnhancementItem, 'kind' | 'value' | 'property' | 'relation'>): string {
  const body = item.kind === 'property' ? norm(item.property?.name ?? '')
    : item.kind === 'relation' ? `${item.relation?.type}>${item.relation?.target}`
    : norm(item.value ?? '');
  return createHash('sha1').update(`${conceptId}|${item.kind}|${body}`).digest('hex').slice(0, 12);
}

export const relationLabel = (t: RelationType) => relationTypeById.get(t)?.label ?? t;

/** One line describing the change, as it appears in proposals and the change log. */
export function describeItem(conceptId: string, item: EnhancementItem, byId: ConceptIndex): string {
  const label = byId.get(conceptId)?.label ?? conceptId;
  const system = { maximo: 'IBM Maximo', sap: 'SAP PM', ifs: 'IFS Cloud', general: '' }[item.system ?? 'general'];
  switch (item.kind) {
    case 'synonym': return `Add synonym "${item.value}"${system ? ` (${system} term)` : ''} to ${label}`;
    case 'failureMode': return `Add failure mode "${item.value}" to ${label}`;
    case 'property': return `Add property "${item.property!.name}"${item.property!.unit ? ` (${item.property!.unit})` : ''} to ${label}`;
    case 'relation': return `Add relationship: ${label} ${relationLabel(item.relation!.type)} ${byId.get(item.relation!.target)?.label ?? item.relation!.target}${item.relation!.cardinality ? ` [${item.relation!.cardinality}]` : ''}`;
  }
}

/** Applies accepted extensions to a copy of the release concepts. The release objects are never changed. */
export function applyExtensions(base: Concept[], extensions: { conceptId: string; item: EnhancementItem }[]): Concept[] {
  const list = structuredClone(base);
  const byId = indexOf(list);
  const props: Record<string, ConceptProperty[]> = {};
  const rels: [string, RelationType, string, ConceptRelation['cardinality']?][] = [];
  for (const { conceptId, item } of extensions) {
    const c = byId.get(conceptId);
    if (!c) continue;
    if (item.kind === 'synonym' && item.value && !c.synonyms.some((s) => norm(s) === norm(item.value!))) c.synonyms = [...c.synonyms, item.value];
    if (item.kind === 'failureMode' && item.value && !c.failureModes.some((s) => norm(s) === norm(item.value!))) c.failureModes = [...c.failureModes, item.value];
    if (item.kind === 'property' && item.property) (props[conceptId] ??= []).push({ ...item.property, origin: 'extension' });
    if (item.kind === 'relation' && item.relation && byId.has(item.relation.target)) rels.push([conceptId, item.relation.type, item.relation.target, item.relation.cardinality]);
  }
  linkConcepts(list, rels, props, 'extension');
  return list;
}
