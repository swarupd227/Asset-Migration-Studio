import type { ReviewPath } from '@shared/types';

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const num = (n: number) => n.toLocaleString('en-GB');

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export type Tone = 'neutral' | 'accent' | 'agent' | 'ok' | 'warn' | 'bad' | 'crit' | 'info';

export function confidenceTone(c: number): Tone {
  if (c >= 0.95) return 'ok';
  if (c >= 0.75) return 'info';
  return 'warn';
}

export const pathLabel: Record<ReviewPath, string> = {
  auto: 'Auto · 10% sampled',
  quick: 'Quick review',
  expert: 'Expert review',
  named: 'Named reviewer',
};

export const pathTone: Record<ReviewPath, Tone> = { auto: 'ok', quick: 'info', expert: 'warn', named: 'crit' };
