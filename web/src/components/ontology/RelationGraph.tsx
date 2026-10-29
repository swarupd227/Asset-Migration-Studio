import { useMemo } from 'react';
import type { Concept, RelationType, RelationTypeDef } from '@shared/types';
import { effectiveRelations, relationFamily, type ConceptIndex } from './graph';

// Neighbourhood view of one concept: the concept in the middle, related concepts around it, one edge
// per related concept labelled with the relationship. Inherited relationships are dashed.

const W = 680;
const H = 400;
const NODE_W = 150;
const NODE_H = 30;
const MAX = 14;

const clip = (s: string, n = 21) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function RelationGraph({ c, byId, types, onSelect }: { c: Concept; byId: ConceptIndex; types: Map<RelationType, RelationTypeDef>; onSelect: (id: string) => void }) {
  const { nodes, hidden } = useMemo(() => {
    const byTarget = new Map<string, { target: Concept; types: RelationType[]; inherited: boolean; extension: boolean }>();
    for (const { relation: r, from } of effectiveRelations(c, byId)) {
      const target = byId.get(r.target);
      if (!target) continue;
      const e = byTarget.get(r.target) ?? { target, types: [], inherited: from.id !== c.id, extension: false };
      if (!e.types.includes(r.type)) e.types.push(r.type);
      e.inherited &&= from.id !== c.id;
      e.extension ||= r.origin === 'extension';
      byTarget.set(r.target, e);
    }
    const list = [...byTarget.values()].sort((a, b) =>
      Number(a.inherited) - Number(b.inherited) || relationFamily[a.types[0]].order - relationFamily[b.types[0]].order || a.target.label.localeCompare(b.target.label));
    const shown = list.slice(0, MAX).sort((a, b) => relationFamily[a.types[0]].order - relationFamily[b.types[0]].order);
    // Two columns either side of the concept, so labels never collide.
    const left = Math.ceil(shown.length / 2);
    const placed = shown.map((x, i) => {
      const side = i < left ? 0 : 1;
      const k = side ? i - left : i;
      const count = side ? shown.length - left : left;
      return { ...x, x: side ? W - NODE_W / 2 - 4 : NODE_W / 2 + 4, y: ((k + 0.5) * H) / count };
    });
    return { nodes: placed, hidden: list.length - shown.length };
  }, [c, byId]);

  if (!nodes.length) return <p className="text-xs text-ink-3">No relationships recorded for this concept yet.</p>;
  const cx = W / 2;
  const cy = H / 2;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Relationships of ${c.label}`}>
        {nodes.map((n) => {
          const f = relationFamily[n.types[0]];
          const mx = cx + (n.x - cx) * 0.52;
          const my = cy + (n.y - cy) * 0.52;
          const label = `${types.get(n.types[0])?.label ?? n.types[0]}${n.types.length > 1 ? ` +${n.types.length - 1}` : ''}`;
          return (
            <g key={`e-${n.target.id}`}>
              <line x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={f.color} strokeWidth={n.extension ? 2 : 1.4} strokeDasharray={n.inherited ? '4 4' : undefined} opacity={0.75} />
              <rect x={mx - label.length * 2.9 - 5} y={my - 8} width={label.length * 5.8 + 10} height={16} rx={4} fill="var(--surface)" stroke="var(--line)" />
              <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{label}</text>
            </g>
          );
        })}
        <g>
          <rect x={cx - 92} y={cy - 19} width={184} height={38} rx={10} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.5} />
          <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--accent)">{clip(c.label, 26)}</text>
        </g>
        {nodes.map((n) => {
          const f = relationFamily[n.types[0]];
          return (
            <g key={`n-${n.target.id}`} role="button" tabIndex={0} className="cursor-pointer focus:outline-none" onClick={() => onSelect(n.target.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.target.id); } }}>
              <title>{`${n.types.map((t) => types.get(t)?.label ?? t).join(', ')} ${n.target.label}${n.inherited ? ' (inherited)' : ''}`}</title>
              <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} fill="var(--surface)" stroke={f.color} strokeWidth={1.2} className="transition hover:brightness-95" />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11.5} fill="var(--ink)">{clip(n.target.label)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
        {[...new Map(Object.values(relationFamily).map((f) => [f.family, f])).values()].sort((a, b) => a.order - b.order).map((f) => (
          <span key={f.family} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: f.color }} />{f.family}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-ink-4" />Inherited</span>
        {hidden > 0 && <span className="ml-auto">{hidden} more in the list</span>}
      </div>
    </div>
  );
}
