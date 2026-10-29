import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, CircleAlert, Hand, Radio, Sparkles, Square, Wrench, X } from 'lucide-react';
import type { AgentEvent } from '@shared/types';
import { useApp } from '@/lib/app';
import { streamAssistant } from '@/lib/api';
import { clock } from '@/lib/format';
import { cx, Kbd } from '@/components/ui';
import { AgentAvatar, agentName } from '@/components/agents';
import { Markdown } from '@/components/Markdown';

const kindStyle: Record<AgentEvent['kind'], { label: string; cls: string }> = {
  plan: { label: 'Plan', cls: 'text-accent' },
  thought: { label: 'Reasoning', cls: 'text-agent' },
  tool: { label: 'Tool call', cls: 'text-info' },
  result: { label: 'Result', cls: 'text-ok' },
  handoff: { label: 'Hand-off', cls: 'text-accent' },
  needs_human: { label: 'Needs a person', cls: 'text-warn' },
  done: { label: 'Done', cls: 'text-ok' },
  error: { label: 'Error', cls: 'text-crit' },
};

function EventRow({ e }: { e: AgentEvent }) {
  const k = kindStyle[e.kind];
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cx('flex gap-2.5 rounded-lg px-2 py-2', e.kind === 'needs_human' && 'bg-warn-soft')}>
      <AgentAvatar id={e.agent} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-semibold text-ink">{agentName[e.agent] ?? e.agent}</span>
          <span className={cx('font-medium', k.cls)}>{k.label}</span>
          {e.stage && <span className="text-ink-4">· stage {e.stage}</span>}
          <span className="ml-auto font-mono text-[10px] text-ink-4">{clock(e.ts)}</span>
        </div>
        {e.tool && (
          <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
            <Wrench className="size-3 shrink-0 text-info" />
            <span className="truncate">{e.tool}({e.args ?? ''})</span>
            {e.ms && <span className="text-ink-4">· {e.ms}ms</span>}
          </div>
        )}
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
          {e.kind === 'needs_human' && <Hand className="mr-1 inline size-3.5 text-warn" />}
          {e.kind === 'error' && <CircleAlert className="mr-1 inline size-3.5 text-crit" />}
          {e.text}
        </div>
      </div>
    </motion.div>
  );
}

function Activity() {
  const { events, dashboard } = useApp();
  const end = useRef<HTMLDivElement>(null);
  const running = dashboard?.running ? dashboard.stages.find((s) => s.n === dashboard.running) : null;
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [events.length]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {running && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-agent/30 bg-agent-soft px-3 py-2">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-agent opacity-60" /><span className="relative size-2 rounded-full bg-agent" /></span>
          <span className="shimmer text-[12.5px] font-medium">Stage {running.n} · {running.name} in progress</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {events.length === 0 ? (
          <div className="grid h-full place-items-center px-8 text-center text-xs text-ink-3">
            <div>
              <Radio className="mx-auto mb-2 size-5 text-ink-4" />
              Agent activity streams here. Run a stage from Mission control to watch the agents work.
            </div>
          </div>
        ) : (
          events.map((e) => <EventRow key={e.id} e={e} />)
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-line px-3 py-2 text-[10.5px] leading-relaxed text-ink-4">
        Every agent call is logged with inputs, outputs, ontology version and model version. Text inside source data is treated as data, never as an instruction.
      </div>
    </div>
  );
}

interface Msg { role: 'user' | 'assistant'; content: string }

function suggestions(path: string, itemId?: string) {
  if (itemId) return [`Why was ${itemId} proposed?`, `What alternatives were considered for ${itemId}?`, `Show sample values for ${itemId}`, `Draft a decision note for ${itemId}`];
  if (path.startsWith('/hierarchy')) return ['Why can a pump not sit under a valve?', 'What hierarchy issues are open?'];
  if (path.startsWith('/quality')) return ['How were the duplicates found?', 'What is blocking a higher quality score?'];
  if (path.startsWith('/discovery')) return ['Explain the priority script', 'Which custom fields need decisions?'];
  return ['What needs my attention?', 'Explain the priority script', 'How were the duplicates found?'];
}

function Ask() {
  const { assistantContext, setAssistantContext, pendingQuestion, consumeQuestion, meta } = useApp();
  const loc = useLocation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  // A ref, not state, guards against a second send before React re-renders (e.g. StrictMode effects).
  const inFlight = useRef(false);
  const send = async (text: string) => {
    if (!text.trim() || inFlight.current) return;
    inFlight.current = true;
    const history: Msg[] = [...msgs, { role: 'user', content: text.trim() }];
    const slot = history.length; // index of the assistant reply being streamed
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    abort.current = new AbortController();
    const write = (f: (prev: string) => string) =>
      setMsgs((m) => m.map((x, i) => (i === slot ? { role: 'assistant', content: f(x.content) } : x)));
    try {
      await streamAssistant(history, { page: loc.pathname, itemId: assistantContext.itemId }, (t) => write((p) => p + t), abort.current.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') write(() => '_The assistant is not reachable right now._');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pendingQuestion) return;
    const q = pendingQuestion;
    consumeQuestion();
    send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  const sugg = useMemo(() => suggestions(loc.pathname, assistantContext.itemId), [loc.pathname, assistantContext.itemId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="pt-6 text-center">
            <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-agent to-accent text-white shadow-pop"><Sparkles className="size-5" /></div>
            <div className="text-sm font-semibold">Review Assistant</div>
            <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-ink-3">Explains evidence, compares alternatives and drafts decision notes. It cannot approve anything: people decide.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'gap-2.5')}>
            {m.role === 'assistant' && <AgentAvatar id="assistant" size="sm" />}
            <div className={cx('max-w-[88%] text-[13px] leading-relaxed', m.role === 'user' ? 'rounded-2xl rounded-br-md bg-ink px-3 py-2 text-surface' : 'min-w-0 flex-1 text-ink-2')}>
              {m.role === 'user' ? m.content : m.content ? <Markdown text={m.content} /> : <span className="shimmer text-xs font-medium">Reading the evidence…</span>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        {msgs.length < 2 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {sugg.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-2 transition hover:border-agent/40 hover:text-agent">{s}</button>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-line bg-surface shadow-card focus-within:border-agent/50 focus-within:ring-2 focus-within:ring-agent/10">
          {assistantContext.itemId && (
            <div className="flex items-center gap-1.5 px-2.5 pt-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-agent-soft px-1.5 py-0.5 text-[11px] font-medium text-agent">
                About {assistantContext.itemId}{assistantContext.label ? ` · ${assistantContext.label}` : ''}
                <button onClick={() => setAssistantContext({})} aria-label="Clear context"><X className="size-3" /></button>
              </span>
            </div>
          )}
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask about a mapping, a rule or the data…" className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-ink-4" />
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="text-[10.5px] text-ink-4">{meta?.liveModel ? meta.model : 'Scripted · grounded in project data'}</span>
            {busy ? (
              <button onClick={() => abort.current?.abort()} className="grid size-7 place-items-center rounded-lg bg-ink text-surface" aria-label="Stop"><Square className="size-3" /></button>
            ) : (
              <button onClick={() => send(input)} disabled={!input.trim()} className="grid size-7 place-items-center rounded-lg bg-agent text-white disabled:opacity-30" aria-label="Send"><ArrowUp className="size-4" /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentDock() {
  const { dockOpen, setDockOpen, dockTab, setDockTab, activeAgents, events } = useApp();
  const live = activeAgents.size > 0;
  return (
    <AnimatePresence initial={false}>
      {dockOpen && (
        <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 384, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="no-print flex shrink-0 flex-col overflow-hidden border-l border-line bg-surface-2">
          <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3">
            {(['activity', 'ask'] as const).map((t) => (
              <button key={t} onClick={() => setDockTab(t)} className={cx('relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition', dockTab === t ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-3 hover:text-ink')}>
                {t === 'activity' ? <Radio className={cx('size-3.5', live && 'text-agent')} /> : <Sparkles className="size-3.5" />}
                {t === 'activity' ? 'Agent activity' : 'Ask'}
                {t === 'activity' && live && <span className="size-1.5 animate-pulse rounded-full bg-agent" />}
                {t === 'activity' && !live && events.length > 0 && <span className="text-[11px] tabular text-ink-4">{events.length}</span>}
              </button>
            ))}
            <div className="flex-1" />
            <Kbd className="mr-1">.</Kbd>
            <button onClick={() => setDockOpen(false)} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-sunken" aria-label="Close panel"><X className="size-4" /></button>
          </div>
          {dockTab === 'activity' ? <Activity /> : <Ask />}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
