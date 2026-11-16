// Small helpers shared by the Excel/CSV imports and exports (menu, inventory).
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

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
    // Some apps (openpyxl-based converters, Google Sheets exports, ...) write
    // cell comments in a layout exceljs crashes on. Imports never need the
    // comments, so drop them and try once more before giving up.
    try {
      const cleaned = await withoutComments(buf);
      await wb.xlsx.load(cleaned as unknown as ArrayBuffer);
    } catch {
      throw new Error(
        'That file could not be read. Upload the .xlsx template (or a .csv) — older .xls files need to be saved as .xlsx first.',
      );
    }
  }
  const ws =
    wb.getWorksheet(preferredSheet) ??
    wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) throw new Error('The file has no sheets with data.');
  return ws;
}

/**
 * The same .xlsx without its cell comments (notes): the comment parts, their
 * VML drawings, the sheet links to them and their content-type entries.
 * Cell values are untouched.
 */
export async function withoutComments(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const isCommentPart = (path: string) =>
    /^xl\/comments[^/]*\.xml$/i.test(path) ||
    /^xl\/drawings\/[^/]*\.vml$/i.test(path);
  for (const path of Object.keys(zip.files)) {
    if (isCommentPart(path)) zip.remove(path);
  }
  const relsPaths = Object.keys(zip.files).filter((p) =>
    /^xl\/worksheets\/_rels\/[^/]+\.xml\.rels$/i.test(p),
  );
  for (const relsPath of relsPaths) {
    const rels = await zip.file(relsPath)!.async('string');
    const dropped: string[] = [];
    const kept = rels.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
      if (!/relationships\/(comments|vmlDrawing)"/.test(rel)) return rel;
      const id = /\bId="([^"]+)"/.exec(rel)?.[1];
      if (id) dropped.push(id);
      return '';
    });
    if (!dropped.length) continue;
    zip.file(relsPath, kept);
    // xl/worksheets/_rels/sheet1.xml.rels -> xl/worksheets/sheet1.xml
    const sheetPath = relsPath.replace('_rels/', '').replace(/\.rels$/, '');
    const sheet = await zip.file(sheetPath)?.async('string');
    if (sheet) {
      zip.file(
        sheetPath,
        sheet.replace(/<legacyDrawing\b[^>]*\/>/g, (el) =>
          dropped.some((id) => el.includes(`"${id}"`)) ? '' : el,
        ),
      );
    }
  }
  const types = await zip.file('[Content_Types].xml')?.async('string');
  if (types) {
    zip.file(
      '[Content_Types].xml',
      types.replace(/<Override\b[^>]*\/>/g, (o) => {
        const part = /PartName="\/?([^"]+)"/.exec(o)?.[1];
        return part && isCommentPart(part) ? '' : o;
      }),
    );
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}
