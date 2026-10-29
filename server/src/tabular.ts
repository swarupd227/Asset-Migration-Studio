import ExcelJS from 'exceljs';
import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { parseCsv } from './extracts.js';

// Reads uploaded extracts into header + rows of text, whatever the file format: CSV, Excel
// workbooks (every non-empty sheet is a table) and Parquet. Values are normalised to the text the
// CSV path produces, so profiling and record loading behave the same for every format.

export interface SheetTable { sheet?: string; header: string[]; rows: string[][] }
export type ExtractFormat = 'csv' | 'xlsx' | 'parquet';

export const MAX_ROWS = 1_000_000;

export class ExtractError extends Error {}

export function formatOf(filename: string): ExtractFormat | null {
  if (/\.(csv|txt)$/i.test(filename)) return 'csv';
  if (/\.xlsx$/i.test(filename)) return 'xlsx';
  if (/\.parquet$/i.test(filename)) return 'parquet';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Dates without a time part are written as dates; others as ISO date-times (UTC, no milliseconds). */
function dateText(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() ? `${day}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : day;
}

/** Text of one value from Excel or Parquet. */
export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return dateText(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString('utf8');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Excel: formulas keep their last result, rich text is joined, hyperlinks keep their text.
    if ('result' in o) return cellText(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('');
    if ('text' in o) return cellText(o.text);
    if ('error' in o) return '';
    return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
  }
  return String(v);
}

/** Drops trailing empty columns and fully empty rows; the first remaining row is the header. */
function tidy(grid: string[][]): { header: string[]; rows: string[][] } | null {
  const rows = grid.filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => { let w = r.length; while (w > 0 && r[w - 1].trim() === '') w--; return w; }));
  const [header, ...data] = rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim()));
  return { header, rows: data };
}

async function readXlsx(buf: Buffer): Promise<SheetTable[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ExtractError('The file is not a readable Excel workbook (.xlsx). Older .xls files need to be saved as .xlsx first.');
  }
  const out: SheetTable[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state !== 'visible') continue;
    if (ws.rowCount > MAX_ROWS + 1) throw new ExtractError(`Sheet "${ws.name}" has more than ${MAX_ROWS.toLocaleString('en-GB')} rows; split it or use Parquet`);
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      // row.values is 1-based; index 0 is unused.
      (row.values as unknown[]).slice(1).forEach((v, i) => { cells[i] = cellText(v); });
      grid.push(Array.from(cells, (c) => c ?? ''));
    });
    const t = tidy(grid);
    if (t && t.rows.length) out.push({ sheet: ws.name, ...t });
  }
  return out;
}

async function readParquet(buf: Buffer): Promise<SheetTable[]> {
  const file = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  let header: string[];
  try {
    const metadata = parquetMetadata(file);
    if (Number(metadata.num_rows) > MAX_ROWS) throw new ExtractError(`The file has more than ${MAX_ROWS.toLocaleString('en-GB')} rows; split it by site or date`);
    header = parquetSchema(metadata).children.map((c) => c.element.name);
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError('The file is not a readable Parquet file');
  }
  const objects = await parquetReadObjects({ file, compressors });
  return [{ header, rows: objects.map((o) => header.map((h) => cellText(o[h]).trim())) }];
}

/** Reads an uploaded extract into one table per sheet (Excel) or one table (CSV, Parquet). */
export async function readExtract(filename: string, buf: Buffer): Promise<SheetTable[]> {
  const format = formatOf(filename);
  if (format === 'xlsx') return readXlsx(buf);
  if (format === 'parquet') return readParquet(buf);
  if (format === 'csv') {
    const rows = parseCsv(buf.toString('utf8'));
    if (rows.length > MAX_ROWS + 1) throw new ExtractError(`The file has more than ${MAX_ROWS.toLocaleString('en-GB')} rows; split it or use Parquet`);
    const t = tidy(rows);
    return t && t.rows.length ? [t] : [];
  }
  throw new ExtractError('Upload CSV, Excel (.xlsx) or Parquet files with a header row');
}
