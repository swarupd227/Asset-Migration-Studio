import type { DecisionInput, DecisionModel, TypedQuestion } from '../model.js';
import { normalise } from '../model.js';
import { conceptById, families } from '../../data/ontology.js';

// In-environment decision model (DM-07): keyword evidence and ontology rules for every question.
// Always available; used when a project switches external models off or no model is configured.

const CUES: [RegExp, RegExp][] = [
  [/\(ELP\)|external leakage|oil leakage/i, /leak|weep|gland|drip/i],
  [/\(INL\)/i, /passing|internal leak/i],
  [/\(VIB\)/i, /vibrat|noisy|noise|bearing/i],
  [/\(FTS\)/i, /fail(ed)? to start|would not start|won'?t start|tripped on start|not start/i],
  [/\(OHE\)/i, /overheat|running hot|temperature high|hot\b/i],
  [/\(LOO\)/i, /low flow|reduced output|low dose|low output|low pressure/i],
  [/\(FTC\)/i, /would not close|won'?t close|stuck open|not close/i],
  [/\(FTO\)/i, /would not open|won'?t open|stuck closed|not open/i],
  [/\(INS\)/i, /insulation|ir test|earth fault|dga/i],
  [/\(TCF\)/i, /tap changer/i],
  [/\(ERO\)/i, /erratic/i],
  [/\(NOO\)/i, /no signal|no output/i],
  [/\(OOC\)/i, /calibration|drift/i],
  [/\(FTT\)/i, /fail(ed)? to trip/i],
  [/\(SPT\)/i, /spurious trip|nuisance trip/i],
  [/\(PD\)/i, /partial discharge/i],
  // causes
  [/\(MWF\)/i, /wear|bearing|seal|worn|fatigue/i],
  [/\(COR\)/i, /corros|rust|erosion/i],
  [/\(ELF\)/i, /contactor|overload|starter|winding|insulation|coil|ir test/i],
  [/\(ICF\)/i, /signal|calibration|transmitter|relay setting|converter|cable/i],
  [/\(CON\)/i, /debris|block|clog|filter|strainer|inlet|cooling fins/i],
  [/\(MNE\)/i, /realign|alignment|tightened|reseat|repack/i],
];
const NONE = /no defects|checked and ok|operated ok|verified ok|passed|inspection done|dosing check ok/i;
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

function choiceByCues(inp: DecisionInput) {
  const raw: Record<string, number> = {};
  for (const opt of inp.options) {
    const cue = CUES.find(([optRe]) => optRe.test(opt));
    raw[opt] = cue && cue[1].test(inp.text) ? 8 : 0.25;
  }
  const none = inp.options.find((o) => /none or unclear|other or unclear/i.test(o));
  if (none) raw[none] = NONE.test(inp.text) ? 9 : Object.values(raw).some((v) => v > 1) ? 0.5 : 2;
  return raw;
}

function byConceptSynonyms(inp: DecisionInput, conceptsFor: (opt: string) => string[]) {
  const raw: Record<string, number> = {};
  const t = inp.text.toLowerCase();
  for (const opt of inp.options) {
    const hits = conceptsFor(opt).filter((cid) => {
      const c = conceptById.get(cid);
      return c && [c.label, ...c.synonyms].some((s) => t.includes(s.toLowerCase()));
    });
    raw[opt] = hits.length ? 6 : 0.3;
  }
  // "Motor for pump PU-1": the subject is the first equipment word.
  const first = inp.options.map((o) => [o, Math.min(...conceptsFor(o).flatMap((cid) => { const c = conceptById.get(cid); return c ? [c.label, ...c.synonyms].map((s) => t.indexOf(s.toLowerCase())).filter((i) => i >= 0) : []; }))] as const);
  const lead = first.filter(([, i]) => Number.isFinite(i)).sort((a, b) => a[1] - b[1])[0];
  if (lead) raw[lead[0]] += 6;
  return raw;
}

function answer(q: TypedQuestion, inp: DecisionInput): Record<string, number> {
  switch (q.id) {
    case 'asset.family':
      return byConceptSynonyms(inp, (opt) => families.find((f) => f.label === opt)?.concepts ?? []);
    case 'asset.class':
      return byConceptSynonyms(inp, (opt) => [...conceptById.values()].filter((c) => c.label === opt).map((c) => c.id));
    case 'asset.same_asset': {
      const [a, b] = inp.text.split(' | B: ');
      const wa = words(a.replace(/^A: /, '').replace(/\(serial.*$/, '')), wb = words(b.replace(/\(serial.*$/, ''));
      const overlap = [...wa].filter((w) => wb.has(w)).length / Math.max(1, Math.min(wa.size, wb.size));
      return overlap > 0.8 ? { Yes: 7, No: 3 } : { Yes: 1, No: 9 };
    }
    case 'wo.cause_plausible':
      return /tap changer/i.test(inp.text) && !/transformer/i.test(inp.context.assetClass ?? '') ? { 1: 8, 2: 1, 3: 0.5, 4: 0.3, 5: 0.2 } : { 1: 0.2, 2: 0.3, 3: 1, 4: 5, 5: 3 };
    case 'text.instruction_like':
      return /\b(ignore|disregard|override)\b.*\b(instruction|previous|rule)/i.test(inp.text) || /\bmark (every|all)\b/i.test(inp.text) ? { Yes: 9, No: 1 } : { Yes: 1, No: 9 };
    case 'review.risk': {
      const flags = inp.context.flags ?? '';
      const conf = Number(inp.context.confidence ?? 1);
      const base = /custom/i.test(inp.text) ? 3 : 2;
      const s = Math.min(5, base + (conf < 0.75 ? 1 : 0) + (/hierarch|parent|priority|status/i.test(inp.text) ? 1 : 0) + (flags !== 'none' ? 2 : 0));
      return Object.fromEntries(['1', '2', '3', '4', '5'].map((o) => [o, o === String(s) ? 6 : 1]));
    }
    case 'precedent.relevant': {
      const t = inp.text.toLowerCase();
      const s = /water|utilit|electric|power/.test(t.split('earlier decision:')[1] ?? '') ? (/maximo/.test(t) ? 4 : 3) : 2;
      return Object.fromEntries(['1', '2', '3', '4', '5'].map((o) => [o, o === String(s) ? 6 : 1]));
    }
    case 'code.map':
      return Object.fromEntries(inp.options.map((o) => [o, 1]));
    default:
      return choiceByCues(inp);
  }
}

export const localDecisionModel: DecisionModel = {
  name: 'local-rules',
  version: '1.1',
  async decide(q, inputs: DecisionInput[]) {
    return { answers: inputs.map((inp) => ({ hash: inp.hash, probabilities: normalise(inp.options, answer(q, inp)) })), tokens: 0, costUsd: 0 };
  },
};
