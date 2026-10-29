// Self-printing HTML kitchen ticket — same iframe+window.print() pattern as
// receipt.html.ts, deliberately a separate template rather than reusing
// buildReceiptHtml with a "hide prices" flag: a KOT is read by kitchen
// staff standing at a station under pressure, not a customer, so it needs
// large type, item names as the loudest thing on the page, and zero price/
// tax noise — different enough from a receipt that a shared template with
// conditionals would be harder to read than two small, honest ones.

function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

interface KotOrder {
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label: string } | null;
  customer: { name: string } | null;
  items: {
    nameSnapshot: string;
    quantity: number;
    kitchenNote: string | null;
    modifiers: { nameSnapshot: string }[];
  }[];
}

export function buildKotHtml({
  branchName,
  order,
}: {
  branchName: string;
  order: KotOrder;
}): string {
  const dateStr = new Date(order.createdAt).toLocaleString();

  const itemRows = order.items
    .map((item) => {
      const modifierLines = item.modifiers
        .map((m) => `<div class="sub">+ ${esc(m.nameSnapshot)}</div>`)
        .join('');
      const noteLine = item.kitchenNote
        ? `<div class="note">Note: ${esc(item.kitchenNote)}</div>`
        : '';
      return `
        <tr>
          <td class="qty">${item.quantity}×</td>
          <td>${esc(item.nameSnapshot)}${modifierLines}${noteLine}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>KOT ${esc(order.orderNumber)}</title>
<style>
  /* Thermal printers have no grey: the driver dithers anything lighter than
     black into sparse dots, which comes out faint and speckled. So every
     colour is pure black, hierarchy comes from size and weight, and strokes
     are heavy enough to survive the print head. */
  * { box-sizing: border-box; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { margin: 0; }
  body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: 0; padding: 4mm; color: #000; background: #fff; width: 80mm; font-weight: 600; -webkit-font-smoothing: none; text-rendering: geometricPrecision; }
  p { margin: 0 0 3px; }
  .kot { width: 100%; margin: 0; }
  h1 { font-size: 20px; font-weight: 800; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .center { text-align: center; }
  .muted { font-size: 13px; line-height: 1.45; }
  .rule { border: none; border-top: 2px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 18px; font-weight: 700; }
  td { padding: 4px 0; vertical-align: top; word-break: break-word; }
  .qty { font-weight: 800; white-space: nowrap; padding-right: 8px; width: 1%; }
  .sub { font-size: 14px; font-weight: 600; padding-left: 4px; }
  .note { font-size: 14px; font-weight: 800; padding-left: 4px; }
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
  <div class="kot">
    <h1>Kitchen order</h1>
    <p class="center muted">${esc(branchName)}</p>
    <hr class="rule">
    <p class="muted">
      ${esc(dateStr)}<br>
      Order: #${esc(order.orderNumber)} · ${esc(order.type.replace('_', ' '))}
      ${order.table ? `<br><strong>Table: ${esc(order.table.label)}</strong>` : ''}
      ${order.customer ? `<br>Guest: ${esc(order.customer.name)}` : ''}
    </p>
    <hr class="rule">
    <table>
      <tbody>${itemRows}</tbody>
    </table>
    <hr class="rule">
  </div>
</body>
</html>`;
}
