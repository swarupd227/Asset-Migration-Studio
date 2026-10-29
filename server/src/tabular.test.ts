import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { cellText, ExtractError, formatOf, readExtract } from './tabular.js';
import { toRecords } from './extracts.js';

async function workbook(sheets: Record<string, unknown[][]>, hidden: string[] = []) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name, { state: hidden.includes(name) ? 'hidden' : 'visible' });
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('extract formats', () => {
  it('recognises CSV, Excel and Parquet by extension', () => {
    expect(formatOf('ASSET.csv')).toBe('csv');
    expect(formatOf('Maximo export.XLSX')).toBe('xlsx');
    expect(formatOf('workorder.parquet')).toBe('parquet');
    expect(formatOf('old.xls')).toBeNull();
  });

  it('writes values as the CSV path would', () => {
    expect(cellText(new Date(Date.UTC(2024, 2, 5)))).toBe('2024-03-05');
    expect(cellText(new Date(Date.UTC(2024, 2, 5, 14, 30)))).toBe('2024-03-05T14:30:00');
    expect(cellText(12345678901234567890n)).toBe('12345678901234567890');
    expect(cellText({ formula: 'A1*2', result: 42 })).toBe('42');
    expect(cellText({ richText: [{ text: 'Pump ' }, { text: 'P-1' }] })).toBe('Pump P-1');
    expect(cellText(null)).toBe('');
  });

  it('reads every visible sheet of a workbook as its own table', async () => {
    const buf = await workbook({
      ASSET: [['ASSETNUM', 'DESCRIPTION', 'SITEID', 'INSTALLDATE', 'TOTALCOST'], ['PU-1', 'Raw water pump', 'RIVR', new Date(Date.UTC(2019, 5, 1)), 1250.5], [], ['PU-2', 'Booster pump', 'RIVR', null, { formula: '1+1', result: 2 }]],
      LOCATIONS: [['LOCATION', 'DESCRIPTION', 'TYPE'], ['RIVR', 'Riverside', 'SITE']],
      Notes: [['Exported 2024-06-01']],
      Lookup: [['CODE'], ['A']],
    }, ['Lookup']);
    const tables = await readExtract('maximo.xlsx', buf);
    expect(tables.map((t) => t.sheet)).toEqual(['ASSET', 'LOCATIONS']);
    expect(tables[0].header).toEqual(['ASSETNUM', 'DESCRIPTION', 'SITEID', 'INSTALLDATE', 'TOTALCOST']);
    expect(tables[0].rows).toEqual([['PU-1', 'Raw water pump', 'RIVR', '2019-06-01', '1250.5'], ['PU-2', 'Booster pump', 'RIVR', '', '2']]);
    const records = toRecords('ASSET', tables[0].header, tables[0].rows);
    expect(records.map((r) => r.key)).toEqual(['PU-1', 'PU-2']);
  });

  it('reads Parquet with dates and 64-bit integers', async () => {
    const ab = parquetWriteBuffer({
      columnData: [
        { name: 'WONUM', data: ['WO-1', 'WO-2'], type: 'STRING' },
        { name: 'DESCRIPTION', data: ['Pump tripped on start', null], type: 'STRING' },
        { name: 'REPORTDATE', data: [new Date(Date.UTC(2023, 0, 9, 8, 15)), new Date(Date.UTC(2023, 0, 10))], type: 'TIMESTAMP' },
        { name: 'ESTDUR', data: [3n, 12n], type: 'INT64' },
      ],
    });
    const [t] = await readExtract('WORKORDER.parquet', Buffer.from(ab));
    expect(t.header).toEqual(['WONUM', 'DESCRIPTION', 'REPORTDATE', 'ESTDUR']);
    expect(t.rows).toEqual([['WO-1', 'Pump tripped on start', '2023-01-09T08:15:00', '3'], ['WO-2', '', '2023-01-10', '12']]);
  });

  it('rejects files that are not what their extension says', async () => {
    await expect(readExtract('ASSET.xlsx', Buffer.from('ASSETNUM,DESCRIPTION\nPU-1,Pump'))).rejects.toBeInstanceOf(ExtractError);
    await expect(readExtract('ASSET.parquet', Buffer.from('not parquet'))).rejects.toBeInstanceOf(ExtractError);
  });

  it('reads CSV as before', async () => {
    const [t] = await readExtract('PM.csv', Buffer.from('﻿PMNUM;DESCRIPTION\r\nPM-1;"Quarterly; check"\r\n'));
    expect(t.header).toEqual(['PMNUM', 'DESCRIPTION']);
    expect(t.rows).toEqual([['PM-1', 'Quarterly; check']]);
  });
});
