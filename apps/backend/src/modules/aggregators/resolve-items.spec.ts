import { resolveItems } from './resolve-items';

const menu = [
  { id: 'm1', name: 'Paneer Tikka' },
  { id: 'm2', name: 'Butter Naan' },
  { id: 'm3', name: 'Lassi' },
  { id: 'm4', name: 'lassi ' }, // two items share a name → ambiguous
];

describe('resolveItems', () => {
  it('prefers an explicit mapping, then a unique name match', () => {
    const { lines, unmapped } = resolveItems(
      [
        {
          externalItemId: 'z-1',
          name: 'Paneer Tikka (Zomato special)',
          quantity: 2,
        },
        {
          externalItemId: 'z-2',
          name: 'butter naan',
          quantity: 3,
          notes: 'extra butter',
        },
      ],
      new Map([['z-1', 'm1']]),
      menu,
    );
    expect(unmapped).toEqual([]);
    expect(lines).toEqual([
      { menuItemId: 'm1', quantity: 2 },
      { menuItemId: 'm2', quantity: 3, kitchenNote: 'extra butter' },
    ]);
  });

  it('holds back unknown and ambiguous items instead of guessing', () => {
    const { lines, unmapped } = resolveItems(
      [
        { externalItemId: 's-9', name: 'Mystery Dish', quantity: 1 },
        { externalItemId: 's-3', name: 'Lassi', quantity: 1 },
      ],
      new Map(),
      menu,
    );
    expect(lines).toEqual([]);
    expect(unmapped.map((u) => u.externalItemId)).toEqual(['s-9', 's-3']);
  });
});
