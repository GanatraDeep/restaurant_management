import { scriptRuns } from './pdf-fonts';
import { buildCataloguePdf } from '../modules/menu/menu-transfer';

describe('scriptRuns', () => {
  it('splits Gujarati / Devanagari from Latin, keeping spaces in the run', () => {
    expect(scriptRuns('બોઈલ ફ્રાય (તેલમાં) · 2 Eggs')).toEqual([
      { text: 'બોઈલ ફ્રાય ', script: 'gu' },
      { text: '(', script: null },
      { text: 'તેલમાં', script: 'gu' },
      { text: ') · 2 Eggs', script: null },
    ]);
    expect(scriptRuns('मसाला डोसा')).toEqual([
      { text: 'मसाला डोसा', script: 'hi' },
    ]);
  });
});

describe('catalogue PDF in Indian scripts', () => {
  it('embeds the Noto fonts and survives marks fontkit cannot position', async () => {
    const pdf = await buildCataloguePdf({
      restaurantName: 'શ્રી સાઈ ઓમલેટ',
      address: 'શ્રી સાઈ ઓમલેટ સેન્ટર, Rajkot',
      currency: 'INR',
      categories: [
        {
          name: 'ઇંડા',
          items: [
            {
              name: 'Angoori Rabadi',
              // "અંગુરી" crashed fontkit's above-base mark positioning.
              description: 'અંગુરી રબડી · 6 Eggs',
              price: 350,
              halfPrice: null,
              isVeg: false,
            },
            {
              name: 'मसाला डोसा',
              description: null,
              price: 80,
              halfPrice: null,
              isVeg: true,
            },
          ],
        },
      ],
    });
    const raw = pdf.toString('latin1');
    expect(raw).toMatch(/NotoSansGujarati/);
    expect(raw).toMatch(/NotoSansDevanagari/);
  });
});
