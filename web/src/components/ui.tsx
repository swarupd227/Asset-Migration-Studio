import { clsx } from 'clsx';
import { motion } from 'motion/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { ReviewPath } from '@shared/types';
import { confidenceTone, pathLabel, pathTone, type Tone } from '@/lib/format';

export const cx = clsx;

const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2 border-line',
  accent: 'bg-accent-soft text-accent border-accent-line',
  agent: 'bg-agent-soft text-agent border-transparent',
  ok: 'bg-ok-soft text-ok border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  bad: 'bg-bad-soft text-bad border-transparent',
  crit: 'bg-crit-soft text-crit border-transparent',
  info: 'bg-info-soft text-info border-transparent',
};
export const toneText: Record<Tone, string> = {
  neutral: 'text-ink-3', accent: 'text-accent', agent: 'text-agent', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', crit: 'text-crit', info: 'text-info',
};
export const toneBg: Record<Tone, string> = {
  neutral: 'bg-ink-4', accent: 'bg-accent', agent: 'bg-agent', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', crit: 'bg-crit', info: 'bg-info',
};

export function Badge({ tone = 'neutral', children, className, icon: Icon, dot }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap', toneClass[tone], className)}>
      {dot && <span className={cx('size-1.5 rounded-full', toneBg[tone])} />}
      {Icon && <Icon className="size-3" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'agent' | 'ok';
const btn: Record<BtnVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 shadow-card',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-crit border border-line hover:bg-crit-soft',
  agent: 'bg-agent text-white hover:brightness-110 shadow-card',
  ok: 'bg-ok text-white hover:brightness-110 shadow-card dark:text-black',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, children, className, kbd, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: LucideIcon; kbd?: string }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none select-none',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8.5 px-3 text-[13px]',
        btn[variant], className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2} />}
      {children}
      {kbd && <Kbd className="ml-1 opacity-70">{kbd}</Kbd>}
    </button>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx('inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-ink-3', className)}>{children}</kbd>;
}

export function Card({ children, className, pad = true, ...rest }: { children: ReactNode; className?: string; pad?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-xl border border-line bg-surface shadow-card', pad && 'p-4', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, icon: Icon, right, className }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2"><Icon className="size-4" /></div>}
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, badges }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; badges?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ink-3">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{description}</p>}
        {badges && <div className="mt-2.5 flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon: Icon, to }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: LucideIcon; to?: string }) {
  const body = (
    <Card className={cx('h-full', to && 'transition hover:border-line-strong hover:shadow-pop')}>
      <div className="flex items-center justify-between text-xs font-medium text-ink-3">
        <span>{label}</span>
        {Icon && <Icon className={cx('size-4', tone ? toneText[tone] : 'text-ink-4')} />}
      </div>
      <div className={cx('mt-2 text-[26px] font-semibold tracking-tight tabular', tone && toneText[tone])}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export function Confidence({ value, showBar = true, className }: { value: number; showBar?: boolean; className?: string }) {
  const tone = confidenceTone(value);
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)} title={`Calibrated confidence ${value.toFixed(2)}`}>
      {showBar && (
        <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-sunken">
          <span className={cx('absolute inset-y-0 left-0 rounded-full', toneBg[tone])} style={{ width: `${value * 100}%` }} />
          <span className="absolute inset-y-0 w-px bg-ink-4/60" style={{ left: '75%' }} />
          <span className="absolute inset-y-0 w-px bg-ink-4/60" style={{ left: '95%' }} />
        </span>
      )}
      <span className={cx('font-mono text-xs font-medium tabular', toneText[tone])}>{value.toFixed(2)}</span>
    </span>
  );
}

export function PathBadge({ path }: { path: ReviewPath }) {
  return <Badge tone={pathTone[path]} dot>{pathLabel[path]}</Badge>;
}

export function Progress({ value, tone = 'accent', className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
      <motion.div className={cx('h-full rounded-full', toneBg[tone])} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 border-b border-line', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('relative -mb-px flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors', value === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}>
          {t.label}
          {t.count !== undefined && <span className="rounded bg-sunken px-1.5 text-[11px] tabular text-ink-3">{t.count}</span>}
          {value === t.id && <motion.span layoutId={`tab-${tabs.map((x) => x.id).join('')}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={cx('flex items-center gap-1.5 rounded-md font-medium transition', size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[12.5px]', value === o.id ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink-2')}>
          {o.label}
          {o.count !== undefined && <span className="tabular text-[11px] text-ink-4">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-sunken text-ink-3"><Icon className="size-5" /></div>
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-xs text-ink-3">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-sunken', className)} />;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px]', className)}>{children}</span>;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{children}</div>
      {right}
    </div>
  );
}

/** Small scripted-agent disclosure, required when scripted results are shown. */
export function ScriptedNote({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[11px] text-ink-3', className)} title="The concept demo uses scripted agent results where a live agent run is not ready.">
      <span className="size-1.5 rounded-full bg-warn" /> Scripted agent run
    </span>
  );
}
