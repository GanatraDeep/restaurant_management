/** The menu item's variants as stored (JSON), dropping anything malformed. */
export function itemVariants(json: unknown): { name: string; price: number }[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((v: unknown) => {
    const o = v as { name?: unknown; price?: unknown };
    const price = Number(o?.price);
    return typeof o?.name === 'string' && o.name && Number.isFinite(price)
      ? [{ name: o.name, price }]
      : [];
  });
}
