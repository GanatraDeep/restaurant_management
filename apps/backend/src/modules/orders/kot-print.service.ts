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
            branch: { include: { restaurant: { select: { timezone: true } } } },
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
  async orderKotHtml(branchId: string, orderId: string, onlyNew: boolean) {
    const all = (await this.load(branchId, { orderId })).filter(
      (k) => k.status !== 'REJECTED' && k.items.length > 0,
    );
    const fresh = all.filter((k) => k.printedCount === 0);
    const kots = onlyNew && fresh.length > 0 ? fresh : all;
    // Only counter items (cold drinks, water): a page that tells the
    // browser not to print, rather than an error slip on the printer.
    if (kots.length === 0) return NO_KOT_PAGE;
    await this.prisma.kot.updateMany({
      where: { id: { in: kots.map((k) => k.id) } },
      data: { printedCount: { increment: 1 }, printedAt: new Date() },
    });
    for (const k of kots) {
      this.realtime.emitToBranch(branchId, 'kot.reprinted', { id: k.id });
    }
    return kotPage(kots);
  }

  /**
   * Auto-print: accepted tickets nobody has printed yet, since the device
   * switched auto-print on (so turning it on doesn't print the backlog).
   */
  pendingAutoPrint(branchId: string, since: Date) {
    return this.prisma.kot.findMany({
      where: {
        order: { branchId },
        status: { in: ['ACCEPTED', 'PREPARING', 'READY'] },
        printedCount: 0,
        OR: [{ acceptedAt: { gte: since } }, { createdAt: { gte: since } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
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
  extra: { ticket?: Parameters<typeof buildKotHtml>[0]['ticket'] } = {},
): string {
  const { order } = kots[0];
  return buildKotHtml({
    branchName: order.branch.name,
    timeZone: order.branch.restaurant.timezone,
    kotNos: kots.map((k) => k.kotNo ?? 0),
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

/** Served when nothing on the order goes to the kitchen: never printed. */
export const NO_KOT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="fc-noprint" content="1"><title>No KOT</title></head><body data-noprint="1"><p>Nothing on this order goes to the kitchen.</p></body></html>`;
