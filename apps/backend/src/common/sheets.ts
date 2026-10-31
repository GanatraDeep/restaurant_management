// Small helpers shared by the Excel/CSV imports and exports (menu, inventory).
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

const FORMULA_START = /^[=+\-@\t\r]/;

/** Spreadsheet-injection guard, as in the report exports: text never starts a formula. */
export const safeCell = (v: string | null | undefined) =>
  v == null || v === '' ? null : FORMULA_START.test(v) ? `'${v}` : v;

/** Heading text compared loosely: case, "*", ":" and spacing don't matter. */
export const normHeading = (s: string) =>
  s.toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();

/** Any cell (rich text, formula, hyperlink, date…) as plain text. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v)
      return v.richText
        .map((t) => t.text)
        .join('')
        .trim();
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return String(v.text).trim();
    if ('error' in v) return '';
  }
  return '';
}

/** "₹ 1,299.50", "Rs.249", "249/-", "5%" → the number; "" → null; junk → NaN. */
export function parseNumber(s: string): number | null {
  const cleaned = s.replace(/(rs\.?|inr|₹|\/-|%|,|\s)/gi, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Opens an uploaded .xlsx (preferring the named sheet) or .csv. */
export async function loadSheet(
  buf: Buffer,
  fileName: string,
  preferredSheet: string,
): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    return wb.csv.read(Readable.from(buf));
  }
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new Error(
      'That file could not be read. Upload the .xlsx template (or a .csv) — older .xls files need to be saved as .xlsx first.',
    );
  }
  const ws =
    wb.getWorksheet(preferredSheet) ??
    wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) throw new Error('The file has no sheets with data.');
  return ws;
}
