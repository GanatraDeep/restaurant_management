import { startOfLocalDay } from './orders.service';
import { buildKotHtml, kotDateTime } from './kot.html';

const order = {
  orderNumber: '20261102-0001',
  type: 'DINE_IN',
  createdAt: new Date('2026-11-02T16:49:00Z'),
  table: { label: 'T8' },
  customer: null,
  items: [
    {
      nameSnapshot: 'Water Bottle <Big>',
      quantity: 1,
      kitchenNote: null,
      modifiers: [],
    },
    {
      nameSnapshot: 'Paneer Tikka',
      quantity: 2,
      kitchenNote: 'Less spicy',
      modifiers: [{ nameSnapshot: 'Extra chutney' }],
    },
  ],
};

describe('KOT print', () => {
  it('has the Petpooja layout: time, KOT no, service, table, Item / Special Note / Qty', () => {
    const html = buildKotHtml({
      branchName: 'VR Mall',
      order,
      kotNos: [23],
      timeZone: 'Asia/Kolkata',
    });
    expect(html).toContain('02/11/26 22:19');
    expect(html).toContain('KOT - 23');
    expect(html).toContain('Dine In');
    expect(html).toContain('Table No: T8');
    expect(html).toMatch(
      /Item<\/th><th>Special Note<\/th><th class="qty">Qty\./,
    );
    expect(html).toContain('Water Bottle &lt;Big&gt;');
    expect(html).toMatch(/Extra chutney, Less spicy<\/td>\s*<td class="qty">2/);
    expect(html).toMatch(/<td class="note">--<\/td>/);
  });

  it('a station ticket shows its own KOT number, and later copies say REPRINT', () => {
    const first = buildKotHtml({
      branchName: 'VR Mall',
      order,
      ticket: { number: 'x-1', station: 'Tandoor', reprint: 0, kotNo: 7 },
    });
    expect(first).toContain('KOT - 7');
    expect(first).toContain('Tandoor');
    expect(first).not.toContain('REPRINT');
    const again = buildKotHtml({
      branchName: 'VR Mall',
      order,
      ticket: { number: 'x-1', station: null, reprint: 2, kotNo: 7 },
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

  it('formats in the restaurant time zone', () => {
    expect(kotDateTime(new Date('2026-11-02T18:31:00Z'), 'Asia/Kolkata')).toBe(
      '03/11/26 00:01',
    );
  });
});

describe('daily KOT numbering', () => {
  it('a day starts at local midnight', () => {
    const now = new Date('2026-11-02T20:00:00Z'); // 01:30 on 3 Nov in India
    expect(startOfLocalDay(now, 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-02T18:30:00.000Z',
    );
    expect(
      startOfLocalDay(new Date('2026-11-02T10:15:00Z'), 'UTC').toISOString(),
    ).toBe('2026-11-02T00:00:00.000Z');
  });
});

describe('token system', () => {
  const order = {
    orderNumber: '20261116-0007',
    type: 'TAKEAWAY',
    createdAt: new Date('2026-11-16T14:19:00Z'),
    table: null,
    customer: null,
    items: [
      {
        nameSnapshot: 'Patodi (Butter)',
        quantity: 1,
        kitchenNote: null,
        modifiers: [],
      },
    ],
  };

  it('stamps the token and adds the guest slip as a second page', () => {
    const html = buildKotHtml({
      branchName: 'Main',
      order,
      token: 7,
      tokenSlip: { restaurantName: 'Shree Sai Omelet Center' },
    });
    expect(html).toContain('<div class="token">TOKEN<b>7</b></div>');
    expect(html).toContain('<div class="slip">');
    expect(html).toContain('<p class="num">7</p>');
    expect(html).toContain('Shree Sai Omelet Center');
  });

  it('prints neither when the token system is off', () => {
    const html = buildKotHtml({ branchName: 'Main', order });
    expect(html).not.toContain('class="token"');
    expect(html).not.toContain('class="slip"');
  });
});

describe('58 mm paper', () => {
  it('narrows the page and shrinks the type', () => {
    const { fitPaper } =
      jest.requireActual<typeof import('./paper')>('./paper');
    const html = buildKotHtml({
      branchName: 'Main',
      order: {
        orderNumber: '1',
        type: 'DINE_IN',
        createdAt: new Date(),
        table: { label: 'T1' },
        customer: null,
        items: [],
      },
    });
    const small = fitPaper(html, 58);
    expect(small).toContain('@page { size: 58mm auto;');
    expect(small).toContain('width: 48mm');
    expect(small).not.toContain('80mm');
    expect(fitPaper(html, 80)).toBe(html);
  });
});
