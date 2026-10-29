import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Moon, PanelRight, Search, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '@/lib/app';
import { cx, Kbd } from '@/components/ui';
import { PersonAvatar } from '@/components/agents';
import { allNav } from './nav';

function Pipeline() {
  const { dashboard } = useApp();
  const nav = useNavigate();
  if (!dashboard) return null;
  const done = dashboard.stages.filter((s) => s.status === 'done').length;
  return (
    <button onClick={() => nav('/')} className="hidden items-center gap-2.5 rounded-lg px-2 py-1 transition hover:bg-sunken lg:flex" title="Migration stages">
      <div className="flex gap-[3px]">
        {dashboard.stages.map((s) => (
          <span key={s.n} title={`${s.n}. ${s.name} · ${s.status}`}
            className={cx('h-4 w-1.5 rounded-sm', s.status === 'done' ? 'bg-ok' : s.status === 'running' ? 'animate-pulse bg-agent' : s.status === 'waiting' ? 'bg-warn' : s.status === 'ready' ? 'bg-accent' : 'bg-line-strong')} />
        ))}
      </div>
      <span className="whitespace-nowrap text-xs text-ink-3"><span className="font-medium text-ink-2 tabular">{done}</span>/14</span>
    </button>
  );
}

function PersonaMenu() {
  const { meta, persona, setPersona, toast } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!persona || !meta) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-sunken" aria-haspopup="menu">
        <PersonAvatar initials={persona.initials} size="sm" />
        <div className="hidden whitespace-nowrap text-left leading-tight 2xl:block">
          <div className="text-[12.5px] font-medium">{persona.name}</div>
          <div className="text-[10.5px] text-ink-3">{persona.role}</div>
        </div>
        <ChevronDown className="size-3.5 text-ink-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-pop" role="menu">
            <div className="px-2.5 pb-1.5 pt-1 text-[11px] text-ink-3">Switch user</div>
            {meta.people.map((p) => (
              <button key={p.id} role="menuitem" onClick={() => { setPersona(p.id); setOpen(false); toast(`Acting as ${p.name} · ${p.role}`, 'info'); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sunken">
                <PersonAvatar initials={p.initials} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{p.name}</div>
                  <div className="truncate text-[11px] text-ink-3">{p.role} · {p.org}</div>
                </div>
                {p.id === persona.id && <Check className="size-4 text-accent" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Topbar() {
  const { setPaletteOpen, dockOpen, setDockOpen, theme, toggleTheme, meta, dashboard } = useApp();
  const loc = useLocation();
  const current = allNav.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="truncate text-ink-3">{dashboard?.project.customer}</span>
          <span className="text-ink-4">/</span>
          <span className="truncate font-medium">{current?.label ?? 'Asset Migration Studio'}</span>
        </div>
      </div>
      <Pipeline />
      <button onClick={() => setPaletteOpen(true)}
        className="flex h-8 w-44 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-[12.5px] text-ink-3 transition hover:border-line-strong">
        <Search className="size-3.5" />
        <span className="flex-1 truncate text-left">Search or ask…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
            <button onClick={toggleTheme} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <button onClick={() => setDockOpen(!dockOpen)} className={cx('grid size-8 place-items-center rounded-lg hover:bg-sunken', dockOpen ? 'text-agent' : 'text-ink-3')} aria-label="Toggle agent panel">
        <PanelRight className="size-4" />
      </button>
      <div className="h-6 w-px bg-line" />
      <PersonaMenu />
    </header>
  );
}
