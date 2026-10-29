import ExcelJS from 'exceljs';
import {
  buildCataloguePdf,
  buildMenuWorkbook,
  parseMenuFile,
  planMenuImport,
  type MenuRow,
} from './menu-transfer';

async function sheet(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('menu import parsing', () => {
  it('reads back exactly what the export wrote', async () => {
    const rows: MenuRow[] = [
      {
        category: 'Starters',
        name: 'Paneer Tikka',
        price: 249,
        halfPrice: 149,
        taxRatePercent: 5,
        isVeg: true,
        description: 'Grilled',
        sku: 'ST01',
        spiceLevel: 'MEDIUM',
        station: 'Tandoor',
        isActive: true,
      },
      {
        category: 'Mains',
        name: 'Butter Chicken',
        price: 349.5,
        taxRatePercent: 5,
        isVeg: false,
        spiceLevel: 'NONE',
        isActive: false,
        costPrice: 120,
        prepTimeMinutes: 20,
      },
    ];
    const buf = await buildMenuWorkbook(rows, { restaurantName: 'Test' });
    const { rows: parsed, errors } = await parseMenuFile(buf, 'menu.xlsx');
    expect(errors).toEqual([]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      row: 2,
      category: 'Starters',
      name: 'Paneer Tikka',
      price: 249,
      halfPrice: 149,
      isVeg: true,
      sku: 'ST01',
      spiceLevel: 'MEDIUM',
      station: 'Tandoor',
      isActive: true,
    });
    expect(parsed[1]).toMatchObject({
      category: 'Mains',
      price: 349.5,
      isVeg: false,
      isActive: false,
      costPrice: 120,
      prepTimeMinutes: 20,
    });
  });

  it('the template example rows import cleanly', async () => {
    const buf = await buildMenuWorkbook([], {
      restaurantName: 'Test',
      example: true,
    });
    const { rows, errors } = await parseMenuFile(buf, 'menu-template.xlsx');
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.name)).toEqual([
      'Paneer Tikka',
      'Chicken 65',
      'Masala Chaas',
    ]);
  });

  it('accepts a home-made sheet with a title line, other headings and loose values', async () => {
    const buf = await sheet([
      ['Our menu'],
      ['Section', 'Dish', 'Rate', 'GST', 'Veg/Non-veg', 'Status'],
      ['Soups', 'Tomato Soup', '₹ 1,120.00', '5%', 'Veg', 'available'],
      ['Soups', 'Chicken Soup', 'Rs. 140/-', 5, 'non-veg', 'no'],
      [null, null, null],
    ]);
    const { rows, errors } = await parseMenuFile(buf, 'mine.xlsx');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      expect.objectContaining({
        row: 3,
        category: 'Soups',
        name: 'Tomato Soup',
        price: 1120,
        taxRatePercent: 5,
        isVeg: true,
        isActive: true,
      }),
      expect.objectContaining({
        row: 4,
        name: 'Chicken Soup',
        price: 140,
        isVeg: false,
        isActive: false,
      }),
    ]);
  });

  it('reports every problem with its row number instead of guessing', async () => {
    const buf = await sheet([
      ['Category', 'Item name', 'Price', 'Veg', 'Spice level', 'SKU'],
      ['', 'No category', 10, 'yes', '', ''],
      ['Mains', 'Bad price', 'abc', 'yes', '', ''],
      ['Mains', 'No price', '', 'maybe', 'lava', ''],
      ['Mains', 'Dal', 120, 'yes', 'mild', 'D1'],
      ['Mains', 'Dal Tadka', 140, 'yes', '', 'd1'],
    ]);
    const { rows, errors } = await parseMenuFile(buf, 'x.xlsx');
    expect(rows.map((r) => r.name)).toEqual(['Dal']);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
    expect(errors[0].message).toContain('Category is empty');
    expect(errors[1].message).toContain('Price "abc"');
    expect(errors[2].message).toMatch(
      /Price is empty.*Veg should be Yes or No.*Spice level/,
    );
    expect(errors[3].message).toContain('SKU "d1" is also used on row 5');
  });

  it('reads CSV too', async () => {
    const csv = 'Category,Item name,Price\nDrinks,"Lassi, sweet",80\n';
    const { rows } = await parseMenuFile(Buffer.from(csv), 'menu.csv');
    expect(rows).toEqual([
      expect.objectContaining({
        category: 'Drinks',
        name: 'Lassi, sweet',
        price: 80,
      }),
    ]);
  });

  it('refuses a sheet without the needed headings', async () => {
    const buf = await sheet([
      ['Name', 'Cost'],
      ['Tea', 10],
    ]);
    await expect(parseMenuFile(buf, 'x.xlsx')).rejects.toThrow(/heading row/);
  });
});

describe('menu import plan', () => {
  const existing = {
    categories: [
      { id: 'c1', name: 'Starters', sortOrder: 0 },
      { id: 'c2', name: 'Drinks', sortOrder: 3 },
    ],
    stations: [{ id: 's1', name: 'Tandoor' }],
    items: [
      { id: 'i1', name: 'Paneer Tikka', sku: 'ST01', categoryId: 'c1' },
      { id: 'i2', name: 'Lassi', sku: null, categoryId: 'c2' },
      { id: 'i3', name: 'Lassi', sku: null, categoryId: 'c1' },
      { id: 'i4', name: 'Soda', sku: null, categoryId: 'c2' },
    ],
  };
  const row = (
    r: number,
    extra: Partial<MenuRow> & { category: string; name: string },
  ) => ({ row: r, price: 100, ...extra });

  it('matches by SKU, then by name within the category, and adds the rest', () => {
    const plan = planMenuImport(
      [
        row(2, {
          category: 'Starters',
          name: 'Paneer Tikka Special',
          sku: 'st01',
          price: 260,
        }),
        row(3, { category: 'drinks', name: 'lassi' }),
        row(4, {
          category: 'Desserts',
          name: 'Gulab Jamun',
          station: 'Sweets',
        }),
        row(5, { category: 'Desserts', name: 'Rasmalai', station: 'sweets' }),
        row(6, { category: 'Mocktails', name: 'Soda' }),
      ],
      existing,
    );
    expect(plan.updates.map((u) => [u.row, u.id])).toEqual([
      [2, 'i1'],
      [3, 'i2'],
      [6, 'i4'],
    ]);
    expect(plan.updates[0].data).toEqual({
      name: 'Paneer Tikka Special',
      sku: 'st01',
      price: 260,
    });
    expect(plan.creates.map((c) => c.data.name)).toEqual([
      'Gulab Jamun',
      'Rasmalai',
    ]);
    // New categories go after the existing ones, in sheet order; stations once.
    expect(plan.newCategories).toEqual([
      { name: 'Desserts', sortOrder: 4 },
      { name: 'Mocktails', sortOrder: 5 },
    ]);
    expect(plan.newStations).toEqual(['Sweets']);
  });

  it('never updates the same item twice, and leaves ambiguous names as new items', () => {
    const plan = planMenuImport(
      [
        row(2, { category: 'Drinks', name: 'Soda' }),
        row(3, { category: 'Drinks', name: 'Soda' }),
        row(4, { category: 'Mains', name: 'Lassi' }),
      ],
      existing,
    );
    expect(plan.updates.map((u) => u.id)).toEqual(['i4']);
    expect(plan.creates.map((c) => c.row)).toEqual([3, 4]);
  });
});

describe('menu catalogue PDF', () => {
  it('renders a PDF, rupee symbol and all', async () => {
    const pdf = await buildCataloguePdf({
      restaurantName: 'Surat Thali House',
      address: 'Nanpura, Surat',
      phone: '+91 90000 00000',
      currency: 'INR',
      categories: [
        {
          name: 'Starters',
          items: Array.from({ length: 80 }, (_, i) => ({
            name: `Item ${i}`,
            description: i % 2 ? 'Something tasty' : null,
            price: 100 + i,
            halfPrice: i % 3 ? null : 60,
            isVeg: i % 4 !== 0,
          })),
        },
        { name: 'Empty', items: [] },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
