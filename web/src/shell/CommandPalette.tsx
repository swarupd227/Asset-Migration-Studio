import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CornerDownLeft, Moon, Play, Search, Sparkles, UserRound, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Mapping } from '@shared/types';
import { useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { cx, Kbd } from '@/components/ui';
import { allNav } from './nav';

interface Cmd { id: string; group: string; label: string; hint?: string; icon: LucideIcon; run: () => void }

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, dashboard, runStage, ask, meta, setPersona, toggleTheme, setDockOpen, dockOpen } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!paletteOpen); }
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if (!typing && e.key === '.' && !paletteOpen) setDockOpen(!dockOpen);
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen, dockOpen, setDockOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQ(''); setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
      api.get<Mapping[]>('/mappings').then(setMappings).catch(() => {});
    }
  }, [paletteOpen]);

  const cmds = useMemo<Cmd[]>(() => {
    const close = (fn: () => void) => () => { setPaletteOpen(false); fn(); };
    const list: Cmd[] = allNav.map((n) => ({ id: `nav-${n.to}`, group: 'Go to', label: n.label, hint: n.hint, icon: n.icon, run: close(() => nav(n.to)) }));
    for (const s of dashboard?.stages ?? []) {
      if (s.status !== 'locked' && s.n !== 12) list.push({ id: `run-${s.n}`, group: 'Run agents', label: `Run stage ${s.n} · ${s.name}`, hint: s.summary, icon: s.n >= 8 && s.n <= 11 ? Workflow : Play, run: close(() => runStage(s.n)) });
    }
    for (const m of mappings) list.push({ id: `m-${m.id}`, group: 'Mappings', label: `${m.id} · ${m.sourceElements.join(' + ')}`, hint: `→ ${m.conceptLabel} → ${m.target}`, icon: Search, run: close(() => nav(`/review?item=${m.id}`)) });
    for (const p of meta?.people ?? []) list.push({ id: `p-${p.id}`, group: 'Switch user', label: `${p.name}`, hint: p.role, icon: UserRound, run: close(() => setPersona(p.id)) });
    list.push({ id: 'theme', group: 'Settings', label: 'Toggle light / dark theme', icon: Moon, run: close(toggleTheme) });
    return list;
  }, [dashboard, mappings, meta, nav, runStage, setPaletteOpen, setPersona, toggleTheme]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = t ? cmds.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(t)) : cmds.filter((c) => c.group !== 'Mappings' && c.group !== 'Switch user');
    const askCmd: Cmd[] = t ? [{ id: 'ask', group: 'Ask the Review Assistant', label: q, hint: 'Grounded in this project’s evidence', icon: Sparkles, run: () => { setPaletteOpen(false); ask(q); } }] : [];
    return [...askCmd, ...hits].slice(0, 40);
  }, [q, cmds, ask, setPaletteOpen]);

  useEffect(() => { setSel(0); }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === 'Enter') filtered[sel]?.run();
  };

  let lastGroup = '';
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/25 pt-[12vh] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setPaletteOpen(false)}>
          <motion.div initial={{ scale: 0.97, y: -8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: -8 }} transition={{ duration: 0.14 }}
            className="w-[640px] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 text-ink-3" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Go to a screen, run a stage, find a mapping, or ask a question…"
                className="h-13 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-4" />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-1.5">
              {filtered.map((c, i) => {
                const header = c.group !== lastGroup ? (lastGroup = c.group) : null;
                return (
                  <div key={c.id}>
                    {header && <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">{header}</div>}
                    <button onMouseEnter={() => setSel(i)} onClick={c.run}
                      className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', sel === i ? 'bg-sunken' : '')}>
                      <c.icon className={cx('size-4 shrink-0', c.id === 'ask' ? 'text-agent' : 'text-ink-3')} />
                      <span className="truncate text-[13px] font-medium">{c.label}</span>
                      {c.hint && <span className="truncate text-xs text-ink-3">{c.hint}</span>}
                      {sel === i && <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-ink-4" />}
                    </button>
                  </div>
                );
              })}
              {!filtered.length && <div className="px-3 py-8 text-center text-sm text-ink-3">No matches</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
