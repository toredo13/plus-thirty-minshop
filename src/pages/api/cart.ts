import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readCart, writeCart, CART_QTY_MAX } from '../../features/cart/cart';
import { cartKey, parseCartKey } from '../../features/cart/key';
import { getProductByPublicId, getProductBySlug } from '../../features/products/db';
import { listVariants, getExtrasByPublicIds } from '../../features/products/variants';
import { parsePublicId } from '../../features/ids/publicId.ts';
import { getStoreSettings } from '../../features/settings/db';

export const prerender = false;

// POST /api/cart — add / update / remove a line, or accept a cart handoff from
// the Plus Thirty storefront. Prices and stock are always resolved from D1.
export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action'));
  const cart = readCart(cookies);
  const partial = request.headers.get('x-partial') === '1';
  if (!(await getStoreSettings(env.DB)).cartEnabled) {
    return partial ? new Response(null, { status: 204 }) : redirect('/', 303);
  }
  const done = () =>
    partial ? new Response(null, { status: 204 }) : redirect('/cart', 303);

  // This top-level form POST establishes Minshop's HttpOnly cart cookie on its
  // own domain before the shopper reaches checkout.
  if (action === 'import') {
    const raw = String(form.get('items') ?? '');
    if (!raw || raw.length > 64 * 1024) {
      return new Response('Invalid cart payload.', { status: 400 });
    }
    let items: unknown;
    try {
      items = JSON.parse(raw);
    } catch {
      return new Response('Invalid cart payload.', { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return new Response('Cart must contain between 1 and 50 products.', { status: 400 });
    }

    const normalized = new Map<string, number>();
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return new Response('Invalid cart item.', { status: 400 });
      }
      const row = item as Record<string, unknown>;
      const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
      const quantity = Number(row.quantity);
      if (!slug || slug.length > 200 || !Number.isInteger(quantity) || quantity < 1 || quantity > CART_QTY_MAX) {
        return new Response('Invalid product or quantity in cart.', { status: 400 });
      }
      const next = (normalized.get(slug) ?? 0) + quantity;
      if (next > CART_QTY_MAX) {
        return new Response('The quantity for a product exceeds the cart limit.', { status: 400 });
      }
      normalized.set(slug, next);
    }

    const importedCart: Record<string, number> = {};
    for (const [slug, quantity] of normalized) {
      const product = await getProductBySlug(env.DB, slug);
      if (!product || product.active !== 1 || !product.public_id) {
        return new Response('Product unavailable: ' + slug, { status: 409 });
      }
      // The current Shopify CSV import supports single-SKU products. Fail closed
      // rather than silently discarding a variant or add-on added later in Admin.
      const variants = await listVariants(env.DB, product.id);
      if (variants.length > 0) {
        return new Response('Product requires an option selection: ' + product.name, { status: 409 });
      }
      importedCart[cartKey(product.public_id, null, [])] = quantity;
    }

    writeCart(cookies, importedCart, url.protocol === 'https:');
    return redirect('/cart', 303);
  }

  if (action === 'update' || action === 'remove') {
    const key = String(form.get('key') ?? '');
    if (parseCartKey(key)) {
      if (action === 'remove') {
        delete cart[key];
      } else {
        const qty = Number(form.get('qty'));
        if (Number.isInteger(qty) && qty > 0) cart[key] = Math.min(qty, CART_QTY_MAX);
        else delete cart[key];
      }
    }
    writeCart(cookies, cart, url.protocol === 'https:');
    return done();
  }

  const productPublicId = parsePublicId(form.get('product_id'), 'product');
  const product = productPublicId ? await getProductByPublicId(env.DB, productPublicId) : null;
  if (!product || !product.active || !product.public_id) return done();

  const variants = await listVariants(env.DB, product.id);
  let variantPublicId: string | null = null;
  if (variants.length > 0) {
    const wanted = parsePublicId(form.get('variant_id'), 'variant');
    const chosen = wanted ? variants.find((v) => v.public_id === wanted) : undefined;
    if (!chosen) {
      if (partial) return new Response(null, { status: 204 });
      const label = product.variant_label || 'option';
      const params = new URLSearchParams({ error: 'Please choose a ' + label + '.' });
      return redirect('/products/' + product.slug + '?' + params.toString(), 303);
    }
    variantPublicId = chosen.public_id;
  }

  const wantExtras = form
    .getAll('extra')
    .map((v) => parsePublicId(v, 'extra'))
    .filter((v): v is string => v !== null);
  const extras = wantExtras.length
    ? await getExtrasByPublicIds(env.DB, product.id, wantExtras)
    : [];

  const key = cartKey(
    product.public_id,
    variantPublicId,
    extras.flatMap((e) => (e.public_id ? [e.public_id] : [])),
  );
  cart[key] = Math.min((cart[key] ?? 0) + 1, CART_QTY_MAX);

  writeCart(cookies, cart, url.protocol === 'https:');
  return done();
};
