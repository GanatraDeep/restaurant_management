import { buildKotHtml } from './kot.html';

const order = {
  orderNumber: '20261029-0001',
  type: 'DINE_IN',
  createdAt: new Date('2026-10-29T05:36:31Z'),
  table: { label: '1' },
  customer: null,
  items: [
    {
      nameSnapshot: 'Special <Elaichi>',
      quantity: 1,
      kitchenNote: null,
      modifiers: [],
    },
  ],
};

describe('browser KOT', () => {
  it('prints the whole order without ticket details', () => {
    const html = buildKotHtml({ branchName: 'VR Mall', order });
    expect(html).toContain('Special &lt;Elaichi&gt;');
    expect(html).not.toContain('Ticket:');
    expect(html).not.toContain('REPRINT');
  });

  it("shows one station's ticket, stamping later copies", () => {
    const first = buildKotHtml({
      branchName: 'VR Mall',
      order,
      ticket: { number: 'K-7', station: 'Tandoor', reprint: 0 },
    });
    expect(first).toContain('Ticket: K-7');
    expect(first).toContain('Tandoor');
    expect(first).not.toContain('REPRINT');
    const again = buildKotHtml({
      branchName: 'VR Mall',
      order,
      ticket: { number: 'K-7', station: null, reprint: 2 },
    });
    expect(again).toContain('*** REPRINT #2 ***');
  });

  it('prints in solid black for thermal printers', () => {
    const html = buildKotHtml({ branchName: 'VR Mall', order });
    const colours = html.match(/#[0-9a-f]{3,6}\b/gi) ?? [];
    expect(colours.every((c) => /^#0{3}(0{3})?$|^#f{3}(f{3})?$/i.test(c))).toBe(
      true,
    );
  });
});
