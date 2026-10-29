import type { Skill } from '../types.js';
import { mask, type MaskTerms } from '../decisions/mask.js';

// Turns a project skill into a shared-library candidate: names of people, customers and sites,
// record identifiers and evidence values are removed; only the procedure and its conditions remain.

const RECORD = [
  [/\bWO-\d{4,}\b/g, '[work order]'],
  [/\bPM-\d{3,}\b/g, '[PM plan]'],
  [/\b(?:PU|MO|VA|PI|FM|TX|CB|SG|BL|CL)-\d{4,}A?\b/g, '[asset]'],
  [/\b[A-Z]{3,6}-(?:PS|SY|BAY)\d{2}(?:-[PF]\d{2})?\b/g, '[location]'],
  [/\bRUN-\d+\b/g, '[run]'],
] as const;

export function anonymiseText(text: string, terms: MaskTerms) {
  // Record identifiers first: they contain site codes that the name masking would split.
  let out = text;
  for (const [re, token] of RECORD) out = out.replace(re, token);
  return mask(out, terms);
}

export function anonymiseSkill(s: Skill, terms: MaskTerms): Pick<Skill, 'name' | 'description' | 'steps' | 'examples' | 'effects' | 'conditions' | 'evidence'> {
  const a = (t: string) => anonymiseText(t, terms);
  return {
    name: a(s.name),
    description: a(s.description),
    steps: s.steps.map(a),
    examples: s.examples.map(a),
    effects: s.effects.map((e) => (e.type === 'prompt_hint' ? { ...e, text: a(e.text) } : e)),
    // Conditions describe the source and pack, never the customer.
    conditions: { sourceSystems: s.conditions.sourceSystems, industryPacks: s.conditions.industryPacks, objects: s.conditions.objects, questions: s.conditions.questions },
    // Evidence values stay in the tenant; the shared skill keeps only how much evidence there was.
    evidence: [{ kind: 'summary', ref: 'tenant', text: `${s.evidence.length} items of evidence in the contributing project` }],
  };
}
