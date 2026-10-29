import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronsUpDown, FolderPlus, LayoutGrid, Lock } from 'lucide-react';
import { useApp } from '@/lib/app';
import { cx } from '@/components/ui';
import { navGroups } from './nav';

const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function ProjectSwitcher() {
  const { projects, projectId, setProjectId } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = projects?.find((p) => p.id === projectId);
  const go = (path: string) => { setOpen(false); nav(path); };
  return (
    <div className="relative mx-3 mb-2" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface p-2 text-left shadow-card transition hover:border-line-strong">
        <div className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-sky-500 to-emerald-500 text-[10px] font-bold text-white">{cur ? initials(cur.customer) : '…'}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium">{cur?.name ?? (projects?.length === 0 ? 'No projects' : 'Loading…')}</div>
          <div className="truncate text-[11px] text-ink-3">{cur ? `${cur.mode === 'preview' ? 'Preview' : 'Delivery'} · ${cur.region}` : ''}</div>
        </div>
        <ChevronsUpDown className="size-3.5 text-ink-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute inset-x-0 top-full z-50 mt-1 w-[280px] rounded-xl border border-line bg-surface p-1.5 shadow-pop" role="menu">
            <div className="max-h-72 overflow-y-auto">
              {projects?.map((p) => (
                <button key={p.id} role="menuitem" onClick={() => { setProjectId(p.id); go('/'); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sunken">
                  <div className="grid size-6 shrink-0 place-items-center rounded bg-gradient-to-br from-sky-500 to-emerald-500 text-[9px] font-bold text-white">{initials(p.customer)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{p.name}</div>
                    <div className="truncate text-[11px] text-ink-3">{p.mode === 'preview' ? 'Preview' : 'Delivery'} · {p.status}</div>
                  </div>
                  {p.id === projectId && <Check className="size-3.5 text-accent" />}
                </button>
              ))}
            </div>
            <div className="mt-1 border-t border-line pt-1">
              <button role="menuitem" onClick={() => go('/projects')} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-sunken"><LayoutGrid className="size-3.5" />All projects</button>
              <button role="menuitem" onClick={() => go('/projects/new')} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-sunken"><FolderPlus className="size-3.5" />New project</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const { dashboard } = useApp();
  const k = dashboard?.kpis;
  const badges = {
    review: k ? k.pendingReview : 0,
    quality: k ? k.fixesPending : 0,
    validation: 0,
  };
  return (
    <aside className="no-print flex w-[232px] shrink-0 flex-col border-r border-line bg-surface-2">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <img src="/favicon.svg" className="size-7" alt="" />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Asset Migration Studio</div>
          <div className="text-[10.5px] text-ink-3">Astra Data Factory</div>
        </div>
      </div>

      <ProjectSwitcher />

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        {navGroups.map((g) => (
          <div key={g.label} className="mt-3">
            {g.label && <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">{g.label}</div>}
            {g.items.map((it) => {
              const stage = it.stage ? dashboard?.stages.find((s) => s.n === it.stage) : undefined;
              const count = it.badge ? badges[it.badge] : 0;
              return (
                <NavLink key={it.to} to={it.to} end={it.to === '/'}
                  className={({ isActive }) => cx('group relative flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors', isActive ? 'bg-surface font-medium text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:bg-sunken hover:text-ink')}
                  title={it.hint}>
                  <it.icon className="size-4 shrink-0 text-ink-3 group-[.active]:text-accent" strokeWidth={1.9} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {stage?.status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-agent" />}
                  {stage?.status === 'locked' && <Lock className="size-3 text-ink-4" />}
                  {count > 0 && <span className="rounded-md bg-accent-soft px-1.5 text-[11px] font-semibold tabular text-accent">{count}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3 text-[11px] leading-relaxed text-ink-3">
        <div className="flex items-center justify-between"><span>Ontology</span><span className="font-mono text-ink-2">{dashboard?.project.ontologyVersion}</span></div>
        <div className="flex items-center justify-between"><span>Target</span><span className="text-ink-2">IFS Cloud sandbox</span></div>
      </div>
    </aside>
  );
}
