import { buildTableQrPdf, type QrTable } from './table-qr-pdf';

const tables = (n: number): QrTable[] =>
  Array.from({ length: n }, (_, i) => ({
    label: `Table ${i + 1}`,
    floor: i < n / 2 ? 'Ground floor' : 'Terrace',
    seats: 4,
    url: `https://fcartel.divtech.cloud/order/${'ab'.repeat(16)}${i}`,
  }));

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('table QR cards PDF', () => {
  it('puts four cards on each page after the index page', async () => {
    const pdf = await buildTableQrPdf({
      restaurantName: 'Surat Thali House',
      layout: 'cards',
      tables: tables(10),
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1 + 3);
  });

  it('one card per page in the large layout', async () => {
    const pdf = await buildTableQrPdf({
      restaurantName: 'Surat Thali House',
      layout: 'pages',
      tables: tables(3),
    });
    expect(pageCount(pdf)).toBe(1 + 3);
  });

  it('a long table list spills onto more index pages before the cards', async () => {
    const pdf = await buildTableQrPdf({
      restaurantName: 'Banquet',
      layout: 'cards',
      tables: tables(120),
    });
    expect(pageCount(pdf)).toBe(3 + 30); // three index pages, then 30 card pages
  });
});
