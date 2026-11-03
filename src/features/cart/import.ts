import { CART_QTY_MAX } from './cart';
import { parsePublicId } from '../ids/publicId.ts';

export interface ImportedCartItem {
  slug: string;
  quantity: number;
  variantId: string | null;
  extraIds: string[];
}

export type CartImportParseResult =
  | { ok: true; items: ImportedCartItem[] }
  | { ok: false; error: string };

const MAX_IMPORT_CHARS = 64 * 1024;
const MAX_IMPORT_ITEMS = 50;
const MAX_EXTRAS_PER_ITEM = 20;

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

  const quantities = new Map<string, ImportedCartItem>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: 'Invalid cart item.' };
    }

    const row = item as Record<string, unknown>;
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    const quantity = row.quantity;
    const variantValue = row.variant_id;
    const variantId = variantValue == null ? null : parsePublicId(variantValue, 'variant');
    const extrasValue = row.extra_ids ?? [];
    if (
      variantValue !== undefined &&
      variantValue !== null &&
      variantId === null
    ) {
      return { ok: false, error: 'Invalid variant selection in cart.' };
    }
    if (!Array.isArray(extrasValue) || extrasValue.length > MAX_EXTRAS_PER_ITEM) {
      return { ok: false, error: 'Invalid extra selections in cart.' };
    }
    const extraIds = extrasValue.map((value) => parsePublicId(value, 'extra'));
    if (extraIds.some((id) => id === null)) {
      return { ok: false, error: 'Invalid extra selections in cart.' };
    }
    const canonicalExtraIds = [...new Set(extraIds as string[])].sort();

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

    // Duplicate product rows are combined only when the selected variant/extras match.
    const key = JSON.stringify([slug, variantId, canonicalExtraIds]);
    const existing = quantities.get(key);
    const next = (existing?.quantity ?? 0) + quantity;
    if (next > CART_QTY_MAX) {
      return { ok: false, error: 'The quantity for a product exceeds the cart limit.' };
    }
    quantities.set(key, {
      slug,
      quantity: next,
      variantId,
      extraIds: canonicalExtraIds,
    });
  }

  return { ok: true, items: [...quantities.values()] };
}
