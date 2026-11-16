import type { Prisma } from '@prisma/client';

const OPEN_KOT = ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] as const;

/**
 * Marks every kitchen ticket (and its items) still open on these orders as
 * served. Many dine-in places never tap the stages on the Kitchen Display:
 * they ring it up, serve it and take the money. Once the bill is paid and
 * the table is cleared the food has clearly gone out, so the tickets should
 * not linger under "Accepted". Returns how many tickets were closed.
 */
export async function finishKitchenTickets(
  db: Prisma.TransactionClient,
  orderIds: string[],
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const now = new Date();
  const kots = await db.kot.findMany({
    where: { orderId: { in: orderIds }, status: { in: [...OPEN_KOT] } },
    select: { id: true, readyAt: true },
  });
  if (kots.length === 0) return 0;
  const ids = kots.map((k) => k.id);
  await db.kotItem.updateMany({
    where: { kotId: { in: ids }, status: { in: [...OPEN_KOT] } },
    data: { status: 'SERVED' },
  });
  await db.orderItem.updateMany({
    where: { orderId: { in: orderIds }, status: { in: [...OPEN_KOT] } },
    data: { status: 'SERVED' },
  });
  await db.kot.updateMany({
    where: { id: { in: ids }, readyAt: null },
    data: { readyAt: now },
  });
  await db.kot.updateMany({
    where: { id: { in: ids } },
    data: { status: 'SERVED', servedAt: now },
  });
  return kots.length;
}
