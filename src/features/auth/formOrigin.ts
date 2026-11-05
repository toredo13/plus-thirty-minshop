import { isAccessToken } from '../ids/token';

const FORM_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hasFormContentType(contentType: string | null): boolean {
  const value = contentType?.toLowerCase() ?? '';
  return FORM_CONTENT_TYPES.some((type) => value.includes(type));
}

function isCapabilityPayPath(pathname: string): boolean {
  if (!pathname.startsWith('/pay/')) return false;
  const token = pathname.slice('/pay/'.length);
  return !token.includes('/') && isAccessToken(token);
}

/**
 * Astro's origin guard, with one narrow compatibility exception.
 *
 * A new-style /pay/otk_… URL is itself a 128-bit bearer capability and does
 * not use cookie-authenticated authority. Its form may therefore work in
 * privacy-focused clients that omit or rewrite Origin. Every other form-like
 * mutation retains Astro's same-origin rule.
 */
export function isForbiddenFormOrigin(request: Request, url: URL): boolean {
  if (SAFE_METHODS.has(request.method)) return false;

  const originMatches = request.headers.get('origin') === url.origin;
  if (!request.headers.has('content-type')) return !originMatches;
  if (!hasFormContentType(request.headers.get('content-type'))) return false;
  if (originMatches) return false;

  return !(request.method === 'POST' && isCapabilityPayPath(url.pathname));
}


const CART_HANDOFF_ORIGINS = new Set([
  'https://plusthirty.dk',
  'https://www.plusthirty.dk',
  'https://greek-goods-nordic-market.lovable.app',
  'https://id-preview-67d1584e-a596-464c-835a-7ac48808323e.lovable.app',
]);

/**
 * The retail storefront transfers only slugs and quantities to Minshop.
 * Allow that one cross-origin form action from the known Plus Thirty origins;
 * all product, price, stock and order data is still resolved server-side.
 */
export async function isAllowedCartImportHandoff(request: Request, url: URL): Promise<boolean> {
  if (request.method !== 'POST' || url.pathname !== '/api/cart') return false;

  const origin = request.headers.get('origin');
  if (!origin || !CART_HANDOFF_ORIGINS.has(origin)) return false;
  if (!hasFormContentType(request.headers.get('content-type'))) return false;

  try {
    const form = await request.clone().formData();
    return form.get('_action') === 'import';
  } catch {
    return false;
  }
}
