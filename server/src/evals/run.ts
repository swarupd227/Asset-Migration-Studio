import type { Mapping, Project, Skill } from '../types.js';
import { concepts, ONTOLOGY_VERSION } from '../data/ontology.js';
import { proposeFixes, transform, validate } from '../rules.js';
import { itemsFor, NONE_OPTION, questionById, type ItemContext } from '../decisions/questions.js';
import { band, confidenceOf, DEFAULT_THRESHOLDS, inputHash, type Thresholds } from '../decisions/flow.js';
import { top, type DecisionModel } from '../decisions/model.js';
import { localDecisionModel } from '../decisions/adapters/local.js';
import { claudeDecisionModel } from '../decisions/adapters/claude.js';
import { catalogueTables, dataset, GD01, goldenBindings, goldenClasses, goldenDuplicates, goldenMode, goldenParents, goldenStatusCodes, seededErrors } from './golden.js';

// Evaluation harness: runs the agents' decision logic on a golden dataset and computes the release
// metrics. Pure apart from model calls, so it runs in CI with the in-environment model.

export interface EvalMetrics {
  binding_precision: number; binding_recall: number;
  code_list_accuracy: number; code_list_coverage: number;
  hierarchy_accuracy: number; rule_detection: number;
  failure_mode_accuracy: number; failure_mode_coverage: number; calibration_error: number;
  classification_accuracy: number; duplicate_precision: number; duplicate_recall: number;
}
export const LOWER_IS_BETTER: (keyof EvalMetrics)[] = ['calibration_error'];

export interface EvalResult {
  dataset: string; model: string; ontologyVersion: string; thresholds: Thresholds;
  metrics: EvalMetrics; calibration: { conf: number; rate: number; n: number }[];
  thresholdSuggestion: { auto: number; human: number; precisionAtAuto: number };
  counts: Record<string, number>; ms: number;
}

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 10000 : 0);

// ---------- Binding (Concept Aligner without the mapping memory) ----------

/** Binds a field from its name and catalogue description to ontology labels and synonyms. */
export function lexicalBinding(element: string, description: string): string | undefined {
  const words = `${element.split('.')[1] ?? element} ${description}`.toLowerCase().replace(/[_.]/g, ' ');
  let best: { id: string; score: number } | undefined;
  for (const c of concepts) {
    for (const term of [c.label, ...c.synonyms].map((s) => s.toLowerCase())) {
      if (term.length < 3) continue;
      const score = words.includes(term) ? term.length : 0;
      if (score > (best?.score ?? 0)) best = { id: c.id, score };
    }
  }
  return best?.id;
}

function bindingMetrics() {
  const golden = goldenBindings();
  const tables = catalogueTables();
  let proposed = 0, correct = 0;
  for (const [element, concept] of golden) {
    if (!/^[A-Z_]+\.[A-Z_]+$/.test(element)) continue;
    const [t, f] = element.split('.');
    const desc = tables.find((x) => x.name === t)?.fields.find((x) => x.name === f)?.description ?? '';
    const p = lexicalBinding(element, desc);
    if (!p) continue;
    proposed++;
    if (p === concept) correct++;
  }
  const total = [...golden.keys()].filter((e) => /^[A-Z_]+\.[A-Z_]+$/.test(e)).length;
  return { binding_precision: ratio(correct, proposed), binding_recall: ratio(correct, total) };
}

// ---------- Decisions ----------

async function decide(model: DecisionModel, questionId: string, items: { text: string; options: string[]; context: Record<string, string> }[]) {
  const q = questionById(questionId)!;
  const unique = new Map(items.map((i) => [inputHash(questionId, ONTOLOGY_VERSION, i.options, i.text), i]));
  const { answers } = await model.decide(q, [...unique.entries()].map(([hash, i]) => ({ hash, ...i })));
  const byHash = new Map(answers.map((a) => [a.hash, a.probabilities]));
  return (i: { text: string; options: string[] }) => {
    const p = byHash.get(inputHash(questionId, ONTOLOGY_VERSION, i.options, i.text)) ?? {};
    const [answer] = top(p);
    return { answer, confidence: confidenceOf(q.kind, p, answer) };
  };
}

/** `skills`: skills loaded for this run, so a candidate can be tested before it is published. */
export async function runEval(opts: { model?: 'local' | 'configured'; thresholds?: Thresholds; decisionModel?: DecisionModel; skills?: Skill[] } = {}): Promise<EvalResult> {
  const t0 = Date.now();
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const model = opts.decisionModel ?? (opts.model === 'configured' && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) ? claudeDecisionModel() : localDecisionModel);
  const ds = dataset();
  const project = { sourceSystems: ['IBM Maximo 7.6'], industryPack: 'Utilities', customer: GD01.name } as Project;
  const ctx = (prior: ItemContext['prior'] = () => new Map()): ItemContext => ({ ds, mappings: [] as Mapping[], project, prior });
  const skills = opts.skills ?? [];
  const withSkillRules = <T extends { text: string; options: string[]; ruleAnswer?: string; alwaysHuman?: boolean }>(questionId: string, items: T[]) => {
    const rules = skills.flatMap((s) => s.effects).filter((e): e is Extract<Skill['effects'][number], { type: 'decision_rule' }> => e.type === 'decision_rule' && e.question === questionId).map((e) => ({ re: new RegExp(e.pattern, 'i'), answer: e.answer }));
    return items.map((i) => {
      if (i.ruleAnswer || i.alwaysHuman) return i;
      const r = rules.find((x) => x.re.test(i.text) && i.options.includes(x.answer));
      return r ? { ...i, ruleAnswer: r.answer } : i;
    });
  };
  const skipTypes = skills.flatMap((s) => s.effects).flatMap((e) => (e.type === 'location_type_rule' && e.action === 'not_migrated' ? [e.locationType] : []));

  // Validation and remediation
  const failures = validate(ds);
  const seeded = seededErrors();
  const found = seeded.filter((s) => failures.some((f) => f.rule === s.rule && (f.record === s.record || f.record.includes(s.record) || f.record.startsWith(s.record))));
  const fixes = proposeFixes(ds, failures).map((f) => (f.kind === 'reparent' ? { ...f, status: 'approved' as const } : f));
  const cur = transform(ds, fixes, [], { notMigratedLocationTypes: skipTypes });
  const parents = goldenParents();
  const hierarchyOk = cur.assets.filter((a) => (parents.has(a.assetnum) ? !a.parent && a.location === parents.get(a.assetnum) : true)).length;

  // Code lists: rule-settled vendor codes; local codes always go to a person.
  const codes = itemsFor('code.map', ctx());
  const codeAuto = codes.filter((c) => c.ruleAnswer && !c.alwaysHuman);
  const codeCorrect = codeAuto.filter((c) => goldenStatusCodes[c.recordKey] === c.ruleAnswer).length;

  // Failure modes
  const fm = withSkillRules('wo.failure_mode', itemsFor('wo.failure_mode', ctx()).filter((i) => goldenMode(i.text) !== undefined));
  const fmDecide = await decide(model, 'wo.failure_mode', fm.filter((i) => !i.ruleAnswer));
  const code = (opt: string) => (opt === NONE_OPTION ? 'NONE' : opt.match(/\((\w+)\)/)?.[1]);
  let auto = 0, autoCorrect = 0;
  const scored: { conf: number; ok: boolean }[] = [];
  for (const i of fm) {
    const gold = goldenMode(i.text);
    if (i.ruleAnswer) { auto++; if (code(i.ruleAnswer) === gold) autoCorrect++; continue; }
    const r = fmDecide(i);
    const ok = code(r.answer) === gold;
    scored.push({ conf: r.confidence, ok });
    if (band(r.confidence, thresholds) === 'model') { auto++; if (ok) autoCorrect++; }
  }
  const bins = Array.from({ length: 10 }, (_, b) => scored.filter((s) => Math.min(9, Math.floor(s.conf * 10)) === b));
  const calibration = bins.map((list, b) => ({ conf: list.length ? list.reduce((s, x) => s + x.conf, 0) / list.length : (b + 0.5) / 10, rate: list.length ? list.filter((x) => x.ok).length / list.length : 0, n: list.length })).filter((x) => x.n > 0);
  const ece = scored.length ? calibration.reduce((s, x) => s + (x.n / scored.length) * Math.abs(x.conf - x.rate), 0) : 0;
  // Lowest auto-accept threshold whose accepted answers are at least 95% correct.
  const sorted = [...scored].sort((a, b) => b.conf - a.conf);
  let suggestion = thresholds.auto, precisionAtAuto = 0;
  for (const t of [0.75, 0.8, 0.85, 0.9, 0.95]) {
    const acc = sorted.filter((s) => s.conf >= t);
    const prec = acc.length ? acc.filter((s) => s.ok).length / acc.length : 0;
    if (prec >= 0.95) { suggestion = t; precisionAtAuto = prec; break; }
  }

  // Classification of untyped assets (family, then class)
  const fam = withSkillRules('asset.family', itemsFor('asset.family', ctx()));
  const famDecide = await decide(model, 'asset.family', fam.filter((i) => !i.ruleAnswer));
  const famAnswers = new Map(fam.map((i) => [i.recordKey, { answer: i.ruleAnswer ?? famDecide(i).answer, confidence: 1, status: 'accepted' }]));
  const cls = withSkillRules('asset.class', itemsFor('asset.class', ctx((id) => (id === 'asset.family' ? famAnswers : new Map()))));
  const clsDecide = await decide(model, 'asset.class', cls.filter((i) => !i.ruleAnswer));
  const goldCls = goldenClasses();
  const label = new Map(concepts.map((c) => [c.label, c.id]));
  const clsCorrect = cls.filter((i) => label.get(i.ruleAnswer ?? clsDecide(i).answer) === goldCls.get(i.recordKey)).length;

  // Duplicate pairs
  const pairs = withSkillRules('asset.same_asset', itemsFor('asset.same_asset', ctx()));
  const pairDecide = await decide(model, 'asset.same_asset', pairs.filter((i) => !i.ruleAnswer));
  const saidYes = new Set(pairs.filter((i) => (i.ruleAnswer ?? pairDecide(i).answer) === 'Yes').map((i) => i.recordKey));
  const goldDup = goldenDuplicates();
  const truePos = [...saidYes].filter((k) => goldDup.has(k)).length;

  return {
    dataset: GD01.id, model: model.name, ontologyVersion: ONTOLOGY_VERSION, thresholds,
    metrics: {
      ...bindingMetrics(),
      code_list_accuracy: ratio(codeCorrect, codeAuto.length), code_list_coverage: ratio(codeAuto.length, codes.length),
      hierarchy_accuracy: ratio(hierarchyOk, cur.assets.length), rule_detection: ratio(found.length, seeded.length),
      failure_mode_accuracy: ratio(autoCorrect, auto), failure_mode_coverage: ratio(auto, fm.length), calibration_error: Math.round(ece * 10000) / 10000,
      classification_accuracy: ratio(clsCorrect, goldCls.size), duplicate_precision: ratio(truePos, saidYes.size), duplicate_recall: ratio(truePos, goldDup.size),
    },
    calibration: calibration.map((c) => ({ conf: Math.round(c.conf * 100) / 100, rate: Math.round(c.rate * 100) / 100, n: c.n })),
    thresholdSuggestion: { auto: suggestion, human: thresholds.human, precisionAtAuto: Math.round(precisionAtAuto * 1000) / 1000 },
    counts: { seededErrors: seeded.length, found: found.length, failureModeRecords: fm.length, untyped: goldCls.size, pairs: pairs.length, codes: codes.length },
    ms: Date.now() - t0,
  };
}

/** Release gate: no metric may get worse than the baseline (small tolerance for rounding). */
export function gate(metrics: EvalMetrics, baseline: Partial<EvalMetrics>, tolerance = 0.002) {
  const regressions = (Object.keys(baseline) as (keyof EvalMetrics)[]).filter((k) => {
    const b = baseline[k];
    if (b === undefined || metrics[k] === undefined) return false;
    return LOWER_IS_BETTER.includes(k) ? metrics[k] > b + tolerance : metrics[k] < b - tolerance;
  }).map((k) => ({ metric: k, baseline: baseline[k]!, now: metrics[k] }));
  return { passed: regressions.length === 0, regressions };
}
