import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Registers the bundled DejaVu Sans on a pdfkit document (the built-in PDF
 * fonts have no ₹ glyph). Falls back to Helvetica if the font files are
 * missing, with `rupee` saying whether "₹" can be printed.
 */
export function brandFonts(doc: PDFKit.PDFDocument): {
  regular: string;
  bold: string;
  rupee: boolean;
} {
  // dist/src/common (built) or src/common (tests) → apps/backend/assets/fonts
  for (const up of ['../../assets/fonts', '../../../assets/fonts']) {
    const dir = join(__dirname, up);
    if (existsSync(join(dir, 'DejaVuSans.ttf'))) {
      doc.registerFont('body', join(dir, 'DejaVuSans.ttf'));
      doc.registerFont('body-bold', join(dir, 'DejaVuSans-Bold.ttf'));
      return { regular: 'body', bold: 'body-bold', rupee: true };
    }
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', rupee: false };
}
