// The bill as a web page, for the link guests get on WhatsApp: opened on a
// phone, so it is a responsive page (not the 80 mm thermal layout) with the
// restaurant's logo and details, every item with its add-ons, the same totals
// as the printed receipt, a UPI "Pay" button while something is still due,
// and Print / Save as PDF.

import {
  resolveTaxIdLabel,
  resolveTaxLabel,
  type TaxMode,
  type TaxRegime,
} from '@nodedr-restaurant/types';
import { kotDateTime } from './kot.html';
import {
  CURRENCY_SYMBOLS,
  esc,
  receiptTotalRows,
  upiQrSvg,
  type ReceiptOrder,
} from './receipt.html';

export interface InvoicePageInput {
  restaurantName: string;
  /** Restaurant logo (absolute, or a path on this site). */
  logoUrl: string | null;
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
  upi?: { vpa: string; payeeName: string } | null;
  footer?: string | null;
  timeZone?: string;
  token?: number | null;
  /** CSP nonce for the page's one script (print / share / logo fallback). */
  nonce: string;
}

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine-in',
  QR_ORDER: 'Dine-in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  ONLINE: 'Online order',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  WALLET: 'Wallet',
  GIFT_CARD: 'Gift card',
  ONLINE: 'Online',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '•';

export function buildInvoicePageHtml(input: InvoicePageInput): string {
  const { order, branch, restaurantName } = input;
  const sym = CURRENCY_SYMBOLS[input.currency] ?? `${input.currency} `;
  const money = (n: number) =>
    `${sym}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const taxLabel = resolveTaxLabel(branch.taxRegime, branch.taxLabel);
  const taxIdValue =
    branch.taxId ||
    (branch.taxRegime === 'INDIA_GST' ? branch.gstNumber : null);
  const taxIdLabel = resolveTaxIdLabel(branch.taxRegime);
  const [date, time] = kotDateTime(
    new Date(order.createdAt),
    input.timeZone,
  ).split(' ');

  const due = order.isProvisional
    ? (order.balanceDue ?? order.totalAmount)
    : (order.balanceDue ?? 0);
  const paid = due <= 0.004;
  const upiLink =
    input.upi?.vpa && !paid
      ? `upi://pay?pa=${encodeURIComponent(input.upi.vpa)}&pn=${encodeURIComponent(input.upi.payeeName.slice(0, 60))}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill ${order.orderNumber}`)}`
      : null;

  const service = `${TYPE_LABEL[order.type] ?? order.type}${order.table ? ` · Table ${order.table.label.replace(/^T(?=\d)/, '')}` : ''}`;
  const totalQty = order.items.reduce((n, i) => n + i.quantity, 0);

  const items = order.items
    .map((item) => {
      const addOns = item.modifiers
        .map(
          (m) =>
            `<li>${esc(m.nameSnapshot)}${Number(m.priceAdjSnapshot) ? `<span>+${money(m.priceAdjSnapshot)}</span>` : ''}</li>`,
        )
        .join('');
      return `<li class="item">
        <div class="item-main">
          <div class="item-name">${esc(item.nameSnapshot)}</div>
          <div class="item-meta">${item.quantity} × ${money(item.quantity ? item.lineTotal / item.quantity : item.unitPriceSnapshot)}${Number(item.taxRateSnapshot) > 0 ? ` · ${esc(taxLabel)} ${item.taxRateSnapshot}%` : ''}</div>
          ${addOns ? `<ul class="addons">${addOns}</ul>` : ''}
        </div>
        <div class="item-total">${money(item.lineTotal)}</div>
      </li>`;
    })
    .join('');

  const totals = receiptTotalRows(branch, order, money, taxLabel)
    .map(
      ([k, v]) =>
        `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`,
    )
    .join('');

  const payments = order.payments
    .map(
      (p) =>
        `<div class="row muted"><span>Paid by ${esc(METHOD_LABEL[p.method] ?? p.method)}</span><span>${money(p.amount)}</span></div>`,
    )
    .join('');

  const logo = input.logoUrl
    ? `<img class="logo" id="logo" src="${esc(input.logoUrl)}" alt="${esc(restaurantName)}" data-initials="${esc(initials(restaurantName))}">`
    : `<div class="logo logo-fallback">${esc(initials(restaurantName))}</div>`;

  const contact = [
    branch.address ? esc(branch.address) : '',
    branch.phone
      ? `<a href="tel:${esc(branch.phone.replace(/[^\d+]/g, ''))}">${esc(branch.phone)}</a>`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#f6f3ef">
<title>Bill ${esc(order.orderNumber)} · ${esc(restaurantName)}</title>
<meta property="og:title" content="Your bill from ${esc(restaurantName)}">
<meta property="og:description" content="Bill #${esc(order.orderNumber)} · ${esc(money(order.totalAmount))}">
<style>
  :root {
    --bg: #f6f3ef; --card: #ffffff; --ink: #1c1917; --muted: #78716c; --line: #ece7e1;
    --soft: #faf8f5; --accent: #c2410c; --ok: #15803d; --ok-bg: #ecfdf3; --due: #b45309; --due-bg: #fff7ed;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #12100e; --card: #1c1917; --ink: #f5f5f4; --muted: #a8a29e; --line: #2e2a27;
      --soft: #24201d; --ok: #4ade80; --ok-bg: #0f2a1a; --due: #fbbf24; --due-bg: #2a1f0a; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; padding: 16px 16px max(24px, env(safe-area-inset-bottom)); }
  .wrap { max-width: 560px; margin: 0 auto; }
  .card { background: var(--card); border-radius: 20px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06); overflow: hidden; }
  header { padding: 24px 20px 20px; text-align: center; border-bottom: 1px dashed var(--line); }
  .logo { width: 72px; height: 72px; border-radius: 18px; object-fit: cover; display: block; margin: 0 auto 12px; background: var(--soft); }
  .logo-fallback { display: grid; place-items: center; font-weight: 700; font-size: 26px; color: #fff; background: linear-gradient(135deg, #ea580c, #be123c); }
  h1 { font-size: 22px; line-height: 1.2; margin: 0; letter-spacing: -.01em; }
  .branch { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .branch a { color: inherit; }
  .taxid { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .status { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .status.ok { color: var(--ok); background: var(--ok-bg); }
  .status.due { color: var(--due); background: var(--due-bg); }
  .amount { font-size: 34px; font-weight: 750; letter-spacing: -.02em; margin-top: 10px; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px 16px; padding: 16px 20px; background: var(--soft); font-size: 13px; }
  .meta div span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .meta div b { font-weight: 600; word-break: break-word; }
  .token { grid-column: 1 / -1; text-align: center; font-size: 13px; }
  .token b { display: block; font-size: 28px; }
  section { padding: 8px 20px 4px; }
  h2 { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin: 12px 0 4px; font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; }
  .item { display: flex; gap: 12px; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: 0; }
  .item-main { min-width: 0; }
  .item-name { font-weight: 600; word-break: break-word; }
  .item-meta { color: var(--muted); font-size: 13px; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .addons { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
  .addons li { font-size: 12px; background: var(--soft); border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; }
  .addons li span { color: var(--muted); margin-left: 4px; }
  .item-total { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { padding: 12px 20px 16px; border-top: 1px dashed var(--line); margin-top: 4px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 14px; font-variant-numeric: tabular-nums; }
  .row span:last-child { white-space: nowrap; }
  .muted { color: var(--muted); }
  .grand { font-size: 18px; font-weight: 750; padding-top: 10px; margin-top: 6px; border-top: 1px solid var(--line); }
  .pay { margin: 0 20px 20px; padding: 16px; border-radius: 16px; background: var(--due-bg); text-align: center; }
  .pay p { margin: 0 0 10px; font-size: 14px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 20px; border-radius: 14px; font-weight: 650; font-size: 15px; text-decoration: none; border: 0; cursor: pointer; font-family: inherit; }
  .btn-pay { background: var(--accent); color: #fff; width: 100%; }
  .qr { margin-top: 12px; display: none; }
  .qr svg { width: 168px; height: 168px; background: #fff; padding: 6px; border-radius: 12px; }
  @media (hover: hover) and (pointer: fine) { .qr { display: block; } }
  .note { margin: 0 20px 20px; padding: 12px 14px; border-radius: 12px; background: var(--soft); font-size: 13px; color: var(--muted); text-align: center; white-space: pre-line; }
  .actions { display: flex; gap: 10px; justify-content: center; margin: 16px 0 8px; }
  .btn-ghost { background: var(--card); color: var(--ink); border: 1px solid var(--line); }
  .foot { text-align: center; color: var(--muted); font-size: 12px; margin-top: 8px; }
  @media (min-width: 640px) { body { padding-top: 40px; } header { padding: 32px 28px 24px; } section, .totals { padding-left: 28px; padding-right: 28px; } .meta { padding: 18px 28px; grid-template-columns: repeat(4, minmax(0,1fr)); } }
  @media print {
    :root { --bg: #fff; --card: #fff; --ink: #000; --muted: #444; --line: #ddd; --soft: #f7f7f7; }
    body { padding: 0; background: #fff; }
    .card { box-shadow: none; border-radius: 0; }
    .actions, .pay, .foot { display: none !important; }
  }
</style>
</head>
<body>
<main class="wrap">
  <article class="card">
    <header>
      ${logo}
      <h1>${esc(restaurantName)}</h1>
      ${branch.name && branch.name !== restaurantName ? `<div class="branch">${esc(branch.name)}</div>` : ''}
      ${contact ? `<div class="branch">${contact}</div>` : ''}
      ${taxIdValue ? `<div class="taxid">${esc(taxIdLabel)}: ${esc(taxIdValue)}</div>` : ''}
      <div class="status ${paid ? 'ok' : 'due'}">${paid ? '✓ Paid' : '● Payment pending'}</div>
      <div class="amount">${money(order.totalAmount)}</div>
    </header>
    <div class="meta">
      <div><span>Bill no.</span><b>${esc(order.orderNumber)}</b></div>
      <div><span>Date</span><b>${esc(date)} · ${esc(time)}</b></div>
      <div><span>Order</span><b>${esc(service)}</b></div>
      <div><span>${order.customer ? 'Guest' : 'Items'}</span><b>${order.customer ? esc(order.customer.name) : `${totalQty}`}</b></div>
      ${input.token ? `<div class="token">Token<b>${input.token}</b></div>` : ''}
    </div>
    <section>
      <h2>Items · ${totalQty}</h2>
      <ul>${items}</ul>
    </section>
    <div class="totals">
      ${totals}
      <div class="row grand"><span>Total</span><span>${money(order.totalAmount)}</span></div>
      ${payments}
      ${!paid && order.amountPaid ? `<div class="row"><span>Balance due</span><span>${money(due)}</span></div>` : ''}
    </div>
    ${
      upiLink
        ? `<div class="pay">
      <p>Pay ${money(due)} with any UPI app</p>
      <a class="btn btn-pay" href="${esc(upiLink)}">Pay ${money(due)}</a>
      <div class="qr">${upiQrSvg(upiLink)}<p style="margin-top:6px;font-size:12px">Scan with your phone</p></div>
    </div>`
        : ''
    }
    ${input.footer ? `<div class="note">${esc(input.footer)}</div>` : ''}
  </article>
  <div class="actions">
    <button class="btn btn-ghost" type="button" id="print">Print / Save PDF</button>
    <button class="btn btn-ghost" type="button" id="share" hidden>Share</button>
  </div>
  <p class="foot">Thank you for visiting ${esc(restaurantName)}</p>
</main>
<script nonce="${esc(input.nonce)}">
  (function () {
    document.getElementById('print').onclick = function () { window.print(); };
    var logo = document.getElementById('logo');
    if (logo) logo.onerror = function () {
      var d = document.createElement('div');
      d.className = 'logo logo-fallback';
      d.textContent = logo.getAttribute('data-initials');
      logo.replaceWith(d);
    };
    var b = document.getElementById('share');
    if (b && navigator.share) {
      b.hidden = false;
      b.onclick = function () { navigator.share({ title: document.title, url: location.href }).catch(function () {}); };
    }
  })();
</script>
</body>
</html>`;
}
