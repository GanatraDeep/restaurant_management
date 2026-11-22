import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { buildKotEscPosJob, resolveProfile } from './escpos-receipt';
import { buildKotHtml } from './kot.html';
import { tokenOf } from './token';
import { PrinterNotFoundError } from './escpos-usb';
import { sendToBranchPrinter } from './printer-transport';

export interface KotPrintResult {
  ok: true;
  printed: { id: string; ticketNumber: string; reprint: number }[];
  unsupportedChars: string[];
}

// Prints kitchen tickets (KOTs) on the branch's thermal printer.
//
// Duplicate guard: a first print "claims" the ticket with a conditional
// UPDATE (printedCount 0 -> 1) before any bytes are sent, so two taps, two
// tablets or a client retry can never both print the same ticket. If the
// printer then fails, the claim is released so a retry prints it. A copy of a
// ticket that was already printed only happens with reprint=true, and is
// stamped "*** REPRINT #n ***" on paper.
@Injectable()
export class KotPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private load(branchId: string, where: { id?: string; orderId?: string }) {
    return this.prisma.kot.findMany({
      where: {
        ...where,
        order: { branchId },
        status: { not: 'CANCELLED' },
      },
      include: {
        station: true,
        order: {
          include: {
            table: true,
            customer: true,
            branch: {
              include: {
                restaurant: { select: { timezone: true, name: true } },
              },
            },
          },
        },
        items: {
          where: { status: { not: 'CANCELLED' } },
          include: { orderItem: { include: { modifiers: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async printTicket(branchId: string, kotId: string, reprint: boolean) {
    const kots = await this.load(branchId, { id: kotId });
    if (kots.length === 0) throw new NotFoundException('KOT not found');
    return this.run(branchId, kots, reprint);
  }

  /**
   * One kitchen ticket as a self-printing page for the browser. Counts as a
   * print: the first copy is plain, every later one is stamped REPRINT #n,
   * and the Kitchen Display hears about it like any other print.
   */
  async ticketHtml(
    branchId: string,
    kotId: string,
    opts: { claimed?: boolean } = {},
  ): Promise<string> {
    const [kot] = await this.load(branchId, { id: kotId });
    if (!kot) throw new NotFoundException('KOT not found');
    // An auto-print claim (claimFirstPrint) already counted this copy.
    const alreadyCounted = opts.claimed && kot.printedCount === 1;
    const firstCopy = alreadyCounted || kot.printedCount === 0;
    // Token slip: with the first copy of the order's first ticket only.
    const slip =
      firstCopy &&
      kot.order.branch.tokenEnabled &&
      (await this.prisma.kot.count({
        where: { orderId: kot.orderId, createdAt: { lt: kot.createdAt } },
      })) === 0;
    if (!alreadyCounted) {
      const updated = await this.prisma.kot.update({
        where: { id: kot.id },
        data: {
          printedCount: { increment: 1 },
          printedAt: new Date(),
          lastPrintError: null,
        },
      });
      this.realtime.emitToBranch(branchId, 'kot.reprinted', {
        id: updated.id,
        printedCount: updated.printedCount,
      });
    }
    return kotPage([kot], {
      slip,
      ticket: {
        number: kot.ticketNumber,
        station: kot.station?.name ?? null,
        reprint: alreadyCounted ? 0 : kot.printedCount,
        kotNo: kot.kotNo,
      },
    });
  }

  /**
   * The order's KOT as one page, from the POS / Tables. With `onlyNew`, just
   * the tickets nobody has printed yet (the round just sent, for "Save & Print
   * KOT"); otherwise every live ticket. Either way they count as printed, so
   * auto-print doesn't print them again.
   */
  async orderKotHtml(
    branchId: string,
    orderId: string,
    onlyNew: boolean,
    station?: string,
  ) {
    const all = (await this.load(branchId, { orderId })).filter(
      (k) => k.status !== 'REJECTED' && k.items.length > 0,
    );
    const picked = pickKots(all, onlyNew);
    // station=<id> (or "none"): just that station's slip, for its own printer.
    const kots = station
      ? picked.filter((k) => (k.stationId ?? 'none') === station)
      : picked;
    // Only counter items (cold drinks, water): a page that tells the
    // browser not to print, rather than an error slip on the printer.
    if (kots.length === 0) return NO_KOT_PAGE;
    // Nothing on the order printed yet: this is its first KOT, so the guest's
    // token slip comes out with it.
    const slip = all.every((k) => k.printedCount === 0);
    await this.prisma.kot.updateMany({
      where: { id: { in: kots.map((k) => k.id) } },
      data: { printedCount: { increment: 1 }, printedAt: new Date() },
    });
    for (const k of kots) {
      this.realtime.emitToBranch(branchId, 'kot.reprinted', { id: k.id });
    }
    // One station on its own printer: still name the station on top.
    return stationPages(kots, slip, !!station);
  }

  /**
   * Which station slips "Print KOT" would print right now (same choice as
   * orderKotHtml) and each station's printer, so the desktop app can send
   * every station to its own printer. Marks nothing as printed.
   */
  async orderKotPlan(branchId: string, orderId: string, onlyNew: boolean) {
    const all = (await this.load(branchId, { orderId })).filter(
      (k) => k.status !== 'REJECTED' && k.items.length > 0,
    );
    const seen = new Map<
      string,
      { station: string; name: string; printerName: string | null }
    >();
    for (const k of pickKots(all, onlyNew)) {
      const key = k.stationId ?? 'none';
      if (!seen.has(key)) {
        seen.set(key, {
          station: key,
          name: k.station?.name ?? 'Kitchen',
          printerName: k.station?.printerName ?? null,
        });
      }
    }
    return { stations: [...seen.values()] };
  }

  /**
   * Counter slip: items served from the counter (menu item ticket = "Counter
   * slip" — water bottles, soft drinks) never get a KOT, so they print on their
   * own slip, which the POS sends to the counter (bill) printer. Items set to
   * "No ticket" print nowhere.
   * `onlyNew` prints just the items not on a counter slip yet, claimed
   * atomically so two devices can't both print them; otherwise every live
   * counter item (a reprint). Orders still waiting for Accept print nothing.
   */
  async counterSlipHtml(branchId: string, orderId: string, onlyNew: boolean) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, branchId },
      include: {
        table: true,
        customer: true,
        branch: {
          include: { restaurant: { select: { timezone: true, name: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status === 'CANCELLED' ||
      ['PENDING', 'REJECTED'].includes(order.acceptance)
    ) {
      return NO_COUNTER_PAGE;
    }
    const where = {
      orderId,
      status: { not: 'CANCELLED' as const },
      menuItem: { sendToKitchen: false, counterSlip: true },
    };
    let ids = (
      await this.prisma.orderItem.findMany({
        where: { ...where, ...(onlyNew ? { counterPrintedAt: null } : {}) },
        select: { id: true },
      })
    ).map((i) => i.id);
    if (ids.length === 0) return NO_COUNTER_PAGE;
    const stamp = new Date();
    if (onlyNew) {
      await this.prisma.orderItem.updateMany({
        where: { id: { in: ids }, counterPrintedAt: null },
        data: { counterPrintedAt: stamp },
      });
      // Only what this request claimed (another device may have won some).
      ids = (
        await this.prisma.orderItem.findMany({
          where: { id: { in: ids }, counterPrintedAt: stamp },
          select: { id: true },
        })
      ).map((i) => i.id);
      if (ids.length === 0) return NO_COUNTER_PAGE;
    } else {
      await this.prisma.orderItem.updateMany({
        where: { id: { in: ids }, counterPrintedAt: null },
        data: { counterPrintedAt: stamp },
      });
    }
    const items = await this.prisma.orderItem.findMany({
      where: { id: { in: ids } },
      include: { modifiers: true },
      orderBy: { createdAt: 'asc' },
    });
    const token = order.branch.tokenEnabled ? tokenOf(order.orderNumber) : null;
    return buildKotHtml({
      branchName: order.branch.name,
      timeZone: order.branch.restaurant.timezone,
      heading: 'COUNTER',
      token,
      order: {
        orderNumber: order.orderNumber,
        type: order.type,
        createdAt: items[items.length - 1]?.createdAt ?? order.createdAt,
        table: order.table ? { label: tableLabel(order.table) } : null,
        customer: order.customer
          ? { name: order.customer.name ?? 'Guest' }
          : order.guestName
            ? { name: order.guestName }
            : null,
        items: items.map((i) => ({
          nameSnapshot: i.nameSnapshot,
          quantity: i.quantity,
          kitchenNote: i.kitchenNote,
          modifiers: i.modifiers.map((m) => ({ nameSnapshot: m.nameSnapshot })),
        })),
      },
    });
  }

  /**
   * Auto-print: orders with counter items not on a counter slip yet, added
   * since the device switched auto-print on.
   */
  async pendingCounterAutoPrint(branchId: string, since: Date) {
    const rows = await this.prisma.orderItem.findMany({
      where: {
        counterPrintedAt: null,
        status: { not: 'CANCELLED' },
        createdAt: { gte: since },
        menuItem: { sendToKitchen: false, counterSlip: true },
        order: {
          branchId,
          status: { not: 'CANCELLED' },
          acceptance: { in: ['NOT_REQUIRED', 'ACCEPTED'] },
        },
      },
      select: { orderId: true },
      distinct: ['orderId'],
      take: 20,
    });
    return rows.map((r) => ({ orderId: r.orderId }));
  }

  /**
   * Auto-print: accepted tickets nobody has printed yet, since the device
   * switched auto-print on (so turning it on doesn't print the backlog).
   */
  pendingAutoPrint(branchId: string, since: Date) {
    return this.prisma.kot
      .findMany({
        where: {
          order: { branchId },
          status: { in: ['ACCEPTED', 'PREPARING', 'READY'] },
          printedCount: 0,
          OR: [{ acceptedAt: { gte: since } }, { createdAt: { gte: since } }],
        },
        select: { id: true, station: { select: { printerName: true } } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      })
      .then((rows) =>
        // printerName: the station's own printer (desktop app), if it has one.
        rows.map((r) => ({
          id: r.id,
          printerName: r.station?.printerName ?? null,
        })),
      );
  }

  /**
   * Takes the first print of a ticket for one device. Two screens with
   * auto-print on can't both get it: only the one that flips 0 -> 1 prints.
   */
  async claimFirstPrint(branchId: string, kotId: string) {
    const claimed = await this.prisma.kot.updateMany({
      where: { id: kotId, printedCount: 0, order: { branchId } },
      data: { printedCount: 1, printedAt: new Date(), lastPrintError: null },
    });
    if (claimed.count > 0) {
      this.realtime.emitToBranch(branchId, 'kot.reprinted', {
        id: kotId,
        printedCount: 1,
      });
    }
    return { claimed: claimed.count > 0 };
  }

  async printOrder(branchId: string, orderId: string, reprint: boolean) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, branchId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const kots = await this.load(branchId, { orderId });
    if (kots.length === 0) {
      throw new ConflictException({
        code: 'NO_TICKETS',
        message: 'This order has no kitchen tickets to print',
      });
    }
    return this.run(branchId, kots, reprint);
  }

  private async run(
    branchId: string,
    kots: Awaited<ReturnType<KotPrintService['load']>>,
    reprint: boolean,
  ): Promise<KotPrintResult> {
    const todo = reprint ? kots : kots.filter((k) => k.printedCount === 0);
    if (todo.length === 0) {
      throw new ConflictException({
        code: 'ALREADY_PRINTED',
        message:
          'This ticket was already printed. Choose Reprint if you really need another copy.',
      });
    }

    const result: KotPrintResult = {
      ok: true,
      printed: [],
      unsupportedChars: [],
    };
    for (const kot of todo) {
      if (!reprint) {
        const claimed = await this.prisma.kot.updateMany({
          where: { id: kot.id, printedCount: 0 },
          data: { printedCount: 1, printedAt: new Date() },
        });
        if (claimed.count === 0) continue; // someone else just printed it
      }

      const branch = kot.order.branch;
      const copy = reprint ? kot.printedCount : 0; // REPRINT #n on paper
      const job = buildKotEscPosJob({
        branchName: branch.name,
        profile: resolveProfile({
          paperWidthMm: branch.printerPaperWidthMm,
          codepage: branch.printerCodepage,
          columns: branch.printerColumns,
        }),
        ticket: {
          number: kot.ticketNumber,
          station: kot.station?.name ?? null,
          reprint: copy,
        },
        order: {
          orderNumber: kot.order.orderNumber,
          type: kot.order.type,
          createdAt: kot.order.createdAt,
          table: kot.order.table
            ? {
                label: kot.order.table.name ?? `#${kot.order.table.number}`,
              }
            : null,
          customer: kot.order.customer
            ? { name: kot.order.customer.name ?? 'Guest' }
            : kot.order.guestName
              ? { name: kot.order.guestName }
              : null,
          notes: kot.order.notes,
          items: kot.items.map(({ orderItem }) => ({
            nameSnapshot: orderItem.nameSnapshot,
            quantity: orderItem.quantity,
            kitchenNote: orderItem.kitchenNote,
            modifiers: orderItem.modifiers.map((m) => ({
              nameSnapshot: m.nameSnapshot,
            })),
          })),
        },
      });

      try {
        await sendToBranchPrinter(branch, job.buffer);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Printing failed';
        await this.prisma.kot.update({
          where: { id: kot.id },
          data: {
            lastPrintError: message.slice(0, 300),
            // Release the first-print claim so a retry can print it.
            ...(reprint ? {} : { printedCount: 0, printedAt: null }),
          },
        });
        if (err instanceof PrinterNotFoundError) {
          throw new ServiceUnavailableException(err.message);
        }
        throw new ServiceUnavailableException(
          `Kitchen printer error: ${message}`,
        );
      }

      const updated = await this.prisma.kot.update({
        where: { id: kot.id },
        data: {
          lastPrintError: null,
          ...(reprint
            ? { printedCount: { increment: 1 }, printedAt: new Date() }
            : {}),
        },
      });
      result.printed.push({
        id: kot.id,
        ticketNumber: kot.ticketNumber,
        reprint: copy,
      });
      result.unsupportedChars.push(...job.unsupportedChars);
      this.realtime.emitToBranch(branchId, 'kot.reprinted', {
        id: updated.id,
        printedCount: updated.printedCount,
      });
    }
    if (result.printed.length === 0) {
      // Every ticket was claimed by a concurrent request.
      throw new ConflictException({
        code: 'ALREADY_PRINTED',
        message: 'These tickets were just printed by another request.',
      });
    }
    result.unsupportedChars = [...new Set(result.unsupportedChars)];
    return result;
  }
}

type LoadedKot = Awaited<ReturnType<KotPrintService['load']>>[number];

/** "T8" for a numbered table, its own name otherwise — as on the floor. */
export function tableLabel(t: { name: string | null; number: string }): string {
  return t.name ?? (/^\d/.test(t.number) ? `T${t.number}` : t.number);
}

/** One KOT page for one or more tickets of the same order. */
function kotPage(
  kots: LoadedKot[],
  {
    slip = false,
    ...extra
  }: {
    ticket?: Parameters<typeof buildKotHtml>[0]['ticket'];
    slip?: boolean;
  } = {},
): string {
  const { order } = kots[0];
  const token = order.branch.tokenEnabled ? tokenOf(order.orderNumber) : null;
  return buildKotHtml({
    branchName: order.branch.name,
    timeZone: order.branch.restaurant.timezone,
    kotNos: kots.map((k) => k.kotNo ?? 0),
    token,
    tokenSlip:
      token && slip ? { restaurantName: order.branch.restaurant.name } : null,
    ...extra,
    order: {
      orderNumber: order.orderNumber,
      type: order.type,
      // When the round was sent, not when the table first ordered.
      createdAt: kots[kots.length - 1].createdAt,
      table: order.table ? { label: tableLabel(order.table) } : null,
      customer: order.customer
        ? { name: order.customer.name ?? 'Guest' }
        : order.guestName
          ? { name: order.guestName }
          : null,
      items: kots.flatMap((k) =>
        k.items.map(({ orderItem }) => ({
          nameSnapshot: orderItem.nameSnapshot,
          quantity: orderItem.quantity,
          kitchenNote: orderItem.kitchenNote,
          modifiers: orderItem.modifiers.map((m) => ({
            nameSnapshot: m.nameSnapshot,
          })),
        })),
      ),
    },
  });
}

/** Unprinted tickets for "only the new round" (falls back to all), else all. */
function pickKots<T extends { printedCount: number }>(
  all: T[],
  onlyNew: boolean,
): T[] {
  const fresh = all.filter((k) => k.printedCount === 0);
  return onlyNew && fresh.length > 0 ? fresh : all;
}

/**
 * One KOT slip per kitchen station (Tandoor, Chinese, Bar…), each on its own
 * page of the same print job, with the station's name on top — so the
 * kitchen tears them apart and hands each to its station. Items without a
 * station share one slip. A single station prints exactly as before.
 */
export function stationPages(
  kots: LoadedKot[],
  slip: boolean,
  nameStation = false,
): string {
  const groups = new Map<string, LoadedKot[]>();
  for (const k of kots) {
    const key = k.stationId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), k]);
  }
  if (groups.size <= 1 && !(nameStation && kots[0]?.station))
    return kotPage(kots, { slip });
  const pages = [...groups.values()].map((g, i) =>
    kotPage(g, {
      // The guest's token slip only once, after the first station's KOT.
      slip: slip && i === 0,
      ticket: {
        number: '',
        station: g[0].station?.name ?? 'Kitchen',
        reprint: 0,
        kotNo: null,
      },
    }),
  );
  return joinPages(pages);
}

/** Several self-contained KOT documents → one document, a page each. */
export function joinPages(docs: string[]): string {
  const bodyOf = (d: string) =>
    d.slice(d.indexOf('<body>') + 6, d.lastIndexOf('</body>'));
  const head = docs[0].slice(0, docs[0].indexOf('<body>') + 6);
  const breaker =
    '<div style="break-before:page;page-break-before:always"></div>';
  // Keep the page's print script once — a copy per page would print twice.
  const bodies = docs.map((d, i) =>
    i === 0 ? bodyOf(d) : bodyOf(d).replace(/<script>[\s\S]*?<\/script>/g, ''),
  );
  return `${head}${bodies.join(breaker)}</body>\n</html>`;
}

/** Served when nothing on the order goes to the kitchen: never printed. */
export const NO_KOT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="fc-noprint" content="1"><title>No KOT</title></head><body data-noprint="1"><p>Nothing on this order goes to the kitchen.</p></body></html>`;

/** Counter slip with nothing on it: the browser / desktop app skip printing. */
export const NO_COUNTER_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="fc-noprint" content="1"><title>No counter items</title></head><body data-noprint="1"><p>Nothing on this order is served from the counter.</p></body></html>`;
