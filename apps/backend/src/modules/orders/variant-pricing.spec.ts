import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';

// buildLine is the one place an order line gets its price; variants
// (Dosa: Plain / Butter / Oil) are priced there from the menu, never the client.
type BuildLine = (
  cartItem: Record<string, unknown>,
  items: Map<string, unknown>,
  modifiers: Map<string, unknown>,
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE',
  allowCustomPortion: boolean,
) => {
  menuItem: { name: string; price: number };
  priced: { lineTotal: number };
};

const svc = new (OrdersService as unknown as new (...a: unknown[]) => object)(
  ...Array.from({ length: 10 }, () => null),
) as unknown as { buildLine: BuildLine };

const dosa = {
  id: 'dosa',
  name: 'Dosa',
  price: new Prisma.Decimal(60),
  halfPrice: null,
  taxRatePercent: new Prisma.Decimal(5),
  variants: [
    { name: 'Plain', price: 60 },
    { name: 'Butter', price: 80 },
    { name: 'Oil', price: 70 },
  ],
};
const items = new Map([['dosa', dosa]]);
const line = (cart: Record<string, unknown>, staff = false) =>
  svc.buildLine(
    { menuItemId: 'dosa', quantity: 2, modifierIds: [], ...cart },
    items,
    new Map(),
    'INCLUSIVE',
    staff,
  );

describe('variant pricing', () => {
  it('charges the chosen variant and names it on the line', () => {
    const l = line({ variant: 'butter' });
    expect(l.menuItem.name).toBe('Dosa (Butter)');
    expect(l.menuItem.price).toBe(80);
    expect(l.priced.lineTotal).toBe(160);
  });

  it('uses the first variant when none is sent (e.g. an aggregator order)', () => {
    expect(line({}).menuItem.name).toBe('Dosa (Plain)');
  });

  it('ignores a price sent by a guest, but staff may override it', () => {
    expect(line({ variant: 'Oil', customPrice: 1 }).menuItem.price).toBe(70);
    expect(line({ variant: 'Oil', customPrice: 65 }, true).menuItem.price).toBe(
      65,
    );
  });

  it('refuses a variant the item does not have', () => {
    expect(() => line({ variant: 'Ghee' })).toThrow(BadRequestException);
  });
});
