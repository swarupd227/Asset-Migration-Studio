import { z } from 'zod';
import type { SkillEffect } from '../types.js';

// A skill changes how agents work only through these effects. The schema is strict: anything else,
// including guardrails, permissions, safety-critical or regulatory rules and the ontology, is rejected.

/** Questions that are guardrails themselves; no skill may settle them by rule. */
export const GUARDED_QUESTIONS = ['text.instruction_like', 'code.map'];
const SAFE_PATTERN = /^[\w\s.,'’"()\-–|?*+\\[\]{}^$/:;!&%#@~<>=]{1,200}$/;

export const Effect = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('decision_rule'),
    question: z.string().min(3).refine((q) => !GUARDED_QUESTIONS.includes(q), 'Guardrail questions cannot be settled by a skill'),
    pattern: z.string().regex(SAFE_PATTERN).refine((p) => { try { new RegExp(p, 'i'); return true; } catch { return false; } }, 'Invalid pattern'),
    answer: z.string().min(1).max(120),
  }).strict(),
  z.object({
    type: z.literal('prompt_hint'),
    agents: z.array(z.enum(['decision-model', 'reasoning', 'aligner', 'assistant'])).min(1),
    text: z.string().min(10).max(600).refine((t) => !/\b(ignore|bypass|disable|skip)\b.*\b(guardrail|rule|review|approval|instruction)s?\b/i.test(t), 'Hints cannot weaken guardrails or reviews'),
  }).strict(),
  z.object({
    type: z.literal('location_type_rule'),
    locationType: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/),
    action: z.enum(['functional_object', 'not_migrated']),
  }).strict(),
  z.object({
    type: z.literal('load_precheck'),
    check: z.enum(['default_site', 'class_characteristics']),
  }).strict(),
]);

export const Conditions = z.object({
  sourceSystems: z.array(z.string().max(80)).max(10).optional(),
  industryPacks: z.array(z.string().max(80)).max(10).optional(),
  objects: z.array(z.string().max(40)).max(20).optional(),
  questions: z.array(z.string().max(40)).max(20).optional(),
}).strict();

export function parseEffects(raw: unknown): { effects: SkillEffect[]; rejected: string[] } {
  const list = Array.isArray(raw) ? raw : [];
  const effects: SkillEffect[] = [];
  const rejected: string[] = [];
  for (const e of list) {
    const r = Effect.safeParse(e);
    if (r.success) effects.push(r.data as SkillEffect);
    else rejected.push(r.error.issues.map((i) => i.message).join('; '));
  }
  return { effects, rejected };
}
