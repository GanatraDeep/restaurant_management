import { existsSync } from 'node:fs';
import { join } from 'node:path';

// dist/src/common (built) or src/common (tests) -> apps/backend/assets/fonts
function fontDir(): string | null {
  for (const up of ['../../assets/fonts', '../../../assets/fonts']) {
    const dir = join(__dirname, up);
    if (existsSync(join(dir, 'DejaVuSans.ttf'))) return dir;
  }
  return null;
}

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
  const dir = fontDir();
  if (dir) {
    doc.registerFont('body', join(dir, 'DejaVuSans.ttf'));
    doc.registerFont('body-bold', join(dir, 'DejaVuSans-Bold.ttf'));
    return { regular: 'body', bold: 'body-bold', rupee: true };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', rupee: false };
}

// --- Indian scripts --------------------------------------------------------
// DejaVu has no Gujarati or Devanagari, so menu text written in them came out
// as empty boxes. Noto Sans Gujarati / Devanagari (OFL, bundled) cover them,
// and pdfkit's font engine shapes the conjuncts and vowel signs. Those fonts
// carry only their own script, so mixed text ("બોઈલ ફ્રાય (તેલમાં) · 2 Eggs")
// is drawn as runs, each in the font that has its letters.

type Script = 'gu' | 'hi';
const SCRIPT_FILES: Record<Script, [string, string]> = {
  gu: ['NotoSansGujarati-Regular.woff', 'NotoSansGujarati-Bold.woff'],
  hi: ['NotoSansDevanagari-Regular.woff', 'NotoSansDevanagari-Bold.woff'],
};

function scriptOf(ch: string): Script | null {
  const c = ch.codePointAt(0)!;
  if (c >= 0x0a80 && c <= 0x0aff) return 'gu';
  // Devanagari (Hindi, Marathi), incl. its extended block.
  if ((c >= 0x0900 && c <= 0x097f) || (c >= 0xa8e0 && c <= 0xa8ff)) {
    return 'hi';
  }
  return null;
}

/** Splits text into runs of one script; spaces and joiners stay in the run. */
export function scriptRuns(
  text: string,
): { text: string; script: Script | null }[] {
  const runs: { text: string; script: Script | null }[] = [];
  for (const ch of text) {
    const joiner = ch === ' ' || ch === '‌' || ch === '‍';
    const prev = runs[runs.length - 1];
    const s = joiner && prev ? prev.script : scriptOf(ch);
    if (prev && prev.script === s) prev.text += ch;
    else runs.push({ text: ch, script: s });
  }
  return runs;
}

export interface MixedFonts {
  regular: string;
  bold: string;
  /** Registered script fonts; empty if the files are missing. */
  scripts: Partial<Record<Script, { regular: string; bold: string }>>;
}

export function mixedFonts(doc: PDFKit.PDFDocument): MixedFonts {
  const base = brandFonts(doc);
  const dir = fontDir();
  const scripts: MixedFonts['scripts'] = {};
  if (dir) {
    for (const [s, [reg, bold]] of Object.entries(SCRIPT_FILES) as [
      Script,
      [string, string],
    ][]) {
      if (!existsSync(join(dir, reg))) continue;
      doc.registerFont(`${s}-regular`, join(dir, reg));
      doc.registerFont(`${s}-bold`, join(dir, bold));
      scripts[s] = { regular: `${s}-regular`, bold: `${s}-bold` };
    }
  }
  return { regular: base.regular, bold: base.bold, scripts };
}

const fontFor = (f: MixedFonts, script: Script | null, bold: boolean) => {
  const s = script ? f.scripts[script] : undefined;
  return s ? (bold ? s.bold : s.regular) : bold ? f.bold : f.regular;
};

/**
 * doc.text() for text that may mix scripts. Font size and colour are taken
 * from the document as set; `bold` picks the weight.
 */
export function mixedText(
  doc: PDFKit.PDFDocument,
  f: MixedFonts,
  text: string,
  x: number | undefined,
  y: number | undefined,
  opts: PDFKit.Mixins.TextOptions & { bold?: boolean } = {},
): void {
  const { bold = false, ...textOpts } = opts;
  const runs = scriptRuns(text);
  if (runs.length <= 1) {
    doc.font(fontFor(f, runs[0]?.script ?? null, bold));
    const o = {
      ...textOpts,
      ...(runs[0]?.script ? shapingFallback(doc, text) : {}),
    } as PDFKit.Mixins.TextOptions;
    if (x === undefined) doc.text(text, o);
    else doc.text(text, x, y, o);
    return;
  }
  // pdfkit misplaces continued runs on centred / right-aligned lines, so a
  // mixed line that fits is placed by hand.
  if (
    (textOpts.align === 'center' || textOpts.align === 'right') &&
    x !== undefined &&
    textOpts.width
  ) {
    const pieces = runs.map((run) => {
      doc.font(fontFor(f, run.script, bold));
      const extra = run.script ? shapingFallback(doc, run.text) : {};
      return {
        run,
        extra,
        w: doc.widthOfString(run.text, { ...textOpts, ...extra } as never),
        h: doc.currentLineHeight(true),
      };
    });
    const total = pieces.reduce((n, p) => n + p.w, 0);
    if (total <= textOpts.width) {
      const top = y ?? doc.y;
      let cx =
        x +
        (textOpts.align === 'center'
          ? (textOpts.width - total) / 2
          : textOpts.width - total);
      for (const p of pieces) {
        doc.font(fontFor(f, p.run.script, bold));
        doc.text(p.run.text, cx, top, {
          ...textOpts,
          ...p.extra,
          align: 'left',
          width: undefined,
          lineBreak: false,
        } as PDFKit.Mixins.TextOptions);
        cx += p.w;
      }
      doc.x = x;
      doc.y = top + Math.max(...pieces.map((p) => p.h));
      return;
    }
  }
  runs.forEach((run, i) => {
    doc.font(fontFor(f, run.script, bold));
    const o = {
      ...textOpts,
      continued: i < runs.length - 1,
      ...(run.script ? shapingFallback(doc, run.text) : {}),
    } as PDFKit.Mixins.TextOptions;
    if (i === 0 && x !== undefined) doc.text(run.text, x, y, o);
    else doc.text(run.text, o);
  });
}

/**
 * fontkit crashes positioning some vowel/anusvara marks in these fonts
 * ("અંગુરી": the font has no above-base anchor for that pair). For a run that
 * won't shape, switch off mark positioning — first only above-base marks,
 * then all — so the text still prints, the mark just sits at its default
 * place. Fresh objects each time: fontkit fills in the one it is given.
 */
function shapingFallback(
  doc: PDFKit.PDFDocument,
  text: string,
): { features?: Record<string, boolean> } {
  const attempts: (() => Record<string, boolean> | undefined)[] = [
    () => undefined,
    () => ({ abvm: false }),
    () => ({ abvm: false, blwm: false, mark: false, mkmk: false, dist: false }),
  ];
  for (const features of attempts) {
    try {
      doc.widthOfString(text, { features: features() } as never);
      const f = features();
      return f ? { features: f } : {};
    } catch {
      // try the next, gentler shaping
    }
  }
  return { features: attempts[2]()! };
}

/**
 * Height mixedText() will take. Wrapping is measured in the Latin font (an
 * Indian-script font must never be handed letters it doesn't have — fontkit
 * crashes positioning marks on missing glyphs), then scaled up to the
 * tallest line height among the scripts present.
 */
export function mixedHeight(
  doc: PDFKit.PDFDocument,
  f: MixedFonts,
  text: string,
  opts: PDFKit.Mixins.TextOptions & { bold?: boolean } = {},
): number {
  const { bold = false, ...textOpts } = opts;
  doc.font(fontFor(f, null, bold));
  const base = doc.currentLineHeight(true);
  const h = doc.heightOfString(text, textOpts);
  let ratio = 1;
  for (const s of new Set(scriptRuns(text).map((r) => r.script))) {
    if (!s || !f.scripts[s]) continue;
    doc.font(fontFor(f, s, bold));
    ratio = Math.max(ratio, doc.currentLineHeight(true) / base);
  }
  doc.font(fontFor(f, null, bold));
  return h * ratio;
}
