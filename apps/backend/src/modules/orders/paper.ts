// KOTs, bills and token slips are laid out for 80 mm thermal rolls (72 mm
// printable). Small Bluetooth/USB printers (EZO and most "2 inch" ones) take
// 58 mm rolls with only ~48 mm printable, so the 80 mm page runs off the
// right edge. fitPaper rewrites a page's styles for that roll: 48 mm body
// centred on a 58 mm page, every font a size smaller. The device's choice
// rides on the print URL as ?paper=58 (Settings -> Printing).

export type PaperWidth = 58 | 80;

export const paperOf = (q: unknown): PaperWidth =>
  q === '58' || q === 58 ? 58 : 80;

export function fitPaper(html: string, paper: PaperWidth): string {
  if (paper !== 58) return html;
  return html.replace(/<style>([\s\S]*?)<\/style>/, (_m, css: string) => {
    const scaled = css
      .replace(/@page\s*\{\s*size:\s*80mm auto;/g, '@page { size: 58mm auto;')
      .replace(/width:\s*80mm/g, 'width: 48mm')
      .replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (_f, n: string) => {
        const px = Math.max(9, Math.round(Number(n) * 0.82));
        return `font-size: ${px}px`;
      });
    return `<style>${scaled}
  /* 58 mm roll: centre the 48 mm printable strip, no side padding. */
  body { margin: 0 auto !important; padding-left: 0 !important; padding-right: 0 !important; }
</style>`;
  });
}
