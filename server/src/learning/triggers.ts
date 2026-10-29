import type { LoadRun, SkillEvidence } from '../types.js';

// Trigger detection. Pure functions over project history; counts are starting values per pack.

export const TRIGGER_COUNTS = { corrections: 5, loadErrors: 5, longChain: 10, drift: { min: 20, gap: 0.2 } };

export interface TriggerHit {
  key: string;
  kind: 'corrections' | 'load_errors' | 'recovery' | 'long_chain' | 'drift';
  title: string;
  evidence: SkillEvidence[];
  context: Record<string, string>;
}

export interface MappingCorrection { id: string; object: string; kind: string; note?: string; reviewer?: string }
export interface TagOverride { id: string; question: string; label: string; from: string; to: string; input: string; note?: string; reviewer?: string }

/** Reviewers making the same kind of correction five or more times. */
export function correctionTriggers(mappings: MappingCorrection[], overrides: TagOverride[], min = TRIGGER_COUNTS.corrections): TriggerHit[] {
  const out: TriggerHit[] = [];
  const byMap = new Map<string, MappingCorrection[]>();
  for (const m of mappings) byMap.set(`${m.object}|${m.kind}`, [...(byMap.get(`${m.object}|${m.kind}`) ?? []), m]);
  for (const [k, list] of byMap) {
    if (list.length < min) continue;
    const [object, kind] = k.split('|');
    out.push({ key: `corrections:mapping:${k}`, kind: 'corrections', title: `${list.length} ${kind.replace('_', ' ')} corrections on ${object} mappings`,
      evidence: list.map((m) => ({ kind: 'mapping', ref: m.id, text: `${m.reviewer ?? 'Reviewer'}: ${m.note ?? kind}` })), context: { object, correctionKind: kind } });
  }
  const byTag = new Map<string, TagOverride[]>();
  for (const o of overrides) byTag.set(`${o.question}|${o.from}|${o.to}`, [...(byTag.get(`${o.question}|${o.from}|${o.to}`) ?? []), o]);
  for (const [k, list] of byTag) {
    if (list.length < min) continue;
    const [question, from, to] = k.split('|');
    out.push({ key: `corrections:tag:${k}`, kind: 'corrections', title: `${list.length} ${list[0].label.toLowerCase()} tags changed from ${from} to ${to}`,
      evidence: list.map((o) => ({ kind: 'decision', ref: o.id, text: `"${o.input}" · ${o.reviewer ?? 'Reviewer'}${o.note ? `: ${o.note}` : ''}` })),
      context: { question, from, to, inputs: [...new Set(list.map((o) => o.input))].slice(0, 5).join(' || ') } });
  }
  return out;
}

/** IFS rejecting five or more records for the same reason in the latest load. */
export function loadErrorTriggers(run: LoadRun | undefined, min = TRIGGER_COUNTS.loadErrors): TriggerHit[] {
  if (!run) return [];
  const byRule = new Map<string, LoadRun['errors']>();
  for (const e of run.errors) {
    const rule = e.ifsMessage.split(':')[0];
    byRule.set(rule, [...(byRule.get(rule) ?? []), e]);
  }
  return [...byRule.entries()].filter(([, l]) => l.length >= min).map(([rule, l]) => ({
    key: `load_errors:${rule}`, kind: 'load_errors' as const, title: `${l.length} records rejected for ${rule} in ${run.id}`,
    evidence: l.slice(0, 10).map((e) => ({ kind: 'load error', ref: `${run.id}/${e.record}`, text: e.ifsMessage.slice(0, 160) })),
    context: { rule, run: run.id, object: l[0].object, example: l[0].ifsMessage.slice(0, 200) },
  }));
}

/** Auto-accepted answers that people overturn far more often than their confidence suggests. */
export function driftTriggers(rows: { question: string; label: string; confidence: number; overturned: boolean }[], c = TRIGGER_COUNTS.drift): TriggerHit[] {
  const by = new Map<string, typeof rows>();
  for (const r of rows.filter((x) => x.confidence >= 0.85)) by.set(r.question, [...(by.get(r.question) ?? []), r]);
  const out: TriggerHit[] = [];
  for (const [question, list] of by) {
    if (list.length < c.min) continue;
    const expected = list.reduce((s, r) => s + r.confidence, 0) / list.length;
    const actual = list.filter((r) => !r.overturned).length / list.length;
    if (expected - actual >= c.gap) out.push({ key: `drift:${question}`, kind: 'drift', title: `${list[0].label}: confidence ${expected.toFixed(2)} but people kept only ${(actual * 100).toFixed(0)}%`,
      evidence: [{ kind: 'calibration', ref: question, text: `${list.length} reviewed answers at confidence ≥ 0.85` }], context: { question, expected: expected.toFixed(2), actual: actual.toFixed(2) } });
  }
  return out;
}

/** A dry run with a long chain of tool calls that succeeded, or a stage that recovered from an error. */
export function chainTriggers(events: { kind: string; stage?: number; agent: string; text: string; id: string }[], min = TRIGGER_COUNTS.longChain): TriggerHit[] {
  const out: TriggerHit[] = [];
  const tools = events.filter((e) => e.kind === 'tool' && e.stage && e.stage >= 8 && e.stage <= 11);
  if (tools.length >= min && events.some((e) => e.kind === 'done' && e.stage === 11)) {
    out.push({ key: 'long_chain:dry-run', kind: 'long_chain', title: `Dry run completed after ${tools.length} tool calls`, evidence: tools.slice(-10).map((e) => ({ kind: 'agent step', ref: e.id, text: `${e.agent}: ${e.text}` })), context: { stages: '8–11' } });
  }
  const errors = events.filter((e) => e.kind === 'error');
  for (const err of errors) {
    const later = events.find((e) => Number(e.id.slice(3)) > Number(err.id.slice(3)) && e.kind === 'done' && e.agent === err.agent);
    if (later) out.push({ key: `recovery:${err.agent}:${err.id}`, kind: 'recovery', title: `${err.agent} recovered from an error`, evidence: [{ kind: 'error', ref: err.id, text: err.text }, { kind: 'success', ref: later.id, text: later.text }], context: { agent: err.agent } });
  }
  return out;
}
