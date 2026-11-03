import type { Product } from '../products/db';
import type { ProductVariant, ProductExtra } from '../products/variants';
import { productImageUrl } from '../products/image';
import { toMajorUnits } from '../../money';

export interface CatalogVariant {
  id: string;
  label: string;
  price: { amount: number; cents: number; currency: string };
  in_stock: boolean;
  sku: string | null;
}

export interface CatalogExtra {
  id: string;
  label: string;
  price_delta: { amount: number; cents: number; currency: string };
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: { amount: number; cents: number; currency: string };
  in_stock: boolean;
  variant_label: string | null;
  categories: string[];
  /** Original Shopify tags retained for the existing storefront subcategory filters. */
  tags: string[];
  image: string;
  url: string;
  variants?: CatalogVariant[];
  extras?: CatalogExtra[];
}

const money = (cents: number, currency: string) => ({
  amount: toMajorUnits(cents, currency),
  cents,
  currency: currency.toUpperCase(),
});

function sourceTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

export function toCatalogProduct(
  p: Product,
  categoryNames: string[],
  origin: string,
  options?: { variants?: ProductVariant[]; extras?: ProductExtra[]; imageBaseUrl?: string },
): CatalogProduct {
  const variants = options?.variants;
  const extras = options?.extras;
  const hasVariants = !!variants && variants.length > 0;

  const out: CatalogProduct = {
    id: requirePublicId(p.public_id, p.id, 'product'),
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: money(p.price_cents, p.currency),
    in_stock: hasVariants ? variants!.some((v) => v.stock > 0) : p.stock > 0,
    variant_label: p.variant_label,
    categories: categoryNames,
    tags: sourceTags(p.source_tags),
    image: new URL(productImageUrl(p.image_key, options?.imageBaseUrl ?? ''), origin).href,
    url: new URL('/products/' + p.slug, origin).href,
  };

  if (variants) {
    out.variants = variants.map((v) => ({
      id: requirePublicId(v.public_id, v.id, 'variant'),
      label: v.label,
      price: money(v.price_cents, p.currency),
      in_stock: v.stock > 0,
      sku: v.sku,
    }));
  }
  if (extras) {
    out.extras = extras.map((e) => ({
      id: requirePublicId(e.public_id, e.id, 'extra'),
      label: e.label,
      price_delta: money(e.price_delta_cents, p.currency),
    }));
  }
  return out;
}

export function requirePublicId(publicId: string | null, rowId: number, kind: string): string {
  if (!publicId) throw new Error(kind + ' row ' + rowId + ' has no public_id — run the backfill');
  return publicId;
}
