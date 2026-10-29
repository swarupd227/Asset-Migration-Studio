import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { useApp } from '@/lib/app';
import { cx } from '@/components/ui';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { AgentDock } from './AgentDock';
import { CommandPalette } from './CommandPalette';

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="no-print pointer-events-none fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
            className="pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl border border-line bg-ink px-3.5 py-2.5 text-[13px] text-surface shadow-pop">
            {t.kind === 'ok' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
            {t.kind === 'error' && <XCircle className="mt-0.5 size-4 shrink-0 text-crit" />}
            {t.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-agent" />}
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Layout() {
  const loc = useLocation();
  return (
    <div className="flex h-full overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2">Skip to content</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className={cx('min-h-0 flex-1 overflow-y-auto')}>
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="mx-auto max-w-[1440px] px-6 py-6 lg:px-8">
            <Outlet />
          </motion.div>
        </main>
      </div>
      <AgentDock />
      <CommandPalette />
      <Toasts />
    </div>
  );
}
