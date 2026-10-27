import type { AggregatorInboundOrder } from '@nodedr-restaurant/types';

export interface ResolvedLine {
  menuItemId: string;
  quantity: number;
  kitchenNote?: string;
}

/**
 * Maps marketplace items onto the branch menu: an explicit mapping by the
 * marketplace's item id first, else an exact (case-insensitive) name match
 * when exactly one menu item has that name. Anything else is unmapped, and
 * the order is held for staff to map rather than guessed at.
 */
export function resolveItems(
  items: AggregatorInboundOrder['items'],
  mappings: ReadonlyMap<string, string>,
  menu: readonly { id: string; name: string }[],
): {
  lines: ResolvedLine[];
  unmapped: { externalItemId: string; name: string }[];
} {
  const byName = new Map<string, string[]>();
  for (const m of menu) {
    const key = m.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), m.id]);
  }
  const lines: ResolvedLine[] = [];
  const unmapped: { externalItemId: string; name: string }[] = [];
  for (const item of items) {
    const byNameIds = byName.get(item.name.trim().toLowerCase());
    const menuItemId =
      mappings.get(item.externalItemId) ??
      (byNameIds?.length === 1 ? byNameIds[0] : undefined);
    if (!menuItemId) {
      unmapped.push({ externalItemId: item.externalItemId, name: item.name });
      continue;
    }
    lines.push({
      menuItemId,
      quantity: item.quantity,
      ...(item.notes ? { kitchenNote: item.notes } : {}),
    });
  }
  return { lines, unmapped };
}
