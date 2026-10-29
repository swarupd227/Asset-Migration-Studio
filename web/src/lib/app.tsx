import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentDef, AgentEvent, Dashboard, Person, Rule, Site } from '@shared/types';
import { api, ApiError } from './api';

export interface Meta {
  agents: AgentDef[];
  people: Person[];
  sites: Site[];
  rules: Rule[];
  liveModel: boolean;
  model: string;
  ontologyVersion: string;
  industryPack: string;
}

export type DashboardData = Dashboard & { running: number | null; version: number };

interface Toast { id: number; kind: 'ok' | 'error' | 'info'; text: string }

interface AppState {
  meta: Meta | null;
  dashboard: DashboardData | null;
  version: number;
  events: AgentEvent[];
  activeAgents: Set<string>;
  persona: Person | null;
  setPersona: (id: string) => void;
  dockOpen: boolean;
  setDockOpen: (o: boolean) => void;
  dockTab: 'activity' | 'ask';
  setDockTab: (t: 'activity' | 'ask') => void;
  assistantContext: { itemId?: string; label?: string };
  setAssistantContext: (c: { itemId?: string; label?: string }) => void;
  ask: (question: string, ctx?: { itemId?: string; label?: string }) => void;
  pendingQuestion: string | null;
  consumeQuestion: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  runStage: (n: number) => Promise<void>;
  act: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [version, setVersion] = useState(0);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [personaId, setPersonaId] = useState<string>(() => localStorage.getItem('ams-persona') ?? 'u-dev');
  // The dock starts open on wide screens only; after that the user's choice is remembered.
  const [dockOpen, setDockOpenState] = useState(() => {
    const saved = localStorage.getItem('ams-dock');
    return saved ? saved === 'open' : window.innerWidth >= 1440;
  });
  const [dockTab, setDockTab] = useState<'activity' | 'ask'>('activity');
  const [assistantContext, setAssistantContext] = useState<{ itemId?: string; label?: string }>({});
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const activeTimers = useRef(new Map<string, number>());

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const loadMeta = useCallback(() => {
    api.get<Meta>('/meta').then(setMeta).catch(() => toast('Cannot reach the API. Is the server running on :8791?', 'error'));
  }, [toast]);
  useEffect(loadMeta, [loadMeta]);

  useEffect(() => {
    api.get<DashboardData>('/dashboard').then(setDashboard).catch(() => {});
  }, [version]);

  // Live stream of agent activity and state changes.
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: number | undefined;
    const connect = () => {
      es = new EventSource('/api/stream');
      // `version` is a local counter: it bumps on every server change and on every (re)connect,
      // so views refetch even after the API restarts and its own version starts again at 1.
      es.addEventListener('hello', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        setEvents(d.events);
        setVersion((v) => v + 1);
        loadMeta();
      });
      es.addEventListener('state', () => setVersion((v) => v + 1));
      es.addEventListener('agent', (e) => {
        const ev: AgentEvent = JSON.parse((e as MessageEvent).data);
        setEvents((xs) => [...xs.slice(-199), ev]);
        setActiveAgents((s) => new Set(s).add(ev.agent));
        const prev = activeTimers.current.get(ev.agent);
        if (prev) clearTimeout(prev);
        activeTimers.current.set(ev.agent, window.setTimeout(() => setActiveAgents((s) => { const n = new Set(s); n.delete(ev.agent); return n; }), 3500));
        if (ev.kind === 'needs_human') toast(ev.text, 'info');
      });
      es.onerror = () => {
        es?.close();
        retry = window.setTimeout(connect, 2000);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [toast, loadMeta]);

  const persona = meta?.people.find((p) => p.id === personaId) ?? null;
  const setPersona = useCallback((id: string) => { setPersonaId(id); localStorage.setItem('ams-persona', id); }, []);
  const setDockOpen = useCallback((o: boolean) => { setDockOpenState(o); localStorage.setItem('ams-dock', o ? 'open' : 'closed'); }, []);

  const ask = useCallback((question: string, ctx?: { itemId?: string; label?: string }) => {
    if (ctx) setAssistantContext(ctx);
    setDockOpen(true);
    setDockTab('ask');
    setPendingQuestion(question);
  }, [setDockOpen]);

  const act = useCallback(async <T,>(fn: () => Promise<T>, okText?: string) => {
    try {
      const r = await fn();
      if (okText) toast(okText);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
      return undefined;
    }
  }, [toast]);

  const runStage = useCallback(async (n: number) => {
    setDockOpen(true);
    setDockTab('activity');
    await act(() => api.post(`/stages/${n}/run`, { actor: personaId }));
  }, [act, personaId, setDockOpen]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('ams-theme', next);
      return next;
    });
  }, []);

  const value = useMemo<AppState>(() => ({
    meta, dashboard, version, events, activeAgents, persona, setPersona, dockOpen, setDockOpen, dockTab, setDockTab,
    assistantContext, setAssistantContext, ask, pendingQuestion, consumeQuestion: () => setPendingQuestion(null),
    paletteOpen, setPaletteOpen, toast, toasts, runStage, act, theme, toggleTheme,
  }), [meta, dashboard, version, events, activeAgents, persona, setPersona, dockOpen, setDockOpen, dockTab, assistantContext, ask, pendingQuestion, paletteOpen, toast, toasts, runStage, act, theme, toggleTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

/** Fetches a resource and refetches whenever server state changes (via the live stream). */
export function useApi<T>(path: string | null): { data: T | undefined; loading: boolean; reload: () => void } {
  const { version } = useApp();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api.get<T>(path).then((d) => { if (alive) { setData(d); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [path, version, nonce]);
  return { data, loading, reload: () => setNonce((n) => n + 1) };
}

/** Register the item the user is looking at, so the Review Assistant answers about it. */
export function useAssistantFocus(itemId?: string, label?: string) {
  const { setAssistantContext } = useApp();
  useEffect(() => {
    setAssistantContext({ itemId, label });
  }, [itemId, label, setAssistantContext]);
}
