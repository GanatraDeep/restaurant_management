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
interface DesktopPrintBridge {
  printUrl?: (url: string) => Promise<unknown>;
}
function desktopBridge(): DesktopPrintBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { nativePrint?: DesktopPrintBridge }).nativePrint;
}

/** True inside the desktop app: prints go out silently, no dialog. */
export function hasSilentPrinting(): boolean {
  return typeof desktopBridge()?.printUrl === "function";
}

/**
 * Loads one of the backend's self-printing pages and prints it: silently in
 * the desktop app, otherwise through the browser's print dialog. Resolves
 * once printing is done (or the dialog closes), so callers can print several
 * in turn.
 */
function printPage(src: string): Promise<void> {
  const url = `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const bridge = desktopBridge();
  if (typeof bridge?.printUrl === "function") {
    return bridge
      .printUrl(new URL(url, window.location.origin).href)
      .then(() => undefined)
      .catch(() => undefined);
  }
  return new Promise((resolve) => {
    const frame = getPrintFrame();
    frame.onload = () => {
      const win = frame.contentWindow;
      if (win) {
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
  printPage(`/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}`);
}

/** Kitchen ticket for the whole order (every station's items). */
export function openKotPrint(orderId: string, branchId: string) {
  printPage(`/api/v1/orders/${orderId}/kot?branchId=${branchId}`);
}

/** Auto-print: a ticket this device already claimed (prints as the first copy). */
export function openClaimedTicketPrint(ticketId: string, branchId: string) {
  return printPage(`/api/v1/kds/auto-print/${ticketId}/kot?branchId=${branchId}`);
}

/** One station's ticket from the Kitchen Display; later copies say REPRINT. */
export function openTicketPrint(ticketId: string, branchId: string) {
  printPage(`/api/v1/kds/tickets/${ticketId}/kot?branchId=${branchId}`);
}

/** Sample kitchen ticket, to check the printer from Settings. */
export function openSampleKotPrint() {
  printPage(`/api/v1/orders/print/sample-kot`);
}
