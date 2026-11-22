import { api } from "@/lib/api";

// Ported from nodedr-pos's frontend/lib/print.ts: loads the backend's
// self-printing receipt HTML into a hidden same-page iframe rather than a
// new tab, so there's no blank/finished tab left for the cashier to notice
// and close. The OS print dialog still opens exactly as it would for any
// other page (any printer, or "Save as PDF").
let printFrame: HTMLIFrameElement | null = null;

function getPrintFrame(): HTMLIFrameElement {
  if (printFrame) return printFrame;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // Positioned far off-screen rather than display:none/width:0 — a 0-width
  // frame forces the browser to lay out the receipt at 0px before printing,
  // clipping the right-aligned amount columns. A real box lets it lay out
  // normally; the huge negative offset keeps it invisible without affecting
  // page layout.
  frame.style.position = "fixed";
  frame.style.top = "-10000px";
  frame.style.left = "-10000px";
  frame.style.width = "380px";
  frame.style.height = "600px";
  frame.style.border = "none";
  document.body.appendChild(frame);
  printFrame = frame;
  return frame;
}

/** Bill figures the cashier has typed but not yet saved (see receipt route). */
export type BillQuery = Record<string, string | number | undefined>;

export function billQueryString(adj: BillQuery = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(adj)) {
    if (v !== undefined && v !== "" && v !== 0) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `&${s}` : "";
}

/**
 * The F Cartel desktop app (Electron) exposes this bridge. Electron ignores
 * Chrome's --kiosk-printing, and a print() from inside an iframe can't be
 * made silent, so in the app the page's address is handed over instead: the
 * app loads it in a hidden window (same login) and prints it straight to the
 * chosen printer, no dialog.
 */
/** What a print is: KOTs go to the kitchen printer, bills to the counter one. */
export type PrintKind = "kot" | "bill";

export interface DesktopPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
}
export interface DesktopPrinterSettings {
  defaultPrinter: string;
  kotPrinter: string;
  billPrinter: string;
  version?: string;
}

interface DesktopPrintBridge {
  /** 1.0: prints the current window only (the app patches its window.print). */
  print?: () => Promise<unknown>;
  /** 1.1+: prints one of our pages silently; 1.2 also routes by kind. */
  printUrl?: (url: string, opts?: { kind?: PrintKind; printer?: string }) => Promise<unknown>;
  /** 1.2+: printer choice from Settings -> Printing. */
  getPrinters?: () => Promise<DesktopPrinter[]>;
  getPrinterSettings?: () => Promise<DesktopPrinterSettings | null>;
  setPrinter?: (kind: "default" | PrintKind, name: string) => Promise<boolean>;
  version?: string;
}
function desktopBridge(): DesktopPrintBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { nativePrint?: DesktopPrintBridge }).nativePrint;
}

/** True inside the desktop app: prints go out silently, no dialog. */
export function hasSilentPrinting(): boolean {
  const b = desktopBridge();
  return typeof b?.printUrl === "function" || typeof b?.print === "function";
}

/** The desktop app, if this is it: its version and what it can do. */
export function desktopApp(): { version: string; perKindPrinters: boolean; outdated: boolean } | null {
  const b = desktopBridge();
  if (!b || (typeof b.print !== "function" && typeof b.printUrl !== "function")) return null;
  const perKindPrinters = typeof b.getPrinters === "function" && typeof b.setPrinter === "function";
  return {
    version: b.version ?? (typeof b.printUrl === "function" ? "1.1" : "1.0"),
    perKindPrinters,
    outdated: !perKindPrinters,
  };
}

/** "1.3.0" >= "1.3"? Missing parts count as 0. */
function atLeast(version: string | undefined, want: string): boolean {
  const a = (version ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
  const b = want.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/**
 * Desktop app 1.3+ can print a page on a printer named per print — each
 * kitchen station's KOT goes to that station's printer.
 */
export function hasStationPrinters(): boolean {
  const b = desktopBridge();
  return typeof b?.printUrl === "function" && atLeast(b.version, "1.3");
}

export const desktopPrinters = {
  list: () => desktopBridge()?.getPrinters?.() ?? Promise.resolve([] as DesktopPrinter[]),
  settings: () => desktopBridge()?.getPrinterSettings?.() ?? Promise.resolve(null),
  set: (kind: "default" | PrintKind, name: string) =>
    desktopBridge()?.setPrinter?.(kind, name) ?? Promise.resolve(false),
};

/**
 * Desktop app 1.0 can only print a whole window silently (it patches each
 * window's print()). The page opens in a small pop-up window of the app,
 * prints silently through that patch, and closes again.
 */
function printInAppPopup(url: string): Promise<void> {
  return new Promise((resolve) => {
    const w = window.open(url, "fcartel-print", "width=420,height=640");
    if (!w) return resolve();
    const started = Date.now();
    const tick = () => {
      let ready = false;
      try {
        ready = w.document.readyState === "complete" && !!w.document.body;
      } catch {
        /* not loaded yet */
      }
      if (!ready && Date.now() - started < 15000) return void setTimeout(tick, 150);
      try {
        if (ready && !w.document.body.hasAttribute("data-noprint")) w.print();
      } catch {
        /* closed by the user */
      }
      // The job is handed to the printer before the window goes.
      setTimeout(() => {
        try {
          w.close();
        } catch {
          /* already closed */
        }
        resolve();
      }, 4000);
    };
    setTimeout(tick, 300);
  });
}

/**
 * Loads one of the backend's self-printing pages and prints it: silently in
 * the desktop app, otherwise through the browser's print dialog. Resolves
 * once printing is done (or the dialog closes), so callers can print several
 * in turn.
 */
const PAPER_KEY = "fc.paperWidth";

/** Roll width of this device's receipt printer: 80 mm (default) or 58 mm. */
export function getPaperWidth(): 58 | 80 {
  try {
    return localStorage.getItem(PAPER_KEY) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export function setPaperWidth(w: 58 | 80) {
  try {
    localStorage.setItem(PAPER_KEY, String(w));
  } catch {
    /* private mode: stays 80 mm */
  }
}

function printPage(src: string, kind: PrintKind, printer?: string | null): Promise<void> {
  const paper = getPaperWidth() === 58 ? "&paper=58" : "";
  const url = `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}${paper}`;
  const bridge = desktopBridge();
  if (typeof bridge?.printUrl === "function") {
    // 1.2 sends KOTs to the kitchen printer and bills to the counter one;
    // 1.3 also takes a printer by name (a station's own printer) and falls
    // back to the kind's printer when this computer doesn't have it.
    const opts = printer && hasStationPrinters() ? { kind, printer } : { kind };
    return bridge
      .printUrl(new URL(url, window.location.origin).href, opts)
      .then(() => undefined)
      .catch(() => undefined);
  }
  if (typeof bridge?.print === "function") return printInAppPopup(url);
  return new Promise((resolve) => {
    const frame = getPrintFrame();
    frame.onload = () => {
      const win = frame.contentWindow;
      // e.g. a KOT for an order of counter-only items: nothing to print.
      let skip = false;
      try {
        skip = !!win?.document.body?.hasAttribute("data-noprint");
      } catch {
        /* cross-origin: print as usual */
      }
      if (win && !skip) {
        try {
          win.focus();
          win.print();
        } catch {
          win.postMessage("print", "*");
        }
      }
      resolve();
    };
    // The timestamp forces a reload even when printing the same page twice in a row.
    frame.src = url;
  });
}

/** Browser print of the bill (open order) or receipt (paid order). Read-only. */
export function openReceiptPrint(orderId: string, branchId: string, adj: BillQuery = {}) {
  printPage(`/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}`, "bill");
}

/**
 * Kitchen ticket for the whole order (every station's items). `onlyNew`
 * prints just the round that was sent and not yet printed (POS "Save & Print KOT").
 */
export async function openKotPrint(orderId: string, branchId: string, opts: { onlyNew?: boolean } = {}) {
  const base = `/api/v1/orders/${orderId}/kot?branchId=${branchId}${opts.onlyNew ? "&new=1" : ""}`;
  // Desktop app 1.3+ with a station that has its own printer: one print per
  // station, each to its printer (stations without one use the KOT printer).
  if (hasStationPrinters()) {
    try {
      const { stations } = await api.get<{ stations: { station: string; printerName: string | null }[] }>(
        `/orders/${orderId}/kot-plan?branchId=${branchId}${opts.onlyNew ? "&new=1" : ""}`,
      );
      if (stations.length > 1 && stations.some((s) => s.printerName)) {
        for (const s of stations) {
          await printPage(`${base}&station=${encodeURIComponent(s.station)}`, "kot", s.printerName);
        }
        return;
      }
      if (stations.length === 1 && stations[0].printerName) {
        return printPage(base, "kot", stations[0].printerName);
      }
    } catch {
      /* fall back to one page on the KOT printer */
    }
  }
  return printPage(base, "kot");
}

/**
 * Counter slip: the order's items that don't go to the kitchen (water,
 * soft drinks) — printed on the counter (bill) printer. `onlyNew` = just the
 * items not on a slip yet. Nothing to print → the page is skipped.
 */
export function openCounterPrint(orderId: string, branchId: string, opts: { onlyNew?: boolean } = {}) {
  return printPage(`/api/v1/orders/${orderId}/counter-slip?branchId=${branchId}${opts.onlyNew ? "&new=1" : ""}`, "bill");
}

/**
 * KOT to the kitchen printer, then the counter slip to the counter printer —
 * one after the other, since a browser prints through a single frame.
 */
export async function openOrderTicketsPrint(
  orderId: string,
  branchId: string,
  opts: { onlyNew?: boolean; kitchen?: boolean; counter?: boolean } = {},
) {
  const { kitchen = true, counter = true, onlyNew } = opts;
  if (kitchen) await openKotPrint(orderId, branchId, { onlyNew });
  if (counter) await openCounterPrint(orderId, branchId, { onlyNew });
}

/** Auto-print: a ticket this device already claimed (prints as the first copy). */
export function openClaimedTicketPrint(ticketId: string, branchId: string, printer?: string | null) {
  return printPage(`/api/v1/kds/auto-print/${ticketId}/kot?branchId=${branchId}`, "kot", printer);
}

/** One station's ticket from the Kitchen Display; later copies say REPRINT. */
export function openTicketPrint(ticketId: string, branchId: string, printer?: string | null) {
  printPage(`/api/v1/kds/tickets/${ticketId}/kot?branchId=${branchId}`, "kot", printer);
}

/** Sample kitchen ticket, to check the printer from Settings. */
export function openSampleKotPrint() {
  printPage(`/api/v1/orders/print/sample-kot`, "kot");
}
