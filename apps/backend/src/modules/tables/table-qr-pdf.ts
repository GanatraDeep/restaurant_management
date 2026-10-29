// Printable table QR cards: an instructions + index page, then one card per
// table with its number printed large (on the front and again at the foot,
// so a card is never mixed up after cutting).
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { brandFonts } from '../../common/pdf-fonts';

export type QrLayout = 'cards' | 'pages';

export interface QrTable {
  label: string; // "Table 5" or the table's own name
  floor: string;
  seats: number;
  url: string;
}

export interface QrPdfInput {
  restaurantName: string;
  logoPath?: string | null;
  layout: QrLayout;
  tables: QrTable[];
}

const ACCENT = '#C0283A';
const MM = 72 / 25.4;

export function buildTableQrPdf(input: QrPdfInput): Promise<Buffer> {
  // Vector QR codes: razor-sharp at any print size and tiny files. Error
  // correction M survives a scuffed table tent.
  const qrs = input.tables.map(
    (t) => QRCode.create(t.url, { errorCorrectionLevel: 'M' }).modules,
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
      info: { Title: `${input.restaurantName} — table QR codes` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const { regular, bold } = brandFonts(doc);

    const pageW = 210 * MM;
    const pageH = 297 * MM;
    const perPage = input.layout === 'cards' ? 4 : 1;
    let firstCardPage = 2; // set once the index's length is known
    const where = (i: number) => {
      const page = Math.floor(i / perPage) + firstCardPage;
      if (perPage === 1) return `Page ${page}`;
      const pos = ['top left', 'top right', 'bottom left', 'bottom right'][
        i % 4
      ];
      return `Page ${page}, ${pos}`;
    };

    // --- Page 1: how to print + which card is which ------------------------
    doc.addPage();
    const m = 18 * MM;
    const w = pageW - 2 * m;
    doc
      .font(bold)
      .fontSize(20)
      .fillColor('#000')
      .text(`${input.restaurantName} — table QR codes`, m, m, { width: w });
    doc.moveDown(0.3);
    doc
      .font(regular)
      .fontSize(10)
      .fillColor('#444')
      .text(
        `${input.tables.length} ${input.tables.length === 1 ? 'table' : 'tables'} · generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        { width: w },
      );
    doc.moveDown(1);

    doc
      .font(bold)
      .fontSize(12)
      .fillColor(ACCENT)
      .text('HOW TO PRINT AND PLACE THEM', { width: w, characterSpacing: 0.5 });
    doc.moveDown(0.4);
    const steps = [
      'Print on A4, ideally thick paper or card. In the print dialog choose "Actual size" / 100% scale, not "Fit to page".',
      input.layout === 'cards'
        ? 'Each page holds four cards. Cut along the dashed lines — every card is A6 (105 × 148 mm), the size of a standard table tent.'
        : 'Each page holds one large card — use an A4 stand, or fold it for a tent.',
      'Every card shows its table number in large print at the top and again at the bottom. Put each card on the table with that number — the list below shows where each card is in this file.',
      'Guests scan the code with their phone camera to see the menu and order. Orders arrive marked with that table, so a card on the wrong table sends food to the wrong place.',
      'Laminate the cards or use an acrylic stand so they last. Before putting them out, scan one with your phone to check it opens your menu.',
      'If a card is lost or copied, open the table on the Tables page and choose "Generate new code" — the old card stops working; print a replacement from here.',
    ];
    steps.forEach((s, i) => {
      const y = doc.y;
      doc
        .font(bold)
        .fontSize(10)
        .fillColor('#000')
        .text(`${i + 1}.`, m, y, { width: 16 });
      doc
        .font(regular)
        .fontSize(10)
        .fillColor('#000')
        .text(s, m + 18, y, { width: w - 18, lineGap: 1.5 });
      doc.moveDown(0.45);
    });

    doc.moveDown(0.8);
    doc
      .font(bold)
      .fontSize(12)
      .fillColor(ACCENT)
      .text('WHICH CARD IS WHICH', m, doc.y, {
        width: w,
        characterSpacing: 0.5,
      });
    doc.moveDown(0.4);
    const cols = [
      { h: 'Table', x: 0, w: 0.34 },
      { h: 'Floor / area', x: 0.34, w: 0.26 },
      { h: 'Seats', x: 0.6, w: 0.1 },
      { h: 'Find it on', x: 0.7, w: 0.3 },
    ];
    const row = (vals: string[], head: boolean) => {
      if (doc.y > pageH - m - 14) {
        doc.addPage();
        doc.y = m;
      }
      const y = doc.y;
      doc
        .font(head ? bold : regular)
        .fontSize(head ? 9 : 10)
        .fillColor(head ? '#444' : '#000');
      vals.forEach((v, i) =>
        doc.text(v, m + cols[i].x * w, y, {
          width: cols[i].w * w - 6,
          lineBreak: false,
          ellipsis: true,
        }),
      );
      doc.y = y + ROW_H;
      doc
        .moveTo(m, doc.y - 3)
        .lineTo(m + w, doc.y - 3)
        .lineWidth(head ? 0.8 : 0.4)
        .strokeColor(head ? '#000' : '#ccc')
        .stroke();
    };
    // How many pages the list takes decides which page the first card is on.
    const ROW_H = 15;
    const firstPageRows = Math.floor((pageH - m - 14 - doc.y) / ROW_H) + 1;
    const nextPageRows = Math.floor((pageH - 2 * m - 14) / ROW_H) + 1;
    const rowsNeeded = input.tables.length + 1;
    firstCardPage =
      2 + Math.max(0, Math.ceil((rowsNeeded - firstPageRows) / nextPageRows));
    row(
      cols.map((c) => c.h),
      true,
    );
    input.tables.forEach((t, i) =>
      row([t.label, t.floor, String(t.seats), where(i)], false),
    );

    // --- The cards ---------------------------------------------------------
    input.tables.forEach((t, i) => {
      const slot = i % perPage;
      if (slot === 0) {
        doc.addPage();
        if (perPage === 4) cutLines();
      }
      const cw = perPage === 4 ? pageW / 2 : pageW;
      const ch = perPage === 4 ? pageH / 2 : pageH;
      const x = perPage === 4 ? (slot % 2) * cw : 0;
      const y = perPage === 4 ? Math.floor(slot / 2) * ch : 0;
      card(t, qrs[i], x, y, cw, ch, perPage === 4 ? 1 : 1.9);
    });
    doc.end();

    function drawQr(
      qr: QRCode.BitMatrix,
      x0: number,
      y0: number,
      size: number,
    ) {
      // One quiet-zone module each side, then every dark module as a square.
      const cell = size / (qr.size + 2);
      doc.save().rect(x0, y0, size, size).fill('#fff');
      for (let r = 0; r < qr.size; r++) {
        for (let c = 0; c < qr.size; c++) {
          if (qr.get(r, c))
            doc.rect(
              x0 + (c + 1) * cell,
              y0 + (r + 1) * cell,
              cell + 0.01,
              cell + 0.01,
            );
        }
      }
      doc.fill('#000').restore();
    }

    function cutLines() {
      doc.save().lineWidth(0.6).strokeColor('#999').dash(4, { space: 4 });
      doc
        .moveTo(pageW / 2, 0)
        .lineTo(pageW / 2, pageH)
        .stroke();
      doc
        .moveTo(0, pageH / 2)
        .lineTo(pageW, pageH / 2)
        .stroke();
      doc.undash().restore();
    }

    function card(
      t: QrTable,
      qr: QRCode.BitMatrix,
      x: number,
      y: number,
      cw: number,
      ch: number,
      k: number,
    ) {
      const pad = 9 * MM * k;
      const iw = cw - 2 * pad;
      let cy = y + pad;
      const center = (
        text: string,
        font: string,
        size: number,
        color: string,
        opts: PDFKit.Mixins.TextOptions = {},
      ) => {
        doc
          .font(font)
          .fontSize(size)
          .fillColor(color)
          .text(text, x + pad, cy, {
            width: iw,
            align: 'center',
            lineBreak: false,
            ellipsis: true,
            ...opts,
          });
        cy = doc.y;
      };

      if (input.logoPath) {
        try {
          doc.image(input.logoPath, x + cw / 2 - 7 * MM * k, cy, {
            fit: [14 * MM * k, 14 * MM * k],
            align: 'center',
          });
          cy += 15.5 * MM * k;
        } catch {
          // pdfkit reads PNG/JPEG only — skip the logo otherwise.
        }
      }
      center(input.restaurantName, bold, 11 * k, '#000');
      cy += 2 * MM * k;
      center(t.label.toUpperCase(), bold, 26 * k, ACCENT, {
        characterSpacing: 0.5,
      });
      center(t.floor, regular, 9 * k, '#444');
      cy += 3 * MM * k;

      const size = 58 * MM * k;
      drawQr(qr, x + (cw - size) / 2, cy, size);
      cy += size + 3 * MM * k;

      center('Scan to see the menu & order', bold, 11 * k, '#000');
      cy += 1 * MM * k;
      center(
        'Open your phone camera and point it at the code.',
        regular,
        8 * k,
        '#333',
      );
      center(
        `Your order comes straight to ${t.label}.`,
        regular,
        8 * k,
        '#333',
      );

      // Foot: the table again, so a card can't be mixed up after cutting.
      const footY = y + ch - pad - 9 * k;
      doc
        .moveTo(x + pad, footY - 3 * k)
        .lineTo(x + cw - pad, footY - 3 * k)
        .lineWidth(0.5)
        .strokeColor('#ddd')
        .stroke();
      doc
        .font(bold)
        .fontSize(8 * k)
        .fillColor('#000')
        .text(`${t.label} · ${t.floor}`, x + pad, footY, {
          width: iw * 0.6,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .font(regular)
        .fontSize(7 * k)
        .fillColor('#777')
        .text(`Seats ${t.seats}`, x + pad + iw * 0.6, footY + k, {
          width: iw * 0.4,
          align: 'right',
          lineBreak: false,
        });
    }
  });
}
