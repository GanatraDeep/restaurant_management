// Zomato / Swiggy item mapping in bulk: an Excel sheet listing every menu
// item of the branch with a column for the marketplace's item ID. Pure (no
// database) so it can be unit tested; the service resolves and applies rows.
import ExcelJS from 'exceljs';
import {
  cellText,
  loadSheet,
  normHeading,
  safeCell,
} from '../../common/sheets';

export interface MappingSheetItem {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  price: number;
  externalItemId: string | null;
}

const COLS = [
  { key: 'category', header: 'Category', width: 22 },
  { key: 'name', header: 'Item name', width: 32 },
  { key: 'sku', header: 'SKU', width: 12 },
  { key: 'price', header: 'Price', width: 10 },
  { key: 'externalItemId', header: 'Marketplace item ID', width: 24 },
  { key: 'id', header: 'F Cartel item ID (do not change)', width: 30 },
] as const;

export async function buildMappingWorkbook(
  provider: string,
  items: MappingSheetItem[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'F Cartel';
  const ws = wb.addWorksheet('Mapping');
  ws.columns = COLS.map((c) => ({
    key: c.key,
    header: c.key === 'externalItemId' ? `${provider} item ID` : c.header,
    width: c.width,
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const it of items) {
    ws.addRow({
      category: safeCell(it.category),
      name: safeCell(it.name),
      sku: safeCell(it.sku),
      price: it.price,
      externalItemId: safeCell(it.externalItemId),
      id: it.id,
    });
  }
  ws.getColumn('externalItemId').eachCell((cell, r) => {
    if (r > 1)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF7D6' },
      };
  });
  const help = wb.addWorksheet('How to fill');
  help.columns = [{ width: 110 }];
  for (const line of [
    `How to map your ${provider} items`,
    '',
    `1. In the yellow column, type the item ID ${provider} uses for each dish (from your ${provider} menu / partner panel). Several IDs for one dish: separate them with commas.`,
    '2. Leave it empty for items you do not sell there. Clear an ID to remove that mapping.',
    '3. Do not change the last column — it tells F Cartel which item the row is.',
    '4. Upload this file back on Settings → Zomato & Swiggy → Item mapping → Upload Excel.',
    '',
    'You can also add rows: fill Category + Item name (exactly as on your menu) and the marketplace ID.',
  ])
    help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 13 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface MappingRow {
  row: number;
  id?: string;
  category?: string;
  name?: string;
  sku?: string;
  externalItemId: string;
}

const HEADINGS: Record<string, keyof MappingRow> = {
  category: 'category',
  'item name': 'name',
  item: 'name',
  name: 'name',
  sku: 'sku',
  'f cartel item id (do not change)': 'id',
  'f cartel item id': 'id',
};

export async function parseMappingFile(buf: Buffer, fileName: string) {
  const ws = await loadSheet(buf, fileName, 'Mapping');
  let head = 0;
  const colOf = new Map<keyof MappingRow, number>();
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !head; r++) {
    const found = new Map<keyof MappingRow, number>();
    ws.getRow(r).eachCell((cell, c) => {
      const h = normHeading(cellText(cell.value));
      const key =
        HEADINGS[h] ??
        (/(item id|external id|marketplace)/.test(h) &&
        !h.startsWith('f cartel')
          ? 'externalItemId'
          : undefined);
      if (key && !found.has(key)) found.set(key, c);
    });
    if (
      found.has('externalItemId') &&
      (found.has('id') || found.has('name') || found.has('sku'))
    ) {
      head = r;
      found.forEach((v, k) => colOf.set(k, v));
    }
  }
  if (!head) {
    throw new Error(
      'Could not find the heading row — download the mapping sheet and fill its yellow column.',
    );
  }
  const rows: MappingRow[] = [];
  for (let r = head + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: keyof MappingRow) => {
      const c = colOf.get(k);
      return c ? cellText(row.getCell(c).value).trim() : '';
    };
    const rec: MappingRow = {
      row: r,
      externalItemId: get('externalItemId').slice(0, 100),
      id: get('id') || undefined,
      category: get('category') || undefined,
      name: get('name') || undefined,
      sku: get('sku') || undefined,
    };
    if (!rec.id && !rec.name && !rec.sku && !rec.externalItemId) continue;
    rows.push(rec);
  }
  return rows;
}

export interface MenuRef {
  id: string;
  name: string;
  category: string;
  sku: string | null;
}

export interface MappingPlan {
  /** The full list of marketplace IDs each item should have (a cell may hold several, comma-separated). */
  set: { row: number; menuItemId: string; externalItemIds: string[] }[];
  clear: { row: number; menuItemId: string }[];
  errors: { row: number; message: string }[];
}

/** Which menu item each row is, and what to do with its mapping. */
export function planMappingImport(
  rows: MappingRow[],
  menu: MenuRef[],
): MappingPlan {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const key = (c: string, n: string) =>
    `${c.trim().toLowerCase()}|${n.trim().toLowerCase()}`;
  const byName = new Map(menu.map((m) => [key(m.category, m.name), m]));
  const bySku = new Map(
    menu.filter((m) => m.sku).map((m) => [m.sku!.trim().toLowerCase(), m]),
  );
  const nameOnly = new Map<string, MenuRef[]>();
  for (const m of menu)
    nameOnly.set(m.name.trim().toLowerCase(), [
      ...(nameOnly.get(m.name.trim().toLowerCase()) ?? []),
      m,
    ]);
  const plan: MappingPlan = { set: [], clear: [], errors: [] };
  const seenExternal = new Map<string, number>();
  for (const r of rows) {
    const item =
      (r.id && byId.get(r.id)) ||
      (r.sku && bySku.get(r.sku.toLowerCase())) ||
      (r.category && r.name && byName.get(key(r.category, r.name))) ||
      (r.name && nameOnly.get(r.name.toLowerCase())?.length === 1
        ? nameOnly.get(r.name.toLowerCase())![0]
        : undefined);
    if (!item) {
      plan.errors.push({
        row: r.row,
        message: `No menu item "${r.name ?? r.sku ?? r.id}"${r.category ? ` in ${r.category}` : ''}`,
      });
      continue;
    }
    if (!r.externalItemId) {
      plan.clear.push({ row: r.row, menuItemId: item.id });
      continue;
    }
    const ids = [
      ...new Set(
        r.externalItemId
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    const clash = ids.find((id) => seenExternal.has(id.toLowerCase()));
    if (clash) {
      plan.errors.push({
        row: r.row,
        message: `Item ID "${clash}" is also on row ${seenExternal.get(clash.toLowerCase())}`,
      });
      continue;
    }
    ids.forEach((id) => seenExternal.set(id.toLowerCase(), r.row));
    plan.set.push({ row: r.row, menuItemId: item.id, externalItemIds: ids });
  }
  return plan;
}
