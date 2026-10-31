import ExcelJS from 'exceljs';
import {
  buildInventoryWorkbook,
  parseInventoryFile,
  parseUnit,
  planInventoryImport,
} from './inventory-transfer';

async function sheet(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('inventory import', () => {
  it('the template example rows import cleanly', async () => {
    const buf = await buildInventoryWorkbook([], {
      restaurantName: 'T',
      example: true,
    });
    const { rows, errors } = await parseInventoryFile(
      buf,
      'inventory-template.xlsx',
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => `${r.name}:${r.unit}:${r.openingStock}`)).toEqual([
      'Paneer:KG:5',
      'Basmati Rice:KG:25',
      'Milk:L:12',
      'Burger Buns:PIECE:60',
    ]);
  });

  it('understands everyday units and headings', async () => {
    const buf = await sheet([
      ['Raw material', 'UOM', 'Qty', 'Rate', 'Min stock'],
      ['Tomato', 'kgs', 12.5, '₹ 30', 3],
      ['Cola', 'pcs', 48, 20, ''],
      ['Oil', 'Ltr', '15', '', ''],
    ]);
    const { rows, errors } = await parseInventoryFile(buf, 'x.xlsx');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Tomato',
        unit: 'KG',
        openingStock: 12.5,
        costPerUnit: 30,
        reorderLevel: 3,
      }),
      expect.objectContaining({
        name: 'Cola',
        unit: 'PIECE',
        openingStock: 48,
      }),
      expect.objectContaining({ name: 'Oil', unit: 'L', openingStock: 15 }),
    ]);
  });

  it('lists problems by row', async () => {
    const buf = await sheet([
      ['Item name', 'Unit', 'Opening stock'],
      ['Sugar', 'bags', 5],
      ['', 'KG', 1],
      ['Salt', 'KG', 'lots'],
      ['Sugar', 'KG', 2],
      ['sugar', 'KG', 2],
    ]);
    const { rows, errors } = await parseInventoryFile(buf, 'x.xlsx');
    expect(rows.map((r) => r.row)).toEqual([5]);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
    expect(errors[0].message).toContain('Unit "bags"');
    expect(errors[3].message).toContain('also on row 5');
  });

  it('matches existing items by SKU then name, and protects units of stocked items', () => {
    const existing = [
      {
        id: 'a',
        name: 'Paneer',
        sku: 'RM01',
        unit: 'KG' as const,
        currentStock: 4,
      },
      { id: 'b', name: 'Milk', sku: null, unit: 'L' as const, currentStock: 0 },
      {
        id: 'c',
        name: 'Cheese',
        sku: null,
        unit: 'KG' as const,
        currentStock: 2,
      },
    ];
    const plan = planInventoryImport(
      [
        {
          row: 2,
          name: 'Paneer (fresh)',
          unit: 'KG',
          sku: 'rm01',
          reorderLevel: 3,
        },
        { row: 3, name: 'milk', unit: 'ML' },
        { row: 4, name: 'Cheese', unit: 'G' },
        {
          row: 5,
          name: 'Butter',
          unit: 'KG',
          openingStock: 2,
          costPerUnit: 500,
        },
      ],
      existing,
    );
    expect(plan.updates).toEqual([
      {
        row: 2,
        id: 'a',
        name: 'Paneer',
        data: { name: 'Paneer (fresh)', sku: 'rm01', reorderLevel: 3 },
      },
      { row: 3, id: 'b', name: 'Milk', data: { name: 'milk', unit: 'ML' } },
    ]);
    expect(plan.errors.map((e) => e.row)).toEqual([4]);
    expect(plan.errors[0].message).toContain("unit can't change");
    expect(plan.creates.map((c) => c.name)).toEqual(['Butter']);
  });

  it('parses units', () => {
    expect(parseUnit('Kg.')).toBe('KG');
    expect(parseUnit('gm')).toBe('G');
    expect(parseUnit('Dozen')).toBe('DOZEN');
    expect(parseUnit('bags')).toBeNull();
  });
});
