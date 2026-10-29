import type { Dataset, DecisionQuestionInfo } from '../types.js';
import { conceptById } from '../data/ontology.js';
import { conceptOf } from '../rules.js';
import type { TypedQuestion } from './model.js';

// Question catalogue. Each question declares the record fields it may send to a model.

export const NONE_OPTION = 'None or unclear';

export const QUESTIONS: (DecisionQuestionInfo & TypedQuestion)[] = [
  {
    id: 'wo.failure_mode', label: 'Work order failure mode', kind: 'choice', recordKind: 'workorder',
    fields: ['description', 'asset class'],
    description: 'Tags each work order with the ISO 14224 failure mode its text describes, chosen from the modes valid for the asset class.',
    prompt: 'Which failure mode of the asset does this work order text describe? Choose "None or unclear" for routine work or when no failure is stated.',
  },
];

export const questionById = (id: string) => QUESTIONS.find((q) => q.id === id);

export interface DecisionItem {
  recordKey: string;
  text: string;
  options: string[];
  context: Record<string, string>;
  /** Answer settled by a deterministic rule, before any model. */
  ruleAnswer?: string;
}

const ROUTINE = /(routine pm completed|inspection done|no defects|checked and ok|operated ok|verified ok|check passed|test passed|dosing check ok|exercised)/i;

export function failureModeItems(ds: Dataset): DecisionItem[] {
  const assets = new Map(ds.assets.map((a) => [a.assetnum, a]));
  const items: DecisionItem[] = [];
  for (const w of ds.workOrders) {
    const a = w.assetnum ? assets.get(w.assetnum) : undefined;
    const c = a && conceptById.get(conceptOf(a) ?? '');
    if (!c || !c.failureModes.length) continue;
    items.push({
      recordKey: w.wonum,
      text: w.description,
      options: [...c.failureModes, NONE_OPTION],
      context: { assetClass: c.label },
      ruleAnswer: w.worktype === 'PM' && ROUTINE.test(w.description) ? NONE_OPTION : undefined,
    });
  }
  return items;
}

export function itemsFor(questionId: string, ds: Dataset): DecisionItem[] {
  if (questionId === 'wo.failure_mode') return failureModeItems(ds);
  throw new Error(`Unknown question ${questionId}`);
}
