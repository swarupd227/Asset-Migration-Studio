import { z } from 'zod';
import type { Concept, EnhancementItem } from '../types.js';
import { relationTypes } from '../data/ontology.js';
import { effectiveProperties, effectiveRelations, failureCode, indexOf, itemKey, norm } from './graph.js';

// Validation of suggested additions, from the model or from a client. Each item is checked on its own,
// so one bad item never discards the rest; anything that does not fit the ontology is dropped.

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const rationale = z.string().trim().max(400).default('');
const relationTypeIds = relationTypes.map((t) => t.id) as [string, ...string[]];
export const cardinalitySchema = z.enum(['1', '0..1', '0..*', '1..*']);

export const itemInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('synonym'), value: z.string().trim().min(2).max(60), system: z.enum(['general', 'maximo', 'sap', 'ifs']).default('general'), rationale }),
  z.object({
    kind: z.literal('property'), rationale,
    property: z.object({
      name: z.string().trim().min(2).max(60), datatype: z.enum(['number', 'text', 'code', 'date', 'boolean']),
      unit: z.preprocess(blankToUndefined, z.string().trim().max(24).optional()),
      range: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
      definition: z.preprocess(blankToUndefined, z.string().trim().max(240).optional()),
    }),
  }),
  z.object({ kind: z.literal('failureMode'), value: z.string().trim().min(3).max(80), rationale }),
  z.object({
    kind: z.literal('relation'), rationale,
    relation: z.object({ type: z.enum(relationTypeIds), target: z.string().trim().min(3).max(80), cardinality: z.preprocess(blankToUndefined, cardinalitySchema.optional()) }),
  }),
]);

/** Shape of the model's structured output. */
export const modelOutputSchema = z.object({
  summary: z.string().max(1200).default(''),
  synonyms: z.array(z.unknown()).max(40).default([]),
  properties: z.array(z.unknown()).max(40).default([]),
  failureModes: z.array(z.unknown()).max(40).default([]),
  relations: z.array(z.unknown()).max(40).default([]),
});

/** Flattens model output into item inputs (not yet validated). */
export function itemsFromModel(out: z.infer<typeof modelOutputSchema>): unknown[] {
  const tag = (kind: string, list: unknown[]) => list.map((x) => (x && typeof x === 'object' ? { ...(x as object), kind } : x));
  return [
    ...tag('synonym', out.synonyms),
    ...out.properties.map((x) => {
      if (!x || typeof x !== 'object') return x;
      const { rationale: r, ...property } = x as Record<string, unknown>;
      return { kind: 'property', rationale: r, property };
    }),
    ...tag('failureMode', out.failureModes),
    ...out.relations.map((x) => {
      if (!x || typeof x !== 'object') return x;
      const { rationale: r, ...relation } = x as Record<string, unknown>;
      return { kind: 'relation', rationale: r, relation };
    }),
  ];
}

/**
 * Keeps only additions that are new and well formed for this concept: relationships must point to an
 * existing concept other than itself (subtype links are not proposed this way), synonyms must not repeat
 * an existing label or synonym, properties must not repeat an own or inherited property, failure modes
 * carry an ISO 14224 style code that the concept does not already have.
 */
export function screenItems(conceptId: string, raw: unknown[], concepts: Concept[]): { items: EnhancementItem[]; dropped: number } {
  const byId = indexOf(concepts);
  const c = byId.get(conceptId);
  if (!c) return { items: [], dropped: raw.length };
  const otherLabels = new Set(concepts.filter((x) => x.id !== conceptId).map((x) => norm(x.label)));
  const names = new Set([c.label, ...c.synonyms].map(norm));
  const props = new Set(effectiveProperties(c, byId).map((p) => norm(p.property.name)));
  const fmCodes = new Set(c.failureModes.map(failureCode).filter(Boolean));
  const fmTexts = new Set(c.failureModes.map(norm));
  const rels = new Set(effectiveRelations(c, byId).map((r) => `${r.relation.type}>${r.relation.target}`));
  const seen = new Set<string>();
  const items: EnhancementItem[] = [];
  let dropped = 0;
  for (const r of raw) {
    const p = itemInputSchema.safeParse(r);
    if (!p.success) { dropped++; continue; }
    const v = p.data;
    let ok = false;
    if (v.kind === 'synonym') ok = !names.has(norm(v.value)) && !otherLabels.has(norm(v.value));
    if (v.kind === 'property') ok = !props.has(norm(v.property.name));
    if (v.kind === 'failureMode') { const code = failureCode(v.value); ok = !!code && !fmCodes.has(code) && !fmTexts.has(norm(v.value)); }
    if (v.kind === 'relation') {
      const t = v.relation.type;
      ok = t !== 'isA' && t !== 'hasSubtype' && v.relation.target !== conceptId && byId.has(v.relation.target) && !rels.has(`${t}>${v.relation.target}`);
    }
    const item = { ...v, key: '' } as EnhancementItem;
    item.key = itemKey(conceptId, item);
    if (!ok || seen.has(item.key)) { dropped++; continue; }
    seen.add(item.key);
    items.push(item);
  }
  return { items, dropped };
}
