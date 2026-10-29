import type { Dataset } from '../types.js';
import { assets, closedWorkOrders, duplicatePairs, locations, meters, orphanAssets, outOfRangeRatings, pmPlans, pumpsUnderValves, untypedAssets, workOrders } from '../data/seed.js';
import { buildMappings, catalogue } from '../data/catalog.js';

// Golden dataset GD-01: the Northvale Water & Power Maximo 7.6 extract with the correct answers,
// built by the utilities pack experts. Every release of agents, ontology, decision thresholds and
// shared skills is measured against it.

export const GD01 = { id: 'GD-01', name: 'Water and power utility', source: 'Maximo 7.6', pack: 'Utilities' };

export function dataset(): Dataset {
  return structuredClone({ assets, locations, workOrders: [...workOrders, ...closedWorkOrders], pms: pmPlans, meters });
}

/** Correct concept for every catalogued source element. */
export function goldenBindings(): Map<string, string> {
  return new Map(buildMappings().map((m) => [m.sourceElements[0], m.conceptId]));
}

export const catalogueTables = () => structuredClone(catalogue);

/** Correct ontology status for every work order status code in the extract. */
export const goldenStatusCodes: Record<string, string> = {
  WAPPR: 'Requested, waiting for approval', APPR: 'Approved and released', WSCH: 'Approved and released', INPRG: 'Work in progress',
  COMP: 'Work complete', CLOSE: 'Closed', CAN: 'Cancelled', 'NV-HOLD': 'Approved and released', FLDCOMP: 'Work complete', 'PEND-REG': 'Approved and released',
};

/** Errors planted in the extract that validation must find, by rule. */
export function seededErrors(): { rule: string; record: string }[] {
  return [
    ...pumpsUnderValves.map((p) => ({ rule: 'SM-01', record: p.pump })),
    ...duplicatePairs.map((d) => ({ rule: 'DQ-01', record: d.dup })),
    ...orphanAssets.map((a) => ({ rule: 'RF-01', record: a })),
    ...untypedAssets.map((a) => ({ rule: 'DQ-02', record: a })),
    ...outOfRangeRatings.map((a) => ({ rule: 'SM-05', record: a })),
    ...pmPlans.filter((p) => p.frequnit === 'HOURS').map((p) => ({ rule: 'SM-04', record: p.pmnum })),
    ...workOrders.filter((w) => w.assetnum && !assets.some((a) => a.assetnum === w.assetnum)).map((w) => ({ rule: 'RF-01', record: w.wonum })),
    { rule: 'SM-03', record: meters[0].assetnum },
  ];
}

/** Correct class of each asset that arrives without one. */
export const goldenClasses = () => new Map(untypedAssets.map((n) => [n, assets.find((a) => a.assetnum === n)!.conceptId!]));

/** Correct duplicate pairs (kept asset | duplicate). */
export const goldenDuplicates = () => new Set(duplicatePairs.map((d) => `${d.keep}|${d.dup}`));

/** Correct parent for assets whose parent is wrong in the source: the functional location. */
export const goldenParents = () => new Map(pumpsUnderValves.map((p) => [p.pump, assets.find((a) => a.assetnum === p.pump)!.location]));

// Failure mode of each work order wording, labelled by the reliability engineers (ISO 14224 codes).
const MODE_LABELS: [RegExp, string][] = [
  [/seal leaking|seal weeping|gland leaking|oil leak|chlorine leak/, 'ELP'],
  [/passing when closed/, 'INL'],
  [/vibration|noisy/, 'VIB'],
  [/failed to start|tripped on start|would not start/, 'FTS'],
  [/running hot|overheating|top oil temperature high/, 'OHE'],
  [/low flow|reduced output|low dose/, 'LOO'],
  [/stuck closed|would not open/, 'FTO'],
  [/would not close/, 'FTC'],
  [/ir test low|insulation fault|insulation degradation/, 'INS'],
  [/tap changer fault/, 'TCF'],
  [/erratic/, 'ERO'],
  [/no signal|no output/, 'NOO'],
  [/out of calibration/, 'OOC'],
  [/failed to trip/, 'FTT'],
  [/spurious trip/, 'SPT'],
  [/partial discharge/, 'PD'],
  [/routine pm completed|inspection done|no defects|checked and ok|operated ok|verified ok|check passed|test passed|dosing check ok|inspection, no defects/, 'NONE'],
];

/** Correct failure-mode code for a work order text, or undefined when the experts did not label it. */
export function goldenMode(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/ignore previous instructions/.test(t)) return undefined;
  return MODE_LABELS.find(([re]) => re.test(t))?.[1];
}
