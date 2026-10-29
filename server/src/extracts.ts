import type { CatalogueField, CatalogueTable, SourceAsset, SourceLocation, SourcePm, SourceWorkOrder } from './types.js';

// Flat-file extracts (CSV with a header row). Each upload is profiled column by column and, for the
// tables the platform understands, converted into source records.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  const delim = (s.split('\n', 1)[0].match(/;/g)?.length ?? 0) > (s.split('\n', 1)[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const pattern = (v: string) => v.replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/\d/g, '9');

function inferType(values: string[]) {
  const vs = values.filter(Boolean);
  if (!vs.length) return 'ALN';
  if (vs.every((v) => /^-?\d+$/.test(v))) return 'INTEGER';
  if (vs.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'DECIMAL';
  if (vs.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return vs.some((v) => v.length > 10) ? 'DATETIME' : 'DATE';
  if (vs.every((v) => v === v.toUpperCase())) return 'UPPER';
  return 'ALN';
}

/** Profiles every column: type, null rate, distinct count, top values and dominant pattern. */
export function profile(header: string[], rows: string[][], standardFields: Set<string>): CatalogueField[] {
  return header.map((name, ci) => {
    const values = rows.map((r) => (r[ci] ?? '').trim());
    const filled = values.filter(Boolean);
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v || '(null)', (counts.get(v || '(null)') ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, n]) => ({ value, pct: Math.round((n / Math.max(1, values.length)) * 1000) / 10 }));
    const pats = new Map<string, number>();
    for (const v of filled.slice(0, 2000)) pats.set(pattern(v), (pats.get(pattern(v)) ?? 0) + 1);
    const [topPat, patN] = [...pats.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const distinct = new Set(filled).size;
    return {
      name: name.toUpperCase(),
      type: inferType(filled.slice(0, 500)),
      length: Math.max(0, ...filled.map((v) => v.length)),
      description: '',
      nullRate: Math.round(((values.length - filled.length) / Math.max(1, values.length)) * 1000) / 10,
      distinct,
      topValues: distinct <= 50 ? top : [],
      pattern: topPat && patN / Math.max(1, filled.length) > 0.6 && topPat.length <= 24 ? `${topPat} (${Math.round((patN / filled.length) * 100)}%)` : undefined,
      custom: !standardFields.has(name.toUpperCase()),
    } satisfies CatalogueField;
  });
}

// Standard Maximo columns per table; anything else is treated as a customer extension.
export const MAXIMO_STANDARD: Record<string, string[]> = {
  ASSET: ['ASSETNUM', 'DESCRIPTION', 'SITEID', 'LOCATION', 'PARENT', 'CLASSSTRUCTUREID', 'MANUFACTURER', 'MODELNUM', 'SERIALNUM', 'STATUS', 'STATUSDATE', 'INSTALLDATE', 'PRIORITY', 'ASSETTYPE', 'VENDOR', 'TOTALCOST', 'CHANGEBY', 'CHANGEDATE', 'ORGID'],
  LOCATIONS: ['LOCATION', 'DESCRIPTION', 'SITEID', 'PARENT', 'TYPE', 'STATUS', 'ORGID', 'CHANGEBY', 'CHANGEDATE'],
  WORKORDER: ['WONUM', 'DESCRIPTION', 'SITEID', 'ASSETNUM', 'LOCATION', 'STATUS', 'WORKTYPE', 'WOPRIORITY', 'REPORTDATE', 'FAILURECODE', 'PROBLEMCODE', 'CAUSECODE', 'TARGSTARTDATE', 'ORGID'],
  PM: ['PMNUM', 'DESCRIPTION', 'SITEID', 'ASSETNUM', 'LOCATION', 'FREQUENCY', 'FREQUNIT', 'JPNUM', 'STATUS', 'ORGID'],
};
const IFS_TARGET: Record<string, string> = { ASSET: 'EquipmentSerial', LOCATIONS: 'EquipmentFunctional', WORKORDER: 'WorkOrder', PM: 'PmAction' };

export function tableFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (/^ASSETS?$/.test(base) || base.includes('ASSET')) return 'ASSET';
  if (base.startsWith('LOCATION')) return 'LOCATIONS';
  if (base.startsWith('WORKORDER') || base === 'WO') return 'WORKORDER';
  if (base === 'PM' || base.startsWith('PM_') || base.startsWith('PMS')) return 'PM';
  return base;
}

type Row = Record<string, string>;
const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function toRecords(table: string, header: string[], rows: string[][]) {
  const objs: Row[] = rows.map((r) => Object.fromEntries(header.map((h, i) => [h.toUpperCase(), (r[i] ?? '').trim()])));
  const out: { kind: string; key: string; data: unknown }[] = [];
  if (table === 'ASSET') {
    for (const o of objs) {
      if (!o.ASSETNUM) continue;
      const known = new Set(MAXIMO_STANDARD.ASSET);
      const specs = Object.fromEntries(Object.entries(o).filter(([k, v]) => !known.has(k) && !k.startsWith('NV_') && v !== '').map(([k, v]) => [k, num(v) ?? v]));
      const a: SourceAsset = {
        assetnum: o.ASSETNUM, description: o.DESCRIPTION ?? '', siteid: o.SITEID ?? '', location: o.LOCATION ?? '', parent: o.PARENT || undefined,
        classstructure: o.CLASSSTRUCTUREID || undefined, manufacturer: o.MANUFACTURER || undefined, model: o.MODELNUM || undefined, serialnum: o.SERIALNUM || undefined,
        status: (o.STATUS as SourceAsset['status']) || 'OPERATING', statusDate: (o.STATUSDATE || '').slice(0, 10), installDate: (o.INSTALLDATE || '').slice(0, 10),
        criticality: Math.min(5, Math.max(1, num(o.NV_CRITCODE ?? o.PRIORITY) ?? 3)), specs,
      };
      out.push({ kind: 'asset', key: a.assetnum, data: a });
    }
  } else if (table === 'LOCATIONS') {
    for (const o of objs) {
      if (!o.LOCATION) continue;
      const type = (o.TYPE || 'OPERATING').toUpperCase() as SourceLocation['type'];
      const l: SourceLocation = { location: o.LOCATION, description: o.DESCRIPTION ?? '', siteid: o.SITEID ?? '', parent: o.PARENT || undefined, type, conceptId: type === 'SITE' ? 'core:Site' : type === 'SYSTEM' ? 'util:ProcessSystem' : 'core:FunctionalLocation' };
      out.push({ kind: 'location', key: l.location, data: l });
    }
  } else if (table === 'WORKORDER') {
    for (const o of objs) {
      if (!o.WONUM) continue;
      const w: SourceWorkOrder = { wonum: o.WONUM, description: o.DESCRIPTION ?? '', siteid: o.SITEID ?? '', assetnum: o.ASSETNUM || undefined, location: o.LOCATION || undefined, status: o.STATUS ?? '', worktype: o.WORKTYPE ?? '', wopriority: num(o.WOPRIORITY) ?? 3, reportdate: (o.REPORTDATE || '').slice(0, 10), failurecode: o.FAILURECODE || undefined, causecode: o.CAUSECODE || undefined };
      out.push({ kind: 'workorder', key: w.wonum, data: w });
    }
  } else if (table === 'PM') {
    for (const o of objs) {
      if (!o.PMNUM) continue;
      const p: SourcePm = { pmnum: o.PMNUM, description: o.DESCRIPTION ?? '', siteid: o.SITEID ?? '', assetnum: o.ASSETNUM ?? '', frequency: num(o.FREQUENCY) ?? 0, frequnit: ((o.FREQUNIT || 'MONTHS').toUpperCase() as SourcePm['frequnit']), jpnum: o.JPNUM || undefined };
      out.push({ kind: 'pm', key: p.pmnum, data: p });
    }
  }
  return out;
}

/** Site locations implied by SITEID values that are not present as locations. */
export function impliedSites(records: { kind: string; data: unknown }[], existing: Set<string>) {
  const sites = new Set<string>();
  for (const r of records) {
    const site = (r.data as { siteid?: string }).siteid;
    if (site && !existing.has(site)) sites.add(site);
  }
  return [...sites].map((s) => ({ kind: 'location', key: s, data: { location: s, description: s, siteid: s, type: 'SITE', conceptId: 'core:Site' } satisfies SourceLocation }));
}

export function catalogueEntry(table: string, header: string[], rows: string[][]): CatalogueTable {
  const std = MAXIMO_STANDARD[table];
  const fields = profile(header, rows, new Set(std ?? header.map((h) => h.toUpperCase())));
  return { name: table, description: std ? `${table.charAt(0)}${table.slice(1).toLowerCase()} extract` : 'Custom table', rows: rows.length, fields, custom: !std, inScope: true, ifsTarget: IFS_TARGET[table] };
}
