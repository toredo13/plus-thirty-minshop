import { CART_QTY_MAX } from './cart';

export interface ImportedCartItem {
  slug: string;
  quantity: number;
}

export type CartImportParseResult =
  | { ok: true; items: ImportedCartItem[] }
  | { ok: false; error: string };

const MAX_IMPORT_CHARS = 64 * 1024;
const MAX_IMPORT_ITEMS = 50;

/** Validate and normalize the browser-to-Minshop cart handoff. */
export function parseCartImportItems(raw: string): CartImportParseResult {
  if (!raw || raw.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: 'Invalid cart payload.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid cart payload.' };
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_IMPORT_ITEMS) {
    return { ok: false, error: 'Cart must contain between 1 and 50 products.' };
  }

  const quantities = new Map<string, number>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: 'Invalid cart item.' };
    }

    const row = item as Record<string, unknown>;
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    const quantity = row.quantity;

    // JSON cart quantities must be actual integers, not booleans or numeric strings.
    if (
      !slug ||
      slug.length > 200 ||
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > CART_QTY_MAX
    ) {
      return { ok: false, error: 'Invalid product or quantity in cart.' };
    }

    const next = (quantities.get(slug) ?? 0) + quantity;
    if (next > CART_QTY_MAX) {
      return { ok: false, error: 'The quantity for a product exceeds the cart limit.' };
    }
    quantities.set(slug, next);
  }

  return {
    ok: true,
    items: [...quantities].map(([slug, quantity]) => ({ slug, quantity })),
  };
}
