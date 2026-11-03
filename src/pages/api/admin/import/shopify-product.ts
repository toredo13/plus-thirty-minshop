import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getConfig, toMinorUnits } from '../../../../config';
import {
  createProduct,
  getProduct,
  getProductBySourceHandle,
  syncPrimaryImage,
} from '../../../../features/products/db';
import {
  createCategory,
  getCategoryBySlug,
  setProductCategories,
} from '../../../../features/categories/db';
import { uniqueCategorySlug } from '../../../../features/categories/slug';
import { uniqueSlug, slugify } from '../../../../features/products/slug';
import { indexProduct } from '../../../../features/search';
import { validateUpload, uploadMedia } from '../../../../features/media/upload';
import { optimizeUpload } from '../../../../features/products/imageOptimize';
import { attachMediaToProduct } from '../../../../features/media/db';
import { getStorage } from '../../../../features/storage';
import { CACHE_TAG } from '../../../../features/cache/tags';
import { purgeCacheTags } from '../../../../features/cache/purge';

export const prerender = false;

interface ShopifyImportBody {
  handle: string;
  name: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  published?: boolean;
  status?: string;
  price: number;
  stock: number;
  weightGrams?: number | null;
  requiresShipping?: boolean;
  imageUrls?: string[];
}

const SUBCATEGORY_NAMES: Record<string, string> = {
  syltet: 'Syltet',
  faerdigretter: 'Færdigretter',
  fisk: 'Fisk',
  konserves: 'Konserves',
  brod: 'Brød',
  saucer: 'Saucer',
  olivenolie: 'Olivenolie',
  oliven: 'Oliven',
  smor: 'Smør',
  yoghurt: 'Yoghurt',
  'hvid-ost': 'Hvid ost',
  'gul-ost': 'Gul ost',
  feta: 'Feta',
  frost: 'Frost',
  kebab: 'Kebab',
  souvlaki: 'Souvlaki',
  gyros: 'Gyros',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}

function cleanDescription(value: string | undefined): string | null {
  const text = (value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

async function ensureCategory(name: string, parentId: number | null): Promise<number> {
  const base = parentId === null ? name : `shopify-${parentId}-${name}`;
  const preferred = await getCategoryBySlug(env.DB, slugify(base));
  if (preferred && preferred.parent_id === parentId) return preferred.id;

  const slug = await uniqueCategorySlug(env.DB, base);
  const existing = await getCategoryBySlug(env.DB, slug);
  if (existing && existing.parent_id === parentId) return existing.id;
  return createCategory(env.DB, { name, slug, parent_id: parentId });
}

async function importImage(url: string, handle: string): Promise<number> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('One of the product image URLs is invalid.');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.shopify.com') {
    throw new Error('Only images hosted on cdn.shopify.com can be imported.');
  }

  const response = await fetch(parsed.toString(), { redirect: 'manual' });
  if (!response.ok) throw new Error(`Could not download image (${response.status}).`);
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error('Image is empty or larger than 5 MB.');
  }
  const filename = parsed.pathname.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') || `${handle}.jpg`;
  const file = new File([buffer], filename, { type: contentType });
  const invalid = validateUpload(file);
  if (invalid) throw new Error(invalid);

  const media = await uploadMedia(env.DB, getStorage(), await optimizeUpload(file), filename);
  return media.id;
}

export const POST: APIRoute = async ({ request }) => {
  let body: ShopifyImportBody;
  try {
    body = (await request.json()) as ShopifyImportBody;
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }

  const handle = String(body.handle ?? '').trim();
  const name = String(body.name ?? '').trim();
  const price = Number(body.price);
  const stock = Number(body.stock);
  const weight = body.weightGrams == null ? null : Number(body.weightGrams);
  const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.map((url) => String(url).trim()).filter(Boolean) : [];

  if (!handle || !name) return json({ error: 'Product handle and title are required.' }, 400);
  if (handle.length > 200 || name.length > 300) return json({ error: 'Product handle or title is too long.' }, 400);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return json({ error: 'Invalid price or stock value.' }, 400);
  }
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
    return json({ error: 'Invalid product weight.' }, 400);
  }
  if (imageUrls.length > 10) return json({ error: 'A product can have at most 10 images per import.' }, 400);

  const existing = await getProductBySourceHandle(env.DB, handle);
  if (existing) return json({ status: 'skipped', name, reason: 'already-imported' });

  const imageIds: number[] = [];
  try {
    for (const imageUrl of imageUrls) imageIds.push(await importImage(imageUrl, handle));

    const config = getConfig();
    const slug = await uniqueSlug(env.DB, handle);
    const published = body.published === true && (body.status ?? 'active').toLowerCase() === 'active';
    const productId = await createProduct(env.DB, {
      name,
      slug,
      description: cleanDescription(body.description),
      price_cents: toMinorUnits(price, config.currency),
      currency: config.currency,
      stock,
      active: published ? 1 : 0,
      weight_grams: weight,
      requires_shipping: body.requiresShipping === true ? 1 : 0,
      image_key: null,
      source_handle: handle,
      vendor: String(body.vendor ?? '').trim() || null,
      source_tags: tags.length ? JSON.stringify(tags) : null,
    });

    for (const mediaId of imageIds) {
      const attached = await attachMediaToProduct(env.DB, productId, mediaId);
      if (!attached.ok) throw new Error(attached.error);
    }
    await syncPrimaryImage(env.DB, productId);

    const categoryIds: number[] = [];
    const productType = String(body.productType ?? '').trim();
    let rootId: number | null = null;
    if (productType) {
      rootId = await ensureCategory(productType, null);
      categoryIds.push(rootId);
    }

    const subcategoryTag = tags.find((tag) => tag.startsWith('sub:'));
    if (subcategoryTag && rootId !== null) {
      const key = subcategoryTag.slice(4).toLowerCase();
      const label = SUBCATEGORY_NAMES[key] ?? key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      categoryIds.push(await ensureCategory(label, rootId));
    }
    if (categoryIds.length) await setProductCategories(env.DB, productId, categoryIds);

    const created = await getProduct(env.DB, productId);
    try {
      if (created) await indexProduct(created);
    } catch (err) {
      console.error('Shopify import search indexing failed:', err);
    }

    await purgeCacheTags([
      CACHE_TAG.catalog,
      ...(created?.public_id ? [CACHE_TAG.product(created.public_id)] : []),
    ]);

    return json({ status: 'imported', name, slug, imageCount: imageIds.length });
  } catch (error) {
    console.error('Shopify product import failed:', handle, error);
    return json({
      error: error instanceof Error ? error.message : 'Product import failed.',
      handle,
    }, 500);
  }
};
