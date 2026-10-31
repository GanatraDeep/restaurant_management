// Inventory bulk import / export: the Excel template, reading an uploaded
// sheet, and working out what it would change. Pure (no database), like
// menu-transfer.ts; InventoryTransferService applies the plan.
import ExcelJS from 'exceljs';
import type { IngredientUnit } from '@nodedr-restaurant/types';
import {
  cellText,
  loadSheet,
  normHeading,
  parseNumber,
  safeCell,
} from '../../common/sheets';

type Key =
  'name' | 'unit' | 'sku' | 'reorderLevel' | 'openingStock' | 'costPerUnit';

const COLUMNS: {
  key: Key;
  header: string;
  aliases: string[];
  width: number;
  required?: boolean;
  help: string;
}[] = [
  {
    key: 'name',
    header: 'Item name',
    aliases: ['ingredient', 'name', 'item', 'raw material', 'material'],
    width: 28,
    required: true,
    help: 'Matched by SKU if given, otherwise by name — a matching item is updated, anything new is added.',
  },
  {
    key: 'unit',
    header: 'Unit',
    aliases: ['uom', 'unit of measure'],
    width: 10,
    required: true,
    help: 'KG, G, L, ML, PIECE, DOZEN, PACK or BOX (kg, gm, litre, pcs… also work).',
  },
  {
    key: 'sku',
    header: 'SKU',
    aliases: ['code', 'item code'],
    width: 12,
    help: 'Optional short code. Give each item its own.',
  },
  {
    key: 'reorderLevel',
    header: 'Reorder level',
    aliases: ['min stock', 'minimum stock', 'reorder', 'reorder qty'],
    width: 14,
    help: 'Low-stock warning shows at or below this. Defaults to 0.',
  },
  {
    key: 'openingStock',
    header: 'Opening stock',
    aliases: ['stock', 'quantity', 'qty', 'current stock'],
    width: 14,
    help: 'New items only: the quantity you have now. Existing items keep their stock — use Adjust stock for those.',
  },
  {
    key: 'costPerUnit',
    header: 'Cost per unit',
    aliases: ['cost', 'rate', 'price', 'purchase price', 'avg. cost / unit'],
    width: 13,
    help: 'New items only: what one unit costs you, for stock value and recipe costing.',
  },
];

export const INVENTORY_UNITS: IngredientUnit[] = [
  'KG',
  'G',
  'L',
  'ML',
  'PIECE',
  'DOZEN',
  'PACK',
  'BOX',
];
const UNIT_ALIASES: Record<string, IngredientUnit> = {
  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  g: 'G',
  gm: 'G',
  gms: 'G',
  gram: 'G',
  grams: 'G',
  gr: 'G',
  l: 'L',
  lt: 'L',
  ltr: 'L',
  litre: 'L',
  liter: 'L',
  litres: 'L',
  liters: 'L',
  ml: 'ML',
  millilitre: 'ML',
  milliliter: 'ML',
  piece: 'PIECE',
  pieces: 'PIECE',
  pc: 'PIECE',
  pcs: 'PIECE',
  nos: 'PIECE',
  no: 'PIECE',
  unit: 'PIECE',
  units: 'PIECE',
  each: 'PIECE',
  dozen: 'DOZEN',
  dz: 'DOZEN',
  doz: 'DOZEN',
  pack: 'PACK',
  packs: 'PACK',
  pkt: 'PACK',
  packet: 'PACK',
  packets: 'PACK',
  box: 'BOX',
  boxes: 'BOX',
};

export const MAX_INVENTORY_ROWS = 3000;

export interface InventoryRow {
  name: string;
  unit: IngredientUnit;
  sku?: string;
  reorderLevel?: number;
  openingStock?: number;
  costPerUnit?: number;
}
export interface ParsedInventoryRow extends InventoryRow {
  row: number;
}
export interface RowError {
  row: number;
  message: string;
}

export async function buildInventoryWorkbook(
  rows: (InventoryRow & { currentStock?: number })[],
  opts: { restaurantName: string; example?: boolean },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'F Cartel';
  const ws = wb.addWorksheet('Inventory');
  ws.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).eachCell((cell, i) => {
    const col = COLUMNS[i - 1];
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col.required ? 'FFC0283A' : 'FF444444' },
    };
    cell.note = col.help;
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const sample: (InventoryRow & { currentStock?: number })[] = opts.example
    ? [
        {
          name: 'Paneer',
          unit: 'KG',
          sku: 'RM01',
          reorderLevel: 2,
          openingStock: 5,
          costPerUnit: 380,
        },
        {
          name: 'Basmati Rice',
          unit: 'KG',
          sku: 'RM02',
          reorderLevel: 10,
          openingStock: 25,
          costPerUnit: 95,
        },
        {
          name: 'Milk',
          unit: 'L',
          reorderLevel: 5,
          openingStock: 12,
          costPerUnit: 62,
        },
        {
          name: 'Burger Buns',
          unit: 'PIECE',
          reorderLevel: 24,
          openingStock: 60,
          costPerUnit: 8,
        },
      ]
    : rows;
  for (const r of sample) {
    ws.addRow({
      name: safeCell(r.name),
      unit: r.unit,
      sku: safeCell(r.sku),
      reorderLevel: r.reorderLevel ?? 0,
      // An export shows today's stock in this column (for a stock count);
      // on import it only seeds items that don't exist yet.
      openingStock: r.currentStock ?? r.openingStock ?? null,
      costPerUnit: r.costPerUnit ?? null,
    });
  }
  const last = Math.max(500, sample.length + 200);
  const unitCol = String.fromCharCode(
    65 + COLUMNS.findIndex((c) => c.key === 'unit'),
  );
  (
    ws as unknown as {
      dataValidations: { add(range: string, v: ExcelJS.DataValidation): void };
    }
  ).dataValidations.add(`${unitCol}2:${unitCol}${last}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${INVENTORY_UNITS.join(',')}"`],
  });

  const help = wb.addWorksheet('How to fill');
  help.columns = [
    { header: 'Column', key: 'c', width: 16 },
    { header: 'Required', key: 'r', width: 10 },
    { header: 'What to enter', key: 'h', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of COLUMNS)
    help.addRow({ c: c.header, r: c.required ? 'Yes' : '', h: c.help });
  help.addRow({});
  for (const line of [
    `Inventory for ${opts.restaurantName}. One item per row on the "Inventory" sheet; keep the heading row as it is.`,
    'Existing items not in the sheet are left untouched — nothing is deleted. Empty cells keep an item’s current values.',
    'Upload it from Inventory → Import / Export → Import from Excel. You see a preview before anything is saved.',
  ]) {
    help.addRow({ c: '', r: '', h: line });
  }
  help.getColumn('h').alignment = { wrapText: true, vertical: 'top' };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function parseUnit(s: string): IngredientUnit | null {
  const v = s.trim().toLowerCase().replace(/\./g, '');
  if (!v) return null;
  const upper = v.toUpperCase() as IngredientUnit;
  return INVENTORY_UNITS.includes(upper) ? upper : (UNIT_ALIASES[v] ?? null);
}

export async function parseInventoryFile(
  buf: Buffer,
  fileName: string,
): Promise<{ rows: ParsedInventoryRow[]; errors: RowError[] }> {
  const ws = await loadSheet(buf, fileName, 'Inventory');
  let headRow = 0;
  const colOf = new Map<Key, number>();
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headRow; r++) {
    const found = new Map<Key, number>();
    ws.getRow(r).eachCell((cell, c) => {
      const h = normHeading(cellText(cell.value));
      const col = COLUMNS.find(
        (m) => normHeading(m.header) === h || m.aliases.includes(h),
      );
      if (col && !found.has(col.key)) found.set(col.key, c);
    });
    if (found.has('name') && found.has('unit')) {
      headRow = r;
      found.forEach((v, k) => colOf.set(k, v));
    }
  }
  if (!headRow) {
    throw new Error(
      'Could not find the heading row. The sheet needs at least "Item name" and "Unit" columns — download the template to start from.',
    );
  }

  const rows: ParsedInventoryRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  for (let r = headRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: Key) => {
      const c = colOf.get(k);
      return c ? cellText(row.getCell(c).value) : '';
    };
    const name = get('name');
    const unitText = get('unit');
    if (!name && !unitText) continue;
    if (rows.length + errors.length >= MAX_INVENTORY_ROWS) {
      errors.push({
        row: r,
        message: `Only ${MAX_INVENTORY_ROWS} items can be imported at once — split the file.`,
      });
      break;
    }
    const problems: string[] = [];
    if (!name) problems.push('Item name is empty');
    if (name.length > 80)
      problems.push('Item name is longer than 80 characters');
    const unit = parseUnit(unitText);
    if (!unit)
      problems.push(
        unitText
          ? `Unit "${unitText}" is not one of ${INVENTORY_UNITS.join(', ')}`
          : 'Unit is empty',
      );
    const num = (k: Key, label: string) => {
      const n = parseNumber(get(k));
      if (n === null) return undefined;
      if (Number.isNaN(n) || n < 0) {
        problems.push(`${label} "${get(k)}" is not a valid number`);
        return undefined;
      }
      return Math.round(n * 1000) / 1000;
    };
    const reorderLevel = num('reorderLevel', 'Reorder level');
    const openingStock = num('openingStock', 'Opening stock');
    const costPerUnit = num('costPerUnit', 'Cost per unit');
    const sku = get('sku').slice(0, 40) || undefined;
    const dupKey = (sku ? `sku:${sku}` : `name:${name}`).toLowerCase();
    if (seen.has(dupKey))
      problems.push(
        `${sku ? `SKU "${sku}"` : `"${name}"`} is also on row ${seen.get(dupKey)}`,
      );
    if (problems.length) {
      errors.push({ row: r, message: problems.join('; ') });
      continue;
    }
    seen.set(dupKey, r);
    rows.push({
      row: r,
      name,
      unit: unit!,
      sku,
      reorderLevel,
      openingStock,
      costPerUnit,
    });
  }
  return { rows, errors };
}

export interface ExistingIngredient {
  id: string;
  name: string;
  sku: string | null;
  unit: IngredientUnit;
  currentStock: number;
}

export interface InventoryPlan {
  creates: ParsedInventoryRow[];
  updates: {
    row: number;
    id: string;
    name: string;
    data: {
      name?: string;
      sku?: string;
      reorderLevel?: number;
      unit?: IngredientUnit;
    };
  }[];
  errors: RowError[];
}

const k = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function planInventoryImport(
  rows: ParsedInventoryRow[],
  existing: ExistingIngredient[],
): InventoryPlan {
  const bySku = new Map(
    existing.filter((e) => e.sku).map((e) => [k(e.sku!), e]),
  );
  const byName = new Map(existing.map((e) => [k(e.name), e]));
  const plan: InventoryPlan = { creates: [], updates: [], errors: [] };
  const used = new Set<string>();
  for (const r of rows) {
    const match = (r.sku && bySku.get(k(r.sku))) || byName.get(k(r.name));
    if (!match || used.has(match.id)) {
      plan.creates.push(r);
      continue;
    }
    used.add(match.id);
    if (match.unit !== r.unit && match.currentStock !== 0) {
      plan.errors.push({
        row: r.row,
        message: `"${match.name}" is counted in ${match.unit} and has stock — its unit can't change to ${r.unit}`,
      });
      continue;
    }
    plan.updates.push({
      row: r.row,
      id: match.id,
      name: match.name,
      data: {
        ...(r.name !== match.name ? { name: r.name } : {}),
        ...(r.sku ? { sku: r.sku } : {}),
        ...(r.reorderLevel !== undefined
          ? { reorderLevel: r.reorderLevel }
          : {}),
        ...(r.unit !== match.unit ? { unit: r.unit } : {}),
      },
    });
  }
  return plan;
}
