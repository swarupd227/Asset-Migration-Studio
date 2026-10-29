import type { Concept, ConceptProperty, ConceptRelation, RelationType, RelationTypeDef } from '@shared/types';
import type { Tone } from '@/lib/format';

// Client-side helpers over the served concept graph: inheritance and relationship families.

export type ConceptIndex = Map<string, Concept>;

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

export function effectiveProperties(c: Concept, byId: ConceptIndex): { property: ConceptProperty; from: Concept }[] {
  const out = new Map<string, { property: ConceptProperty; from: Concept }>();
  for (const x of [c, ...ancestorsOf(c.id, byId)]) for (const p of x.properties ?? []) if (!out.has(p.name.toLowerCase())) out.set(p.name.toLowerCase(), { property: p, from: x });
  return [...out.values()];
}

export function effectiveRelations(c: Concept, byId: ConceptIndex): { relation: ConceptRelation; from: Concept }[] {
  const out = (c.relations ?? []).map((r) => ({ relation: r, from: c }));
  for (const a of ancestorsOf(c.id, byId)) for (const r of a.relations ?? []) {
    if (r.type === 'isA' || r.type === 'hasSubtype') continue;
    if (!out.some((x) => x.relation.type === r.type && x.relation.target === r.target)) out.push({ relation: r, from: a });
  }
  return out;
}

/** Families group relationship types for colour and ordering. */
export const relationFamily: Record<RelationType, { family: string; tone: Tone; color: string; order: number }> = (() => {
  const f = (family: string, tone: Tone, color: string, order: number) => ({ family, tone, color, order });
  const structure = f('Structure', 'accent', 'var(--accent)', 0);
  const place = f('Place', 'info', 'var(--info)', 1);
  const flow = f('Power and flow', 'agent', 'var(--agent)', 2);
  const guard = f('Protection and control', 'warn', 'var(--warn)', 3);
  const sense = f('Measurement', 'ok', 'var(--ok)', 4);
  const care = f('Maintenance and records', 'neutral', 'var(--ink-4)', 5);
  return {
    isA: structure, hasSubtype: structure, partOf: structure, hasPart: structure,
    locatedIn: place, contains: place,
    drives: flow, drivenBy: flow, feeds: flow, fedBy: flow, supports: flow, supportedBy: flow, connectedTo: flow,
    protects: guard, protectedBy: guard, controls: guard, controlledBy: guard,
    measures: sense, measuredBy: sense, monitors: sense, monitoredBy: sense,
    maintains: care, maintainedBy: care, requires: care, requiredBy: care, describes: care, describedBy: care,
  };
})();

export const typeIndex = (types: RelationTypeDef[]) => new Map(types.map((t) => [t.id, t]));
