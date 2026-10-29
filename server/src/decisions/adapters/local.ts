import type { DecisionInput, DecisionModel } from '../model.js';
import { normalise } from '../model.js';

// In-environment decision model (DM-07): keyword evidence for ontology failure modes. Always
// available; used when a project switches external models off or no model is configured.

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
];
const NONE = /no defects|checked and ok|operated ok|verified ok|passed|inspection done|dosing check ok/i;

export const localDecisionModel: DecisionModel = {
  name: 'local-keywords',
  version: '1.0',
  async decide(_q, inputs: DecisionInput[]) {
    const answers = inputs.map((inp) => {
      const raw: Record<string, number> = {};
      for (const opt of inp.options) {
        const cue = CUES.find(([optRe]) => optRe.test(opt));
        raw[opt] = cue && cue[1].test(inp.text) ? 8 : 0.25;
      }
      const none = inp.options.find((o) => /none or unclear/i.test(o));
      if (none) raw[none] = NONE.test(inp.text) ? 9 : Object.values(raw).some((v) => v > 1) ? 0.5 : 2;
      return { hash: inp.hash, probabilities: normalise(inp.options, raw) };
    });
    return { answers, tokens: 0, costUsd: 0 };
  },
};
