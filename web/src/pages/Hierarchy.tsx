import { memo, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowDown, Building2, Check, ChevronRight, Cog, GitFork, MapPin, Repeat2, Search, ShieldAlert, Sparkles, Tag, Unlink, X,
} from 'lucide-react';
import type { HierarchyIssue, HierarchyNode } from '@shared/types';
import { useApi, useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { num } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, Empty, Mono, PageHeader, ScriptedNote, SectionLabel, Segmented, Skeleton } from '@/components/ui';
import { AgentAvatar } from '@/components/agents';

interface HierarchyData { tree: HierarchyNode; maximo: { locations: number; assets: number; maxDepth: number }; issues: HierarchyIssue[] }

const kindIcon = { site: Building2, functional: MapPin, serial: Cog } as const;
const issueIcon: Record<HierarchyIssue['kind'], typeof Unlink> = { wrong_parent: ShieldAlert, orphan: Unlink, cycle: Repeat2, untyped: Tag };
const issueLabel: Record<HierarchyIssue['kind'], string> = { wrong_parent: 'Wrong parent type', orphan: 'Orphan', cycle: 'Loop', untyped: 'Untyped' };

interface Index { parent: Map<string, string>; node: Map<string, HierarchyNode>; withIssue: Set<string> }

function buildIndex(root: HierarchyNode): Index {
  const parent = new Map<string, string>();
  const node = new Map<string, HierarchyNode>();
  const withIssue = new Set<string>();
  const walk = (n: HierarchyNode): boolean => {
    node.set(n.id, n);
    let has = n.issues.length > 0;
    for (const c of n.children) { parent.set(c.id, n.id); if (walk(c)) has = true; }
    if (has) withIssue.add(n.id);
    return has;
  };
  walk(root);
  return { parent, node, withIssue };
}

const ancestors = (idx: Index, id: string) => {
  const out: string[] = [];
  let p = idx.parent.get(id);
  while (p) { out.push(p); p = idx.parent.get(p); }
  return out;
};

interface TreeProps {
  n: HierarchyNode; depth: number; expanded: Set<string>; toggle: (id: string) => void; visible: (n: HierarchyNode) => boolean;
  highlight: string | null; issuesById: Map<string, HierarchyIssue>; matches: Set<string>;
}

const TreeNode = memo(function TreeNode({ n, depth, expanded, toggle, visible, highlight, issuesById, matches }: TreeProps) {
  const Icon = kindIcon[n.kind];
  const open = expanded.has(n.id);
  const kids = n.children.filter(visible);
  const openIssues = n.issues.map((i) => issuesById.get(i)).filter((i): i is HierarchyIssue => !!i && i.status === 'open');
  const isHi = highlight === n.id;
  return (
    <div>
      <div data-node={n.id} style={{ paddingLeft: depth * 18 + 8 }}
        className={cx('group flex h-8 items-center gap-1.5 rounded-md pr-2 transition-colors', isHi ? 'bg-crit-soft ring-1 ring-crit/40' : matches.has(n.id) ? 'bg-accent-soft/60' : 'hover:bg-surface-2')}>
        <button onClick={() => kids.length && toggle(n.id)} className={cx('grid size-5 shrink-0 place-items-center rounded text-ink-4', kids.length ? 'hover:bg-sunken hover:text-ink' : 'invisible')} aria-label={open ? 'Collapse' : 'Expand'}>
          <ChevronRight className={cx('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <Icon className={cx('size-3.5 shrink-0', n.kind === 'site' ? 'text-ink-2' : n.kind === 'functional' ? 'text-accent' : 'text-agent')} />
        <span className={cx('truncate text-[12.5px]', n.kind === 'serial' ? 'text-ink-2' : 'font-medium text-ink')}>{n.label}</span>
        <Mono className="hidden shrink-0 text-[10.5px] text-ink-4 @2xl:inline">{n.id}</Mono>
        <span className="flex-1" />
        {n.classLabel && <span className={cx('hidden shrink-0 truncate text-[11px] @xl:inline', n.classLabel === 'Untyped' ? 'font-medium text-warn' : 'text-ink-3')}>{n.classLabel}</span>}
        {openIssues.length > 0 && (
          <span className="relative flex size-2 shrink-0" title={openIssues.map((i) => i.message).join('\n')}>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-crit opacity-50" />
            <span className="relative size-2 rounded-full bg-crit" />
          </span>
        )}
        {n.childCount > 0 && <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-ink-4">{n.childCount}</span>}
      </div>
      {open && kids.length > 0 && (
        <div className="relative">
          <span className="absolute bottom-1 top-0 w-px bg-line" style={{ left: depth * 18 + 17 }} />
          {kids.map((c) => <TreeNode key={c.id} n={c} depth={depth + 1} expanded={expanded} toggle={toggle} visible={visible} highlight={highlight} issuesById={issuesById} matches={matches} />)}
        </div>
      )}
    </div>
  );
});

function IssueCard({ i, onFocus, active }: { i: HierarchyIssue; onFocus: () => void; active: boolean }) {
  const { act, persona } = useApp();
  const Icon = issueIcon[i.kind];
  const decide = (decision: 'approve' | 'dismiss') =>
    act(() => api.post(`/hierarchy/issues/${i.id}`, { decision, actor: persona?.id }), decision === 'approve' ? `Fix approved for ${i.record}. It runs in the next transformation.` : `Dismissed ${i.id}`);
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      className={cx('rounded-xl border bg-surface p-3 transition', active ? 'border-crit/50 shadow-pop' : 'border-line hover:border-line-strong', i.status !== 'open' && 'opacity-60')}>
      <button onClick={onFocus} className="block w-full text-left">
        <div className="flex items-center gap-1.5">
          <Icon className={cx('size-3.5', i.kind === 'wrong_parent' ? 'text-crit' : 'text-warn')} />
          <span className="text-[12px] font-semibold">{issueLabel[i.kind]}</span>
          <Badge tone="neutral">{i.rule}</Badge>
          <Badge tone="neutral">{i.site}</Badge>
          {i.status === 'fix_approved' && <Badge tone="ok" icon={Check}>Fix approved</Badge>}
          {i.status === 'dismissed' && <Badge tone="neutral">Dismissed</Badge>}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{i.message}</p>
        <p className="mt-1 text-[12px] text-ink-3"><span className="font-medium text-ok">Proposed fix:</span> {i.proposedFix}</p>
      </button>
      {i.status === 'open' && (
        <div className="mt-2.5 flex gap-1.5">
          <Button size="sm" variant="ok" icon={Check} onClick={() => decide('approve')}>Approve fix</Button>
          <Button size="sm" variant="ghost" icon={X} onClick={() => decide('dismiss')}>Dismiss</Button>
        </div>
      )}
    </motion.div>
  );
}

export default function Hierarchy() {
  const { meta, ask } = useApp();
  const [site, setSite] = useState('RIVR');
  const { data } = useApi<HierarchyData>(`/hierarchy?site=${site}`);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [q, setQ] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<'open' | 'all'>('open');

  const idx = useMemo(() => (data ? buildIndex(data.tree) : null), [data]);
  const issuesById = useMemo(() => new Map((data?.issues ?? []).map((i) => [i.id, i])), [data]);

  // Initial expansion: two levels, plus every path that leads to an issue.
  const treeKey = data ? `${site}:${data.tree.childCount}` : '';
  useEffect(() => {
    if (!data || !idx) return;
    setExpanded((prev) => {
      if (prev.size && prev.has(data.tree.id)) return prev;
      const s = new Set<string>([data.tree.id, ...data.tree.children.map((c) => c.id)]);
      for (const [id, n] of idx.node) if (n.issues.some((x) => issuesById.get(x)?.status === 'open' && x !== 'HI-040')) ancestors(idx, id).forEach((a) => s.add(a));
      return s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeKey]);

  // Focus a node requested from the issue list (possibly after switching site).
  useEffect(() => {
    if (!pendingFocus || !idx) return;
    if (!idx.node.has(pendingFocus)) return;
    setExpanded((s) => new Set([...s, ...ancestors(idx, pendingFocus)]));
    setHighlight(pendingFocus);
    setPendingFocus(null);
    setTimeout(() => document.querySelector(`[data-node="${pendingFocus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }, [pendingFocus, idx]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !idx) return new Set<string>();
    const out = new Set<string>();
    for (const [id, n] of idx.node) if (`${id} ${n.label}`.toLowerCase().includes(t)) { out.add(id); if (out.size >= 60) break; }
    return out;
  }, [q, idx]);
  const matchAncestors = useMemo(() => {
    const s = new Set<string>();
    if (idx) for (const id of matches) { s.add(id); ancestors(idx, id).forEach((a) => s.add(a)); }
    return s;
  }, [matches, idx]);
  useEffect(() => { if (matchAncestors.size) setExpanded((e) => new Set([...e, ...matchAncestors])); }, [matchAncestors]);

  const visible = useMemo(() => (n: HierarchyNode) => (q.trim() ? matchAncestors.has(n.id) : !onlyIssues || !!idx?.withIssue.has(n.id)), [q, matchAncestors, onlyIssues, idx]);

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const focusIssue = (i: HierarchyIssue) => {
    if (i.kind === 'untyped') { setOnlyIssues(true); return; }
    if (i.site !== site && i.site !== 'All') { setSite(i.site); setExpanded(new Set()); }
    setPendingFocus(i.record);
  };

  const issues = (data?.issues ?? []).filter((i) => issueFilter === 'all' || i.status === 'open');
  const openCount = (data?.issues ?? []).filter((i) => i.status === 'open').length;
  const siteNodes = idx ? [...idx.node.values()] : [];
  const functional = siteNodes.filter((n) => n.kind === 'functional').length;
  const serial = siteNodes.filter((n) => n.kind === 'serial').length;

  return (
    <div className="@container">
      <PageHeader
        eyebrow={<><GitFork className="size-3.5" />Stage 5 · Hierarchy Agent <ScriptedNote className="ml-2" /></>}
        title="Hierarchy"
        description="Maximo keeps two hierarchies: locations for places and asset parents for equipment. IFS Cloud has one structure of functional and serial objects. The Hierarchy Agent rebuilds it using the ontology's allowed-parent rules."
        actions={<Segmented value={site} onChange={(s) => { setSite(s); setExpanded(new Set()); setHighlight(null); }} size="sm" options={(meta?.sites ?? []).map((s) => ({ id: s.id, label: s.id }))} />}
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-agent/25 bg-agent-soft/60 px-4 py-3">
        <AgentAvatar id="hierarchy" />
        <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
          <div className="font-semibold text-ink">Ontology rule SM-01: a pump is never placed under a valve.</div>
          <div className="text-ink-2">A centrifugal pump may sit under a pumping station or a process system. Never under a valve, meter or instrument. Pumps that break this rule are flagged, and the agent proposes moving them under their functional location.</div>
        </div>
        <Button size="sm" variant="ghost" icon={Sparkles} className="shrink-0 text-agent" onClick={() => ask('Why can a pump not sit under a valve?')}>Ask</Button>
      </div>

      {!data || !idx ? <Skeleton className="h-[480px]" /> : (
        <div className="grid items-start gap-4 @5xl:grid-cols-[220px_minmax(0,1fr)_340px] @3xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Maximo source */}
          <div className="space-y-3 @3xl:col-span-2 @5xl:col-span-1">
            <Card>
              <SectionLabel>Maximo · two hierarchies</SectionLabel>
              <div className="grid grid-cols-2 gap-3 @5xl:grid-cols-1">
                <div className="rounded-lg border border-line bg-surface-2 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-ink-3"><MapPin className="size-3.5 text-accent" />LOCATIONS / LOCHIERARCHY</div>
                  <div className="mt-1 text-lg font-semibold tabular">{num(data.maximo.locations)}</div>
                  <div className="text-[11px] text-ink-3">places · site → system → position</div>
                </div>
                <div className="rounded-lg border border-line bg-surface-2 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-ink-3"><Cog className="size-3.5 text-agent" />ASSET.PARENT</div>
                  <div className="mt-1 text-lg font-semibold tabular">{num(data.maximo.assets)}</div>
                  <div className="text-[11px] text-ink-3">equipment · pump → motor</div>
                </div>
              </div>
              <div className="my-3 flex justify-center"><ArrowDown className="size-4 text-ink-4" /></div>
              <div className="rounded-lg border border-accent-line bg-accent-soft p-2.5">
                <div className="text-xs font-medium text-accent">IFS Cloud · one structure</div>
                <div className="mt-1 flex gap-4 text-[12px] text-ink-2">
                  <span><b className="tabular text-ink">{num(functional)}</b> functional</span>
                  <span><b className="tabular text-ink">{num(serial)}</b> serial</span>
                </div>
                <div className="text-[11px] text-ink-3">depth {data.maximo.maxDepth} · names to be confirmed with IFS</div>
              </div>
            </Card>
          </div>

          {/* IFS tree */}
          <Card pad={false} className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <div className="flex h-7 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2">
                <Search className="size-3.5 text-ink-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find object id or name" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-4" />
                {q && <button onClick={() => setQ('')} aria-label="Clear"><X className="size-3.5 text-ink-4" /></button>}
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
                <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-[var(--accent)]" />
                Only branches with issues
              </label>
            </div>
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] text-ink-3">
              <span className="flex items-center gap-1"><MapPin className="size-3 text-accent" />Functional object</span>
              <span className="flex items-center gap-1"><Cog className="size-3 text-agent" />Serial object</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-crit" />Open issue</span>
              {q && <span className="ml-auto">{matches.size}{matches.size >= 60 ? '+' : ''} matches</span>}
            </div>
            <div className="max-h-[calc(100vh-300px)] min-h-[360px] overflow-auto py-1.5">
              {q && !matches.size ? <div className="p-6"><Empty icon={Search} title="No objects match">Try an asset number such as PU-10012.</Empty></div> : (
                <TreeNode n={data.tree} depth={0} expanded={expanded} toggle={toggle} visible={visible} highlight={highlight} issuesById={issuesById} matches={matches} />
              )}
            </div>
          </Card>

          {/* Issues */}
          <div className="min-w-0 space-y-2.5">
            <Card pad={false}>
              <div className="px-3 pt-3"><CardHeader title="Issues found" subtitle="Cycles, orphans and wrong parent types" icon={AlertTriangle} right={<Badge tone={openCount ? 'crit' : 'ok'}>{openCount} open</Badge>} /></div>
              <div className="px-3 pb-3"><Segmented size="sm" value={issueFilter} onChange={setIssueFilter} options={[{ id: 'open', label: 'Open' }, { id: 'all', label: 'All', count: data.issues.length }]} /></div>
            </Card>
            <div className="max-h-[calc(100vh-300px)] space-y-2.5 overflow-y-auto pr-0.5">
              <AnimatePresence initial={false}>
                {issues.map((i) => <IssueCard key={i.id} i={i} active={highlight === i.record} onFocus={() => focusIssue(i)} />)}
              </AnimatePresence>
              {!issues.length && <Empty icon={Check} title="No open hierarchy issues">The rebuilt hierarchy passes the ontology's allowed-parent rules.</Empty>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
