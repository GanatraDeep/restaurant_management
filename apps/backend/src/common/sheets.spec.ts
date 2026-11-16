import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { loadSheet } from './sheets';

/**
 * A sheet with header notes, re-saved the way openpyxl writes it: the
 * comment links use absolute paths ("/xl/comments1.xml"), which exceljs
 * crashes on while reading.
 */
async function openpyxlStyleSheet(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Menu');
  ws.addRow(['Category', 'Item name', 'Price']);
  ws.addRow(['Starters', 'Boil Fry', 40]);
  ws.getCell('A1').note = 'Created automatically if new.';
  const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));
  for (const path of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/_rels\/.+\.rels$/.test(path)) continue;
    const rels = await zip.file(path)!.async('string');
    zip.file(path, rels.replace(/Target="\.\.\/([^"]+)"/g, 'Target="/xl/$1"'));
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('loadSheet', () => {
  it('reads a file whose cell comments exceljs cannot parse', async () => {
    const buf = await openpyxlStyleSheet();
    // The library on its own still fails on this file...
    await expect(
      new ExcelJS.Workbook().xlsx.load(buf as unknown as ArrayBuffer),
    ).rejects.toThrow();
    // ...but the import reads it, values intact.
    const ws = await loadSheet(buf, 'menu.xlsx', 'Menu');
    expect(ws.getRow(2).values).toEqual([
      undefined,
      'Starters',
      'Boil Fry',
      40,
    ]);
  });

  it('still says so for a file that is not a spreadsheet', async () => {
    await expect(
      loadSheet(Buffer.from('not a zip'), 'menu.xlsx', 'Menu'),
    ).rejects.toThrow('That file could not be read');
  });
});
