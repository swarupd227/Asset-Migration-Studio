import { describe, expect, it } from 'vitest';
import type { Dataset, FixProposal, Mapping } from './types.js';
import { assets, locations, meters, pmPlans, workOrders } from './data/seed.js';
import { buildMappings } from './data/catalog.js';
import { dqSnapshot, inferConcept, linkFixes, proposeFixes, reconcile, runObjects, transform, validate } from './rules.js';

const raw = (): Dataset => structuredClone({ assets, locations, workOrders, pms: pmPlans, meters });
const approveAll = (fixes: FixProposal[]) => fixes.map((f) => ({ ...f, status: 'approved' as const }));
const approveMappings = (ids: string[]): Mapping[] => buildMappings().map((m) => (ids.includes(m.id) ? { ...m, status: 'approved' } : m));

describe('validation', () => {
  const failures = validate(raw());
  const count = (rule: string) => failures.filter((f) => f.rule === rule).length;

  it('finds pumps placed under valves', () => {
    expect(count('SM-01')).toBe(7);
    expect(failures.find((f) => f.rule === 'SM-01')!.reason).toMatch(/not under a valve/);
  });
  it('finds duplicates by site, normalised serial, manufacturer and model', () => expect(count('DQ-01')).toBe(18));
  it('finds the decreasing cumulative meter', () => expect(count('SM-03')).toBe(1));
  it('finds PM plans that use running hours as a calendar unit', () => expect(count('SM-04')).toBe(12));
  it('finds out-of-range transformer ratings', () => expect(count('SM-05')).toBe(2));
  it('finds work orders pointing to missing assets', () => expect(failures.filter((f) => f.rule === 'RF-01' && f.object === 'Work order')).toHaveLength(22));
  it('gives every failure a stable id', () => expect(new Set(failures.map((f) => f.id)).size).toBe(failures.length));
});

describe('remediation and transformation', () => {
  const ds = raw();
  const failures = validate(ds);
  const fixes = proposeFixes(ds, failures);

  it('proposes a fix for every error', () => {
    const linked = linkFixes(failures, fixes);
    const unfixed = linked.filter((f) => f.severity === 'error' && !f.fixId && !['SM-04'].includes(f.rule));
    expect(unfixed).toEqual([]);
  });
  it('produces the same proposal ids on every run', () => expect(proposeFixes(raw(), validate(raw())).map((f) => f.id)).toEqual(fixes.map((f) => f.id)));
  it('infers a class for untyped assets from the description', () => {
    expect(inferConcept({ ...ds.assets[0], description: 'Discharge pressure transmitter PU-1' })).toBe('util:Instrument');
    expect(inferConcept({ ...ds.assets[0], description: 'Motor for pump PU-1' })).toBe('util:ElectricMotor');
  });
  it('leaves no errors once every fix and the PM and text mappings are approved', () => {
    const cur = transform(ds, approveAll(fixes), approveMappings(['M-046', 'M-050']));
    const remaining = validate(cur).filter((f) => f.severity === 'error');
    expect(remaining).toEqual([]);
  });
  it('raises data quality after approval and passes reconciliation', () => {
    const cur = transform(ds, approveAll(fixes), approveMappings(['M-046', 'M-050']));
    const curFailures = validate(cur);
    const dq = dqSnapshot(ds, failures, cur, curFailures);
    expect(dq.overallAfter).toBeGreaterThan(dq.overallBefore);
    expect(dq.overallAfter).toBeGreaterThan(0.99);
    const checks = reconcile(ds, cur, runObjects(ds, cur, curFailures, { history: 0, attrs: 0 }), curFailures);
    expect(checks.filter((c) => c.outcome === 'fail')).toEqual([]);
  });
  it('does not change the source dataset', () => {
    const before = JSON.stringify(ds);
    transform(ds, approveAll(fixes), approveMappings(['M-046', 'M-050']));
    expect(JSON.stringify(ds)).toBe(before);
  });
});
