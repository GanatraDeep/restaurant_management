// Self-printing HTML kitchen ticket — same iframe+window.print() pattern as
// receipt.html.ts, deliberately a separate template rather than reusing
// buildReceiptHtml with a "hide prices" flag: a KOT is read by kitchen
// staff standing at a station under pressure, not a customer, so it needs
// large type, item names as the loudest thing on the page, and zero price/
// tax noise — different enough from a receipt that a shared template with
// conditionals would be harder to read than two small, honest ones.
//
// Layout follows the Petpooja KOT restaurants are used to: date and time,
// "KOT - 23", service type, table, then Item / Special Note / Qty.

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

const SERVICE: Record<string, string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Pick Up',
  DELIVERY: 'Delivery',
  QR_ORDER: 'Dine In',
};

/** dd/mm/yy HH:mm in the restaurant's time zone. */
export function kotDateTime(d: Date, timeZone = 'Asia/Kolkata'): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(d)
      .replace(',', '');
  try {
    return fmt(timeZone);
  } catch {
    return fmt('Asia/Kolkata');
  }
}

export function buildKotHtml({
  branchName,
  order,
  ticket,
  kotNos,
  timeZone,
}: {
  branchName: string;
  order: KotOrder;
  /** One station's ticket (from the Kitchen Display); `reprint` > 0 stamps the copy. */
  ticket?: {
    number: string;
    station: string | null;
    reprint: number;
    kotNo?: number | null;
  };
  /** Daily KOT numbers this print covers (the whole order's, or one round's). */
  kotNos?: number[];
  timeZone?: string;
}): string {
  const nos = ticket?.kotNo ? [ticket.kotNo] : (kotNos ?? []).filter(Boolean);
  const kotLabel = nos.length ? `KOT - ${nos.join(', ')}` : 'KOT';
  const service = SERVICE[order.type] ?? order.type.replace('_', ' ');

  const itemRows = order.items
    .map((item) => {
      const note = [
        ...item.modifiers.map((m) => m.nameSnapshot),
        ...(item.kitchenNote ? [item.kitchenNote] : []),
      ].join(', ');
      return `
        <tr>
          <td class="item">${esc(item.nameSnapshot)}</td>
          <td class="note">${note ? esc(note) : '--'}</td>
          <td class="qty">${item.quantity}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(kotLabel)} · ${esc(order.orderNumber)}</title>
<style>
  /* Thermal printers have no grey: the driver dithers anything lighter than
     black into sparse dots, which comes out faint and speckled. So every
     colour is pure black, hierarchy comes from size and weight, and strokes
     are heavy enough to survive the print head. */
  * { box-sizing: border-box; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { margin: 0; }
  body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: 0; padding: 3mm 4mm 6mm; color: #000; background: #fff; width: 80mm; font-weight: 600; -webkit-font-smoothing: none; text-rendering: geometricPrecision; }
  p { margin: 0; }
  .head { text-align: center; line-height: 1.35; }
  .when { font-size: 14px; }
  .kot { font-size: 16px; }
  .service { font-size: 16px; font-weight: 800; }
  .table { font-size: 18px; font-weight: 800; }
  .station, .guest { font-size: 13px; }
  .reprint { font-size: 15px; font-weight: 800; border: 2px solid #000; padding: 2px; margin: 4px 0; text-align: center; }
  .rule { border: none; border-top: 2px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 13px; font-weight: 700; text-align: left; padding-bottom: 3px; }
  td { padding: 3px 0; vertical-align: top; word-break: break-word; }
  .item { font-size: 16px; font-weight: 800; width: 55%; }
  .note { font-size: 13px; padding: 4px 4px 0; }
  .qty, th.qty { text-align: right; white-space: nowrap; width: 1%; }
  td.qty { font-size: 16px; font-weight: 800; }
  @page { size: 80mm auto; margin: 0; }
  @media print {
    html, body { width: 80mm; }
  }
</style>
</head>
<body>
  <script>
    window.addEventListener('message', function (e) { if (e.data === 'print') window.print(); });
  </script>
  <div class="head">
    <p class="when">${esc(kotDateTime(new Date(order.createdAt), timeZone))}</p>
    <p class="kot">${esc(kotLabel)}</p>
    <p class="service">${esc(service)}</p>
    ${order.table ? `<p class="table">Table No: ${esc(order.table.label)}</p>` : ''}
    ${ticket?.station ? `<p class="station">${esc(ticket.station)}</p>` : ''}
    ${order.customer ? `<p class="guest">Guest: ${esc(order.customer.name)}</p>` : ''}
  </div>
  ${ticket && ticket.reprint > 0 ? `<p class="reprint">*** REPRINT #${ticket.reprint} ***</p>` : ''}
  <hr class="rule">
  <table>
    <thead><tr><th>Item</th><th>Special Note</th><th class="qty">Qty.</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <hr class="rule">
  <p class="guest" style="text-align:center">#${esc(order.orderNumber)} · ${esc(branchName)}</p>
</body>
</html>`;
}
