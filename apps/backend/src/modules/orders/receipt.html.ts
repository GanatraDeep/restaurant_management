// Self-printing HTML receipt — ported from nodedr-pos's
// backend/src/lib/receipt.js (same 80mm-thermal-safe layout rules: @page
// margin 0, left-aligned body, box-sizing border-box so 80mm stays 80mm
// after padding). Loaded into a hidden iframe by the frontend
// (lib/print.ts), which calls window.print() itself; the inline script here
// is only a fallback for engines that block that cross-frame call.
//
// Multi-region tax (2026-09-27): which tax rows get shown, and whether the
// top line reads as a tax-inclusive subtotal or a pre-tax one, now follows
// the branch's taxRegime/taxMode — see resolveTaxLabel/resolveTaxIdLabel
// in @nodedr-restaurant/types. This file only changes labels and which
// rows are shown; order.subtotal/taxAmount/totalAmount are unchanged
// (computed once, correctly, in pricing.ts — see its own multi-region
// note) and are never recomputed here.

import QRCode from 'qrcode';
import { qrSvg } from '../verifactu/verifactu.qr';
import { kotDateTime } from './kot.html';
import type { ReceiptVerifactu } from './escpos-receipt';
import {
  resolveTaxIdLabel,
  resolveTaxLabel,
  TAX_REGIME_PRESETS,
  type TaxMode,
  type TaxRegime,
} from '@nodedr-restaurant/types';

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

interface ReceiptOrder {
  /** Spain VERI*FACTU invoice QR, printed on a paid receipt. */
  verifactu?: ReceiptVerifactu | null;
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label: string } | null;
  customer: { name: string; phone: string | null } | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
  totalAmount: number;
  /** Discount as a percentage of the subtotal, printed next to the amount. */
  discountPercent?: number;
  /** A bill handed over before payment: no "paid in full" wording. */
  isProvisional?: boolean;
  /** Applied so far / still owed; printed when set. */
  amountPaid?: number;
  balanceDue?: number;
  /** Who rang it up ("Cashier:"). */
  cashier?: string | null;
  items: {
    nameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: number;
    lineTotal: number;
    taxRateSnapshot: number;
    modifiers: { nameSnapshot: string; priceAdjSnapshot: number }[];
  }[];
  payments: {
    method: string;
    amount: number;
    tendered?: number | null;
    changeGiven?: number | null;
  }[];
}

export function buildReceiptHtml({
  restaurantName,
  branch,
  currency,
  order,
  upi,
  footer,
  timeZone,
}: {
  restaurantName: string;
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    gstNumber: string | null;
    taxRegime: TaxRegime;
    taxMode: TaxMode;
    taxLabel: string | null;
    taxId: string | null;
  };
  currency: string;
  order: ReceiptOrder;
  /** Restaurant UPI ID: a bill with something still to pay gets a Scan & Pay QR. */
  upi?: { vpa: string; payeeName: string } | null;
  /** The restaurant's own last line, e.g. "Thanks! Connect with us @bsc.chai_wala". */
  footer?: string | null;
  timeZone?: string;
}): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const money = (n: number) => `${sym}${Number(n).toFixed(2)}`;
  const [datePart, timePart] = kotDateTime(
    new Date(order.createdAt),
    timeZone,
  ).split(' ');
  const totalQty = order.items.reduce((n, i) => n + i.quantity, 0);
  const service =
    order.type === 'DINE_IN' || order.type === 'QR_ORDER'
      ? `Dine In${order.table ? `: ${order.table.label.replace(/^T(?=\d)/, '')}` : ''}`
      : order.type === 'DELIVERY'
        ? 'Delivery'
        : 'Pick Up';
  // What's left to pay: the QR asks for exactly that.
  const due = order.isProvisional
    ? (order.balanceDue ?? order.totalAmount)
    : (order.balanceDue ?? 0);
  const payQr =
    upi?.vpa && due > 0
      ? upiQrSvg(
          `upi://pay?pa=${encodeURIComponent(upi.vpa)}&pn=${encodeURIComponent(upi.payeeName.slice(0, 60))}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill ${order.orderNumber}`)}`,
        )
      : null;
  const taxLabel = resolveTaxLabel(branch.taxRegime, branch.taxLabel);
  // gstNumber is the pre-multi-region field every India install already
  // has populated; taxId is the new generic one. India falls back to the
  // old field so nothing already printed on file goes blank.
  const taxIdValue =
    branch.taxId ||
    (branch.taxRegime === 'INDIA_GST' ? branch.gstNumber : null);
  const taxIdLabel = resolveTaxIdLabel(branch.taxRegime);

  const itemRows = order.items
    .map((item) => {
      const modifierLines = item.modifiers
        .map((m) => `<div class="sub">+ ${esc(m.nameSnapshot)}</div>`)
        .join('');
      return `
        <tr>
          <td>${esc(item.nameSnapshot)}${modifierLines}${
            Number(item.taxRateSnapshot) > 0
              ? `<div class="sub">${esc(taxLabel)} @ ${item.taxRateSnapshot}%</div>`
              : ''
          }</td>
          <td class="q">${item.quantity}</td>
          <td class="num">${money(item.unitPriceSnapshot)}</td>
          <td class="num">${money(item.lineTotal)}</td>
        </tr>`;
    })
    .join('');

  const totalRows: [string, string][] = [];
  if (branch.taxMode === 'EXCLUSIVE') {
    // US-style: show the pre-tax subtotal, then add tax as its own line —
    // order.subtotal/taxAmount are unchanged, this only reslices the
    // display (see pricing.ts: the stored subtotal already has tax baked
    // in, exactly like every other regime, so the pre-tax figure the
    // customer expects to see is subtotal - taxAmount).
    totalRows.push(['Sub Total', money(order.subtotal - order.taxAmount)]);
    if (order.discountAmount > 0) {
      totalRows.push([
        order.discountPercent && order.discountPercent > 0
          ? `Discount (${Number(order.discountPercent)}%)`
          : 'Discount',
        `- ${money(order.discountAmount)}`,
      ]);
    }
    if (order.taxAmount > 0) {
      totalRows.push([taxLabel, money(order.taxAmount)]);
    }
  } else {
    totalRows.push(['Sub Total', money(order.subtotal)]);
    if (order.discountAmount > 0) {
      totalRows.push([
        order.discountPercent && order.discountPercent > 0
          ? `Discount (${Number(order.discountPercent)}%)`
          : 'Discount',
        `- ${money(order.discountAmount)}`,
      ]);
    }
    if (order.taxAmount > 0) {
      // Prices are tax-inclusive (see ARCHITECTURE.md) — this is a breakup
      // of tax already inside the total above, not an additional charge.
      if (TAX_REGIME_PRESETS[branch.taxRegime].splitCgstSgst) {
        const half =
          Math.round((order.taxAmount / 2 + Number.EPSILON) * 100) / 100;
        totalRows.push(['CGST (incl.)', money(half)]);
        totalRows.push(['SGST (incl.)', money(order.taxAmount - half)]);
      } else {
        totalRows.push([`${taxLabel} (incl.)`, money(order.taxAmount)]);
      }
    }
  }
  if (order.loyaltyDiscountAmount > 0) {
    totalRows.push([
      `Loyalty (${order.loyaltyPointsRedeemed} pts)`,
      `- ${money(order.loyaltyDiscountAmount)}`,
    ]);
  }
  if (order.tipAmount > 0) {
    totalRows.push(['Tip', money(order.tipAmount)]);
  }

  const paymentRows = order.payments.flatMap((p) => {
    const rows = [
      `<tr><td>Paid (${esc(p.method)})</td><td class="num">${money(p.amount)}</td></tr>`,
    ];
    if (p.tendered != null && p.changeGiven != null && p.changeGiven > 0) {
      rows.push(
        `<tr><td class="sub">&nbsp;&nbsp;Received</td><td class="num sub">${money(p.tendered)}</td></tr>`,
        `<tr><td class="sub">&nbsp;&nbsp;Change</td><td class="num sub">${money(p.changeGiven)}</td></tr>`,
      );
    }
    return rows;
  });
  const settlementRows =
    order.amountPaid !== undefined && order.balanceDue !== undefined
      ? `<table class="totals">
          <tr><td>Amount paid</td><td class="num">${money(order.amountPaid)}</td></tr>
          <tr class="grand"><td>Balance due</td><td class="num">${money(order.balanceDue)}</td></tr>
        </table>`
      : '';

  const [subLabel, subValue] = totalRows[0];
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(order.orderNumber)}</title>
<style>
  /* Thermal printers have no grey: the driver dithers anything lighter than
     black into sparse dots, which comes out faint and speckled. So every
     colour is pure black, hierarchy comes from size and weight, and strokes
     are heavy enough to survive the print head. */
  * { box-sizing: border-box; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { margin: 0; }
  body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: 0; padding: 3mm 4mm 6mm; color: #000; background: #fff; width: 80mm; font-weight: 600; font-size: 13px; -webkit-font-smoothing: none; text-rendering: geometricPrecision; }
  p { margin: 0 0 2px; }
  .center { text-align: center; }
  .pay { text-align: center; margin-bottom: 4px; }
  .pay svg { display: block; margin: 2px auto; }
  .pay .scan { font-size: 12px; font-weight: 700; }
  .doc { text-align: center; font-size: 14px; margin-top: 2px; }
  h1 { font-size: 18px; font-weight: 800; text-align: center; margin: 2px 0; text-transform: uppercase; letter-spacing: 0.3px; }
  .addr { text-align: center; font-size: 13px; line-height: 1.35; }
  .rule { border: none; border-top: 2px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 1px 0; vertical-align: top; word-break: break-word; }
  .meta td { font-size: 13px; }
  .r, .num { text-align: right; white-space: nowrap; padding-left: 6px; }
  .items th { font-size: 13px; font-weight: 700; text-align: left; padding-bottom: 3px; }
  .items td { font-size: 13px; padding: 2px 0; }
  .items .q { text-align: center; width: 1%; white-space: nowrap; padding: 2px 6px; }
  .sub { font-size: 11px; font-weight: 600; }
  .totals td { font-size: 13px; padding: 1px 0; }
  .grand td { font-weight: 800; font-size: 17px; padding: 2px 0; }
  .vf { text-align: center; font-size: 12px; }
  .vf svg { display: block; margin: 4px auto; }
  .footer { text-align: center; margin-top: 4px; font-size: 13px; line-height: 1.35; }
  .note { text-align: center; font-size: 11px; margin-top: 3px; }
  @page { size: 80mm auto; margin: 0; }
  @media print {
    html, body { width: 80mm; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <script>
    window.addEventListener('message', function (e) { if (e.data === 'print') window.print(); });
  </script>
  ${payQr ? `<div class="pay"><p class="scan">Scan &amp; Pay ${money(due)}</p>${payQr}</div>` : ''}
  <p class="doc">${taxIdValue ? 'TAX INVOICE' : 'RETAIL INVOICE'}</p>
  <h1>${esc(restaurantName)}</h1>
  <p class="addr">
    ${branch.address ? esc(branch.address) : esc(branch.name)}
    ${branch.phone ? `<br>Ph: ${esc(branch.phone)}` : ''}
    ${taxIdValue ? `<br>${esc(taxIdLabel)}: ${esc(taxIdValue)}` : ''}
  </p>
  <hr class="rule">
  <p>Name: ${order.customer ? `${esc(order.customer.name)}${order.customer.phone ? ` · ${esc(order.customer.phone)}` : ''}` : ''}</p>
  <hr class="rule">
  <table class="meta">
    <tr><td>Date: ${esc(datePart)}</td><td class="r"><strong>${esc(service)}</strong></td></tr>
    <tr><td>${esc(timePart)}</td><td></td></tr>
    <tr><td>Cashier: ${esc(order.cashier ?? '')}</td><td class="r">Bill No.: ${esc(order.orderNumber)}</td></tr>
  </table>
  <hr class="rule">
  <table class="items">
    <thead><tr><th>Item</th><th class="q">Qty.</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <hr class="rule">
  <table class="totals">
    <tr><td>Total Qty: ${totalQty}</td><td class="r">${esc(subLabel)}</td><td class="r">${esc(subValue.replace(sym, ''))}</td></tr>
    ${totalRows
      .slice(1)
      .map(
        ([l, v]) =>
          `<tr><td></td><td class="r">${esc(l)}</td><td class="r">${esc(v.replace(sym, ''))}</td></tr>`,
      )
      .join('')}
  </table>
  <hr class="rule">
  <table><tr class="grand"><td class="r" style="text-align:center">Grand Total</td><td class="r">${money(order.totalAmount)}</td></tr></table>
  <hr class="rule">
  ${
    paymentRows.length > 0
      ? `<table class="totals">${paymentRows.join('')}</table>`
      : ''
  }
  ${settlementRows}
  ${
    order.verifactu && !order.isProvisional
      ? `<hr class="rule"><div class="vf"><strong>Factura simplificada ${esc(order.verifactu.invoiceNumber)}</strong><div>${esc(order.verifactu.heading)}</div>${qrSvg(order.verifactu.url, '35mm')}<div>${esc(order.verifactu.legend)}</div><strong>${esc(order.verifactu.short)}</strong></div>`
      : ''
  }
  <p class="footer">${esc(footer?.trim() || 'Thank you! Visit again.')}</p>
  ${order.isProvisional ? '<p class="note">Bill only &mdash; not a receipt. Payment pending.</p>' : ''}
</body>
</html>`;
}

/**
 * The bill's Scan & Pay QR. Drawn row by row from the QR matrix (row =
 * y, column = x) with a white quiet zone, so every UPI app reads it.
 */
function upiQrSvg(data: string): string {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const q = 2; // quiet zone, in modules
  const cells: string[] = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (qr.modules.get(y, x)) cells.push(`M${x + q},${y + q}h1v1h-1z`);
    }
  }
  const size = n + q * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="34mm" height="34mm" shape-rendering="crispEdges" role="img" aria-label="UPI payment QR"><rect width="${size}" height="${size}" fill="#fff"/><path d="${cells.join('')}" fill="#000"/></svg>`;
}
