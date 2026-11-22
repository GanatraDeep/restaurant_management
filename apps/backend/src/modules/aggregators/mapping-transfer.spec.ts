import {
  buildMappingWorkbook,
  parseMappingFile,
  planMappingImport,
} from './mapping-transfer';

const menu = [
  { id: 'm1', name: 'Paneer Tikka', category: 'Starters', sku: 'ST01' },
  { id: 'm2', name: 'Cold Coffee', category: 'Beverages', sku: null },
  { id: 'm3', name: 'Fries', category: 'Starters', sku: null },
  { id: 'm4', name: 'Fries', category: 'Kids', sku: null },
];

describe('marketplace item mapping sheet', () => {
  it('round-trips through Excel and plans set / clear / errors', async () => {
    const buf = await buildMappingWorkbook('Zomato', [
      {
        id: 'm1',
        name: 'Paneer Tikka',
        category: 'Starters',
        sku: 'ST01',
        price: 240,
        externalItemId: 'Z-100',
      },
      {
        id: 'm2',
        name: 'Cold Coffee',
        category: 'Beverages',
        sku: null,
        price: 120,
        externalItemId: null,
      },
    ]);
    const rows = await parseMappingFile(buf, 'map.xlsx');
    expect(rows).toEqual([
      expect.objectContaining({ id: 'm1', externalItemId: 'Z-100' }),
      expect.objectContaining({ id: 'm2', externalItemId: '' }),
    ]);
    const plan = planMappingImport(
      [
        ...rows,
        { row: 10, name: 'Fries', category: 'Kids', externalItemId: 'Z-300' },
        { row: 11, sku: 'st01', externalItemId: 'Z-100' },
        {
          row: 14,
          name: 'Cold Coffee',
          category: 'Beverages',
          externalItemId: 'Z-7, Z-8',
        },
        { row: 12, name: 'Fries', externalItemId: 'Z-400' },
        { row: 13, name: 'Biryani', externalItemId: 'Z-500' },
      ],
      menu,
    );
    expect(plan.set).toEqual([
      { row: 2, menuItemId: 'm1', externalItemIds: ['Z-100'] },
      { row: 10, menuItemId: 'm4', externalItemIds: ['Z-300'] },
      { row: 14, menuItemId: 'm2', externalItemIds: ['Z-7', 'Z-8'] },
    ]);
    expect(plan.clear).toEqual([{ row: 3, menuItemId: 'm2' }]);
    expect(plan.errors.map((e) => e.row)).toEqual([11, 12, 13]);
  });
});
