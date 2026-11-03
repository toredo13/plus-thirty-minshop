import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readCart, writeCart, CART_QTY_MAX } from '../../features/cart/cart';
import { cartKey, parseCartKey } from '../../features/cart/key';
import { getProductByPublicId, getProductBySlug } from '../../features/products/db';
import { listVariants, getExtrasByPublicIds } from '../../features/products/variants';
import { parsePublicId } from '../../features/ids/publicId.ts';
import { getStoreSettings } from '../../features/settings/db';
import { parseCartImportItems } from '../../features/cart/import';

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
    const parsed = parseCartImportItems(String(form.get('items') ?? ''));
    if (!parsed.ok) return new Response(parsed.error, { status: 400 });

    const importedCart: Record<string, number> = {};
    for (const { slug, quantity, variantId, extraIds } of parsed.items) {
      const product = await getProductBySlug(env.DB, slug);
      if (!product || product.active !== 1 || !product.public_id) {
        return new Response('Product unavailable: ' + slug, { status: 409 });
      }

      // Resolve every selected option against this product's active D1 records.
      // Client prices and labels are never trusted or copied into the cart.
      const variants = await listVariants(env.DB, product.id);
      const chosenVariant = variantId
        ? variants.find((variant) => variant.public_id === variantId)
        : null;
      if ((variants.length > 0 && !chosenVariant) || (variants.length === 0 && variantId)) {
        return new Response('Product requires a valid option selection: ' + product.name, { status: 409 });
      }

      const extras = extraIds.length
        ? await getExtrasByPublicIds(env.DB, product.id, extraIds)
        : [];
      if (extras.length !== extraIds.length) {
        return new Response('One or more selected extras are unavailable: ' + product.name, { status: 409 });
      }

      const key = cartKey(
        product.public_id,
        chosenVariant?.public_id ?? null,
        extras.flatMap((extra) => (extra.public_id ? [extra.public_id] : [])),
      );
      importedCart[key] = Math.min((importedCart[key] ?? 0) + quantity, CART_QTY_MAX);
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
