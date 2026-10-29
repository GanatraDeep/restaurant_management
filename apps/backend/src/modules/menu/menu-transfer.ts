// Menu bulk import / export: the Excel template, parsing an uploaded sheet,
// working out what it would change, and the shareable PDF catalogue.
// Everything here is pure (no database) so it can be unit tested; the
// service loads the branch's current menu, calls planMenuImport and applies
// the result in one transaction.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type SpiceLevel = 'NONE' | 'MILD' | 'MEDIUM' | 'HOT' | 'EXTRA_HOT';

const SPICE_LABELS: Record<SpiceLevel, string> = {
  NONE: 'None',
  MILD: 'Mild',
  MEDIUM: 'Medium',
  HOT: 'Hot',
  EXTRA_HOT: 'Extra hot',
};

type ColumnKey =
  | 'category'
  | 'name'
  | 'price'
  | 'halfPrice'
  | 'taxRatePercent'
  | 'isVeg'
  | 'description'
  | 'sku'
  | 'barcode'
  | 'costPrice'
  | 'prepTimeMinutes'
  | 'spiceLevel'
  | 'station'
  | 'isActive';

interface Column {
  key: ColumnKey;
  header: string;
  /** Other headings accepted on import (lower-cased, spaces collapsed). */
  aliases: string[];
  width: number;
  required?: boolean;
  help: string;
}

export const MENU_COLUMNS: Column[] = [
  {
    key: 'category',
    header: 'Category',
    aliases: ['category name', 'section'],
    width: 20,
    required: true,
    help: 'Created automatically if it does not exist yet.',
  },
  {
    key: 'name',
    header: 'Item name',
    aliases: ['item', 'name', 'dish', 'product'],
    width: 30,
    required: true,
    help: 'Items are matched by SKU if given, otherwise by name — a matching item is updated, anything new is added.',
  },
  {
    key: 'price',
    header: 'Price',
    aliases: ['full price', 'selling price', 'mrp', 'rate'],
    width: 10,
    required: true,
    help: 'Selling price including tax, numbers only (e.g. 249 or 249.50).',
  },
  {
    key: 'halfPrice',
    header: 'Half price',
    aliases: ['half'],
    width: 11,
    help: 'Optional. Fill it to offer a half portion.',
  },
  {
    key: 'taxRatePercent',
    header: 'Tax %',
    aliases: ['tax', 'gst', 'gst %', 'tax rate'],
    width: 8,
    help: 'GST included in the price, e.g. 5. Defaults to 0.',
  },
  {
    key: 'isVeg',
    header: 'Veg',
    aliases: ['veg/non-veg', 'veg / non-veg', 'type', 'is veg'],
    width: 10,
    help: 'Yes for veg, No for non-veg. Defaults to Yes.',
  },
  {
    key: 'description',
    header: 'Description',
    aliases: ['details'],
    width: 40,
    help: 'Optional. Shown on the QR menu and the catalogue.',
  },
  {
    key: 'sku',
    header: 'SKU',
    aliases: ['code', 'item code'],
    width: 12,
    help: 'Optional short code. Give each item its own.',
  },
  {
    key: 'barcode',
    header: 'Barcode',
    aliases: [],
    width: 14,
    help: 'Optional.',
  },
  {
    key: 'costPrice',
    header: 'Cost price',
    aliases: ['cost'],
    width: 11,
    help: 'Optional, for profit reports. Never shown to guests.',
  },
  {
    key: 'prepTimeMinutes',
    header: 'Prep time (min)',
    aliases: ['prep time', 'prep minutes'],
    width: 15,
    help: 'Optional, whole minutes.',
  },
  {
    key: 'spiceLevel',
    header: 'Spice level',
    aliases: ['spice'],
    width: 12,
    help: 'None, Mild, Medium, Hot or Extra hot.',
  },
  {
    key: 'station',
    header: 'Kitchen station',
    aliases: ['station', 'kitchen'],
    width: 16,
    help: 'Optional, e.g. Tandoor or Bar. Created if new.',
  },
  {
    key: 'isActive',
    header: 'Available',
    aliases: ['active', 'in stock', 'status'],
    width: 11,
    help: 'No hides the item from billing and the QR menu. Defaults to Yes.',
  },
];

export const MAX_IMPORT_ROWS = 3000;

/** One menu item as it appears in a sheet (export) or was read from one. */
export interface MenuRow {
  category: string;
  name: string;
  price: number;
  halfPrice?: number | null;
  taxRatePercent?: number;
  isVeg?: boolean;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  costPrice?: number | null;
  prepTimeMinutes?: number | null;
  spiceLevel?: SpiceLevel;
  station?: string | null;
  isActive?: boolean;
}

export interface ParsedRow extends MenuRow {
  /** Spreadsheet row number, for error messages. */
  row: number;
}

export interface RowError {
  row: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const FORMULA_START = /^[=+\-@\t\r]/;
// Same spreadsheet-injection guard as the report exports.
const safe = (v: string | null | undefined) =>
  v == null || v === '' ? null : FORMULA_START.test(v) ? `'${v}` : v;
const yesNo = (v: boolean | undefined) => (v === false ? 'No' : 'Yes');

export async function buildMenuWorkbook(
  rows: MenuRow[],
  opts: { restaurantName: string; example?: boolean },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'F Cartel';
  const ws = wb.addWorksheet('Menu');
  ws.columns = MENU_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((cell, i) => {
    const col = MENU_COLUMNS[i - 1];
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col.required ? 'FFC0283A' : 'FF444444' },
    };
    cell.note = col.help;
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const sample: MenuRow[] = opts.example
    ? [
        {
          category: 'Starters',
          name: 'Paneer Tikka',
          price: 249,
          halfPrice: 149,
          taxRatePercent: 5,
          isVeg: true,
          description:
            'Cottage cheese marinated in spiced yoghurt, grilled in the tandoor',
          sku: 'ST01',
          spiceLevel: 'MEDIUM',
          station: 'Tandoor',
          isActive: true,
        },
        {
          category: 'Starters',
          name: 'Chicken 65',
          price: 289,
          taxRatePercent: 5,
          isVeg: false,
          sku: 'ST02',
          spiceLevel: 'HOT',
          isActive: true,
        },
        {
          category: 'Beverages',
          name: 'Masala Chaas',
          price: 60,
          taxRatePercent: 5,
          isVeg: true,
          sku: 'BV01',
          station: 'Bar',
          isActive: true,
        },
      ]
    : rows;
  for (const r of sample) {
    ws.addRow({
      category: safe(r.category),
      name: safe(r.name),
      price: r.price,
      halfPrice: r.halfPrice ?? null,
      taxRatePercent: r.taxRatePercent ?? 0,
      isVeg: yesNo(r.isVeg),
      description: safe(r.description),
      sku: safe(r.sku),
      barcode: safe(r.barcode),
      costPrice: r.costPrice ?? null,
      prepTimeMinutes: r.prepTimeMinutes ?? null,
      spiceLevel: SPICE_LABELS[r.spiceLevel ?? 'NONE'],
      station: safe(r.station),
      isActive: yesNo(r.isActive),
    });
  }

  // Drop-downs for the fixed-choice columns, far enough down for a big menu.
  const last = Math.max(500, sample.length + 200);
  const colLetter = (key: ColumnKey) =>
    String.fromCharCode(65 + MENU_COLUMNS.findIndex((c) => c.key === key));
  // Range validations exist in exceljs but are missing from its typings.
  const validations = (
    ws as unknown as {
      dataValidations: { add(range: string, v: ExcelJS.DataValidation): void };
    }
  ).dataValidations;
  const list = (key: ColumnKey, values: string[]) =>
    validations.add(`${colLetter(key)}2:${colLetter(key)}${last}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${values.join(',')}"`],
    });
  list('isVeg', ['Yes', 'No']);
  list('isActive', ['Yes', 'No']);
  list('spiceLevel', Object.values(SPICE_LABELS));
  for (const key of ['price', 'halfPrice', 'costPrice'] as const) {
    ws.getColumn(key).numFmt = '0.00';
  }

  const help = wb.addWorksheet('How to fill');
  help.columns = [
    { header: 'Column', key: 'c', width: 18 },
    { header: 'Required', key: 'r', width: 10 },
    { header: 'What to enter', key: 'h', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of MENU_COLUMNS) {
    help.addRow({ c: c.header, r: c.required ? 'Yes' : '', h: c.help });
  }
  help.addRow({});
  for (const line of [
    `Menu for ${opts.restaurantName}. Keep one item per row on the "Menu" sheet and leave the heading row as it is.`,
    'Categories are created in the order they first appear. Existing items not in the sheet are left untouched — nothing is deleted.',
    'When updating an existing item, an empty cell keeps its current value.',
    'Upload it from Menu → Import / Export → Import from Excel. You will see a preview before anything is saved.',
  ]) {
    help.addRow({ c: '', r: '', h: line });
  }
  help.getColumn('h').alignment = { wrapText: true, vertical: 'top' };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s.toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();

function cellText(v: ExcelJS.CellValue): string {
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

function parseNumber(s: string): number | null {
  // "₹ 1,299.50", "Rs.249", "249/-", "5%" all mean what they say.
  const cleaned = s.replace(/(rs\.?|inr|₹|\/-|%|,|\s)/gi, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseBool(
  s: string,
  yes: RegExp,
  no: RegExp,
): boolean | null | undefined {
  if (s === '') return undefined;
  const v = s.toLowerCase().trim();
  if (no.test(v)) return false;
  if (yes.test(v)) return true;
  return null;
}
const parseYesNo = (s: string) =>
  parseBool(
    s,
    /^(y|yes|true|1|active|available|in stock|on)$/,
    /^(n|no|false|0|inactive|unavailable|out of stock|off|hidden)$/,
  );
const parseVeg = (s: string) =>
  parseBool(
    s,
    /^(y|yes|true|1|veg|vegetarian|v|green)$/,
    /^(n|no|false|0|non[- ]?veg|nonveg|non[- ]?vegetarian|nv|egg|red)$/,
  );

function parseSpice(s: string): SpiceLevel | null | undefined {
  if (s === '') return undefined;
  const v = norm(s).replace(/[_-]/g, ' ');
  const hit = (Object.entries(SPICE_LABELS) as [SpiceLevel, string][]).find(
    ([key, label]) =>
      norm(label) === v || key.toLowerCase().replace('_', ' ') === v,
  );
  if (hit) return hit[0];
  if (v === 'no' || v === 'not spicy' || v === '0') return 'NONE';
  if (v === 'very hot' || v === 'extra spicy') return 'EXTRA_HOT';
  if (v === 'spicy') return 'HOT';
  return null;
}

async function loadSheet(
  buf: Buffer,
  fileName: string,
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
    wb.getWorksheet('Menu') ?? wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) throw new Error('The file has no sheets with data.');
  return ws;
}

export async function parseMenuFile(
  buf: Buffer,
  fileName: string,
): Promise<{ rows: ParsedRow[]; errors: RowError[] }> {
  const ws = await loadSheet(buf, fileName);

  // Find the heading row (the first row that names both Category and Item name)
  // so a title line or two above the table doesn't matter.
  let headRow = 0;
  const colOf = new Map<ColumnKey, number>();
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headRow; r++) {
    const found = new Map<ColumnKey, number>();
    ws.getRow(r).eachCell((cell, c) => {
      const h = norm(cellText(cell.value));
      const col = MENU_COLUMNS.find(
        (m) => norm(m.header) === h || m.aliases.includes(h),
      );
      if (col && !found.has(col.key)) found.set(col.key, c);
    });
    if (found.has('category') && found.has('name')) {
      headRow = r;
      found.forEach((v, k) => colOf.set(k, v));
    }
  }
  if (!headRow) {
    throw new Error(
      'Could not find the heading row. The sheet needs at least "Category", "Item name" and "Price" columns — download the template to start from.',
    );
  }
  if (!colOf.has('price')) throw new Error('The sheet has no "Price" column.');

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  for (let r = headRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: ColumnKey) => {
      const c = colOf.get(k);
      return c ? cellText(row.getCell(c).value) : '';
    };
    const category = get('category');
    const name = get('name');
    const priceText = get('price');
    if (!category && !name && !priceText) continue; // blank line

    if (rows.length + errors.length >= MAX_IMPORT_ROWS) {
      errors.push({
        row: r,
        message: `Only ${MAX_IMPORT_ROWS} items can be imported at once — split the file.`,
      });
      break;
    }
    const problems: string[] = [];
    if (!category) problems.push('Category is empty');
    if (!name) problems.push('Item name is empty');
    if (name.length > 120)
      problems.push('Item name is longer than 120 characters');
    if (category.length > 60)
      problems.push('Category is longer than 60 characters');

    const num = (
      k: ColumnKey,
      label: string,
      opts: { int?: boolean; max?: number } = {},
    ) => {
      const n = parseNumber(get(k));
      if (n === null) return null;
      if (
        Number.isNaN(n) ||
        n < 0 ||
        (opts.max !== undefined && n > opts.max) ||
        (opts.int && !Number.isInteger(n))
      ) {
        problems.push(
          `${label} "${get(k)}" is not a valid ${opts.int ? 'whole number' : 'number'}`,
        );
        return null;
      }
      return opts.int ? n : Math.round(n * 100) / 100;
    };
    const price = num('price', 'Price');
    if (price === null && !problems.some((p) => p.startsWith('Price')))
      problems.push('Price is empty');
    const halfPrice = num('halfPrice', 'Half price');
    const taxRatePercent = num('taxRatePercent', 'Tax %', { max: 100 });
    const costPrice = num('costPrice', 'Cost price');
    const prepTimeMinutes = num('prepTimeMinutes', 'Prep time', {
      int: true,
      max: 1440,
    });

    const isVeg = parseVeg(get('isVeg'));
    if (isVeg === null)
      problems.push(`Veg should be Yes or No, not "${get('isVeg')}"`);
    const isActive = parseYesNo(get('isActive'));
    if (isActive === null)
      problems.push(`Available should be Yes or No, not "${get('isActive')}"`);
    const spiceLevel = parseSpice(get('spiceLevel'));
    if (spiceLevel === null)
      problems.push(
        `Spice level should be None, Mild, Medium, Hot or Extra hot, not "${get('spiceLevel')}"`,
      );

    if (problems.length) {
      errors.push({ row: r, message: problems.join('; ') });
      continue;
    }
    const opt = (k: ColumnKey, max = 500) => get(k).slice(0, max) || undefined;
    rows.push({
      row: r,
      category,
      name,
      price: price!,
      halfPrice: halfPrice ?? undefined,
      taxRatePercent: taxRatePercent ?? undefined,
      isVeg: isVeg ?? undefined,
      description: opt('description', 1000),
      sku: opt('sku', 40),
      barcode: opt('barcode', 60),
      costPrice: costPrice ?? undefined,
      prepTimeMinutes: prepTimeMinutes ?? undefined,
      spiceLevel: spiceLevel ?? undefined,
      station: opt('station', 60),
      isActive: isActive ?? undefined,
    });
  }

  // The same SKU twice in one file would update one item twice.
  const seenSku = new Map<string, number>();
  for (const r of rows) {
    if (!r.sku) continue;
    const k = r.sku.toLowerCase();
    const first = seenSku.get(k);
    if (first !== undefined) {
      errors.push({
        row: r.row,
        message: `SKU "${r.sku}" is also used on row ${first}`,
      });
    } else seenSku.set(k, r.row);
  }
  const dupRows = new Set(errors.map((e) => e.row));
  return {
    rows: rows.filter((r) => !dupRows.has(r.row)),
    errors: errors.sort((a, b) => a.row - b.row),
  };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface ExistingMenu {
  categories: { id: string; name: string; sortOrder: number }[];
  stations: { id: string; name: string }[];
  items: { id: string; name: string; sku: string | null; categoryId: string }[];
}

export type ItemFields = Omit<MenuRow, 'category' | 'station'>;

export interface ImportPlan {
  newCategories: { name: string; sortOrder: number }[];
  newStations: string[];
  creates: {
    row: number;
    category: string;
    station?: string;
    data: ItemFields;
  }[];
  updates: {
    row: number;
    id: string;
    category: string;
    station?: string;
    data: Partial<ItemFields>;
  }[];
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function planMenuImport(
  rows: ParsedRow[],
  existing: ExistingMenu,
): ImportPlan {
  const catByName = new Map(existing.categories.map((c) => [key(c.name), c]));
  const catNameById = new Map(
    existing.categories.map((c) => [c.id, key(c.name)]),
  );
  const stationNames = new Set(existing.stations.map((s) => key(s.name)));
  const bySku = new Map<string, (typeof existing.items)[number]>();
  const byName = new Map<string, (typeof existing.items)[number][]>();
  for (const it of existing.items) {
    if (it.sku) bySku.set(key(it.sku), it);
    const list = byName.get(key(it.name)) ?? [];
    list.push(it);
    byName.set(key(it.name), list);
  }

  const plan: ImportPlan = {
    newCategories: [],
    newStations: [],
    creates: [],
    updates: [],
  };
  let nextSort =
    Math.max(-1, ...existing.categories.map((c) => c.sortOrder)) + 1;
  const used = new Set<string>(); // existing item ids already matched by an earlier row

  for (const r of rows) {
    const catKey = key(r.category);
    if (
      !catByName.has(catKey) &&
      !plan.newCategories.some((c) => key(c.name) === catKey)
    ) {
      plan.newCategories.push({
        name: r.category.trim(),
        sortOrder: nextSort++,
      });
    }
    if (r.station && !stationNames.has(key(r.station))) {
      stationNames.add(key(r.station));
      plan.newStations.push(r.station.trim());
    }

    // SKU first; otherwise the name — preferring an item already in the same
    // category, so two "Lassi"s in different sections stay separate.
    let match = r.sku ? bySku.get(key(r.sku)) : undefined;
    if (!match) {
      const named = (byName.get(key(r.name)) ?? []).filter(
        (i) => !used.has(i.id),
      );
      match =
        named.find((i) => catNameById.get(i.categoryId) === catKey) ??
        (named.length === 1 ? named[0] : undefined);
    }
    if (match && used.has(match.id)) match = undefined;

    const { row, category, ...rest } = r;
    const station = rest.station ?? undefined;
    delete rest.station;
    const fields: ItemFields = rest;
    if (match) {
      used.add(match.id);
      // Only what the sheet actually filled in; blank cells keep current values.
      const data = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      ) as Partial<ItemFields>;
      plan.updates.push({ row, id: match.id, category, station, data });
    } else {
      plan.creates.push({ row, category, station, data: fields });
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------
// PDF catalogue
// ---------------------------------------------------------------------------

export interface CatalogueInput {
  restaurantName: string;
  branchName?: string;
  address?: string | null;
  phone?: string | null;
  currency: string;
  logoPath?: string | null;
  categories: {
    name: string;
    items: {
      name: string;
      description: string | null;
      price: number;
      halfPrice: number | null;
      isVeg: boolean;
    }[];
  }[];
}

function fontDir(): string | null {
  // dist/src/modules/menu (built) or src/modules/menu (tests) → apps/backend/assets/fonts
  for (const up of ['../../../assets/fonts', '../../../../assets/fonts']) {
    const dir = join(__dirname, up);
    if (existsSync(join(dir, 'DejaVuSans.ttf'))) return dir;
  }
  return null;
}

const ACCENT = '#C0283A';

export function buildCataloguePdf(input: CatalogueInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: { Title: `${input.restaurantName} — Menu` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dir = fontDir();
    let regular = 'Helvetica';
    let bold = 'Helvetica-Bold';
    if (dir) {
      doc.registerFont('body', join(dir, 'DejaVuSans.ttf'));
      doc.registerFont('body-bold', join(dir, 'DejaVuSans-Bold.ttf'));
      regular = 'body';
      bold = 'body-bold';
    }
    // The built-in PDF fonts have no ₹ glyph; fall back to "Rs." without DejaVu.
    const symbol =
      input.currency === 'INR' ? (dir ? '₹' : 'Rs. ') : `${input.currency} `;
    const money = (n: number) =>
      `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    // Header
    let y = doc.page.margins.top;
    if (input.logoPath) {
      try {
        doc.image(input.logoPath, left + width / 2 - 28, y, {
          fit: [56, 56],
          align: 'center',
        });
        y += 64;
      } catch {
        // Unsupported image type (pdfkit reads PNG/JPEG only) — header without it.
      }
    }
    doc
      .font(bold)
      .fontSize(22)
      .fillColor('#111111')
      .text(input.restaurantName, left, y, { width, align: 'center' });
    const sub = [input.address, input.phone].filter(Boolean).join('  ·  ');
    if (sub)
      doc
        .font(regular)
        .fontSize(9)
        .fillColor('#666666')
        .text(sub, { width, align: 'center' });
    doc.moveDown(0.4);
    doc
      .font(bold)
      .fontSize(10)
      .fillColor(ACCENT)
      .text('MENU', { width, align: 'center', characterSpacing: 3 });
    doc.moveDown(1);

    const vegMark = (x: number, yy: number, veg: boolean) => {
      const c = veg ? '#1B8A3A' : '#B3261E';
      doc.save().lineWidth(0.8).strokeColor(c).rect(x, yy, 8, 8).stroke();
      doc
        .fillColor(c)
        .circle(x + 4, yy + 4, 2)
        .fill()
        .restore();
    };

    for (const cat of input.categories) {
      if (!cat.items.length) continue;
      if (doc.y > bottom() - 60) doc.addPage();
      doc
        .font(bold)
        .fontSize(13)
        .fillColor(ACCENT)
        .text(cat.name.toUpperCase(), left, doc.y, {
          width,
          characterSpacing: 1,
        });
      const lineY = doc.y + 2;
      doc
        .moveTo(left, lineY)
        .lineTo(left + width, lineY)
        .lineWidth(0.6)
        .strokeColor('#E6C9CD')
        .stroke();
      doc.y = lineY + 8;

      for (const it of cat.items) {
        const priceText =
          it.halfPrice != null
            ? `${money(it.halfPrice)} / ${money(it.price)}`
            : money(it.price);
        doc.font(bold).fontSize(10.5);
        const priceW = doc.widthOfString(priceText) + 4;
        const nameW = width - 16 - priceW - 12;
        const nameH = doc.heightOfString(it.name, { width: nameW });
        doc.font(regular).fontSize(8.5);
        const descH = it.description
          ? doc.heightOfString(it.description, { width: nameW }) + 2
          : 0;
        if (doc.y + nameH + descH > bottom()) doc.addPage();

        const top = doc.y;
        vegMark(left, top + 2.5, it.isVeg);
        doc
          .font(bold)
          .fontSize(10.5)
          .fillColor('#111111')
          .text(it.name, left + 16, top, { width: nameW });
        doc.text(priceText, left + width - priceW, top, {
          width: priceW,
          align: 'right',
        });
        doc.y = top + nameH;
        if (it.description) {
          doc
            .font(regular)
            .fontSize(8.5)
            .fillColor('#666666')
            .text(it.description, left + 16, doc.y + 1, { width: nameW });
        }
        doc.y += 7;
      }
      doc.moveDown(0.8);
    }
    if (input.categories.every((c) => !c.items.length)) {
      doc
        .font(regular)
        .fontSize(11)
        .fillColor('#666666')
        .text('No items on the menu yet.', { width, align: 'center' });
    }

    // Footer on every page.
    const range = doc.bufferedPageRange();
    const halfNote = input.categories.some((c) =>
      c.items.some((i) => i.halfPrice != null),
    );
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would otherwise start a new page.
      const fy = doc.page.height - doc.page.margins.bottom - 4;
      doc.page.margins.bottom = 0;
      const left2 = [
        'Prices include taxes.',
        halfNote ? 'Two prices = half / full portion.' : '',
        `Page ${i + 1} of ${range.count}`,
      ]
        .filter(Boolean)
        .join('  ·  ');
      doc
        .font(regular)
        .fontSize(7.5)
        .fillColor('#999999')
        .text(left2, left, fy, { width, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
