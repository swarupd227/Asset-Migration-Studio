import { describe, expect, it } from 'vitest';
import { catalogueEntry, impliedSites, parseCsv, tableFromFilename, toRecords } from './extracts.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and CRLF', () => {
    const rows = parseCsv('A,B,C\r\n"x, y","he said ""hi""",3\r\n\r\nlast,,\n');
    expect(rows).toEqual([['A', 'B', 'C'], ['x, y', 'he said "hi"', '3'], ['last', '', '']]);
  });
  it('detects semicolon-separated files', () => {
    expect(parseCsv('A;B\n1;2')).toEqual([['A', 'B'], ['1', '2']]);
  });
  it('strips a UTF-8 byte order mark', () => {
    expect(parseCsv('﻿ASSETNUM\nP-1')[0][0]).toBe('ASSETNUM');
  });
});

describe('extract loading', () => {
  const header = ['ASSETNUM', 'DESCRIPTION', 'SITEID', 'LOCATION', 'CLASSSTRUCTUREID', 'SERIALNUM', 'RATEDFLOW', 'CST_ZONE'];
  const rows = [['P-1', 'Lift pump 1', 'CST', 'CST-P1', 'PUMP\\CENTRIFUGAL', 'KS-1', '320', 'Z1'], ['P-2', 'Lift pump 2', 'CST', 'CST-P2', '', 'KS-2', '', 'Z2']];

  it('maps file names to tables', () => {
    expect(tableFromFilename('ASSET.csv')).toBe('ASSET');
    expect(tableFromFilename('locations_2026.csv')).toBe('LOCATIONS');
    expect(tableFromFilename('workorder.csv')).toBe('WORKORDER');
  });
  it('converts asset rows and keeps non-standard numeric columns as attributes', () => {
    const recs = toRecords('ASSET', header, rows);
    expect(recs).toHaveLength(2);
    const a = recs[0].data as { specs: Record<string, unknown>; classstructure?: string };
    expect(a.specs.RATEDFLOW).toBe(320);
    expect((recs[1].data as { classstructure?: string }).classstructure).toBeUndefined();
  });
  it('profiles columns and marks customer extensions', () => {
    const t = catalogueEntry('ASSET', header, rows);
    const f = (n: string) => t.fields.find((x) => x.name === n)!;
    expect(f('CST_ZONE').custom).toBe(true);
    expect(f('SERIALNUM').custom).toBe(false);
    expect(f('CLASSSTRUCTUREID').nullRate).toBe(50);
  });
  it('creates site locations implied by SITEID', () => {
    const sites = impliedSites(toRecords('ASSET', header, rows), new Set());
    expect(sites.map((s) => s.key)).toEqual(['CST']);
  });
});
