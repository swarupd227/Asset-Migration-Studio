import { useState } from 'react';
import { motion } from 'motion/react';
import { cx } from '@/components/ui';

// Small, token-driven charts shared by the Build & prove screens.
// One series per chart, single axis, recessive grid, hover tooltip on every mark.

export interface BarDatum { label: string; value: number; sub?: string }

/** Vertical bars for one measure across a few categories (e.g. failures per run). */
export function ColumnChart({ data, height = 140, format = (v: number) => String(v), color = 'var(--accent)', highlightLast = true }: {
  data: BarDatum[]; height?: number; format?: (v: number) => string; color?: string; highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="relative">
      <div className="relative flex items-end gap-3 border-b border-line" style={{ height }}>
        {[0.5, 1].map((g) => <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }} />)}
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          const strong = highlightLast ? i === data.length - 1 : true;
          return (
            <div key={d.label} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <motion.div initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18, delay: i * 0.05 }}
                className="w-full max-w-12 rounded-t-[4px]" style={{ background: color, opacity: strong || hover === i ? 1 : 0.45 }} />
              {hover === i && (
                <div className="absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-2 py-1 text-[11px] shadow-pop">
                  <div className="font-medium text-ink">{d.label}</div>
                  <div className="tabular text-ink-2">{format(d.value)}{d.sub ? ` · ${d.sub}` : ''}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-3">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 text-center">
            <div className="text-[11px] text-ink-3">{d.label}</div>
            {(i === data.length - 1 || hover === i) && <div className="text-[11px] font-medium tabular text-ink-2">{format(d.value)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Before → after dumbbell row for scores in [0,1]. */
export function BeforeAfterRow({ label, before, after, sub, min = 0.8 }: { label: string; before: number; after: number; sub?: string; min?: number }) {
  const pos = (v: number) => `${Math.max(0, Math.min(1, (v - min) / (1 - min))) * 100}%`;
  const [hover, setHover] = useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr_5.5rem] items-center gap-3 py-2" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-ink">{label}</div>
        {sub && <div className="truncate text-[11px] text-ink-3">{sub}</div>}
      </div>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <motion.div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: pos(before), background: 'var(--ok)', opacity: 0.35 }}
          initial={{ width: 0 }} animate={{ width: `calc(${pos(after)} - ${pos(before)})` }} transition={{ duration: 0.7 }} />
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-4" style={{ left: pos(before) }} />
        <motion.span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ background: 'var(--ok)' }}
          initial={{ left: pos(before) }} animate={{ left: pos(after) }} transition={{ duration: 0.7 }} />
        {hover && (
          <div className="absolute -top-7 z-10 whitespace-nowrap rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] shadow-pop" style={{ left: pos(after) }}>
            {(before * 100).toFixed(1)}% → {(after * 100).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="text-right text-[12px] tabular">
        <span className="text-ink-3">{(before * 100).toFixed(1)}</span>
        <span className="mx-1 text-ink-4">→</span>
        <span className="font-semibold text-ink">{(after * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

/** Calibration plot: confidence bucket (x) vs observed approval rate (y), diagonal = perfect calibration. */
export function CalibrationChart({ points }: { points: { conf: number; rate: number; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = 220, P = 32;
  const x = (v: number) => P + v * (W - P - 10);
  const y = (v: number) => H - P - v * (H - P - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label="Calibration: confidence versus approval rate">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 3" />
          <text x={P - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">{t * 100}%</text>
          <text x={x(t)} y={H - P + 13} textAnchor="middle" fontSize="9" fill="var(--ink-3)">{t.toFixed(2)}</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="4 3" />
      <text x={x(0.62)} y={y(0.7)} fontSize="9" fill="var(--ink-3)" transform={`rotate(-33 ${x(0.62)} ${y(0.7)})`}>perfect calibration</text>
      <polyline fill="none" stroke="var(--agent)" strokeWidth="2" points={points.map((p) => `${x(p.conf)},${y(p.rate)}`).join(' ')} />
      {points.map((p, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <circle cx={x(p.conf)} cy={y(p.rate)} r="10" fill="transparent" />
          <circle cx={x(p.conf)} cy={y(p.rate)} r={hover === i ? 5.5 : 4} fill="var(--agent)" stroke="var(--surface)" strokeWidth="2" />
        </g>
      ))}
      {hover !== null && (
        <g transform={`translate(${Math.min(x(points[hover].conf) + 8, W - 120)},${y(points[hover].rate) - 34})`}>
          <rect width="112" height="28" rx="6" fill="var(--surface)" stroke="var(--line)" />
          <text x="8" y="12" fontSize="9.5" fill="var(--ink)">Confidence {points[hover].conf.toFixed(2)}</text>
          <text x="8" y="23" fontSize="9.5" fill="var(--ink-2)">{(points[hover].rate * 100).toFixed(0)}% approved · n={points[hover].n}</text>
        </g>
      )}
      <text x={x(0.5)} y={H - 4} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)">Confidence score</text>
      <text x={10} y={y(0.5)} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)" transform={`rotate(-90 10 ${y(0.5)})`}>Approved by reviewers</text>
    </svg>
  );
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StatusDot({ outcome }: { outcome: 'pass' | 'fail' | 'explained' }) {
  return <span className={cx('inline-block size-2 rounded-full', outcome === 'pass' ? 'bg-ok' : outcome === 'fail' ? 'bg-crit' : 'bg-warn')} />;
}
