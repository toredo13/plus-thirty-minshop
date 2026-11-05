import { describe, expect, it } from 'vitest';
import { isForbiddenFormOrigin, isAllowedCartImportHandoff, isAllowedCrossSiteCartAction } from './formOrigin';

const URL = new globalThis.URL('https://shop.example/pay/otk_xK3mQ9vRt2LwZa8pYc4dNQ');

function request(
  method: string,
  origin?: string,
  contentType = 'application/x-www-form-urlencoded',
): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set('origin', origin);
  if (contentType) headers.set('content-type', contentType);
  return new Request(URL, { method, headers });
}

describe('isForbiddenFormOrigin', () => {
  it('allows safe methods and same-origin forms', () => {
    expect(isForbiddenFormOrigin(request('GET'), URL)).toBe(false);
    expect(isForbiddenFormOrigin(request('POST', URL.origin), URL)).toBe(false);
  });

  it('allows an originless or cross-origin form only for a capability pay token', () => {
    expect(isForbiddenFormOrigin(request('POST'), URL)).toBe(false);
    expect(isForbiddenFormOrigin(request('POST', 'https://other.example'), URL)).toBe(false);

    const bareId = new globalThis.URL('https://shop.example/pay/ord_h5tm8qp3vn');
    expect(isForbiddenFormOrigin(request('POST'), bareId)).toBe(true);

    const legacy = new globalThis.URL(
      'https://shop.example/pay/123e4567-e89b-12d3-a456-426614174000',
    );
    expect(isForbiddenFormOrigin(request('POST'), legacy)).toBe(true);
  });

  it('does not extend the exception to other methods or routes', () => {
    expect(isForbiddenFormOrigin(request('PUT'), URL)).toBe(true);
    const order = new globalThis.URL(
      'https://shop.example/order/otk_xK3mQ9vRt2LwZa8pYc4dNQ',
    );
    expect(isForbiddenFormOrigin(request('POST'), order)).toBe(true);
  });

  it('matches Astro for non-form bodies and missing content types', () => {
    expect(isForbiddenFormOrigin(request('POST', 'https://other.example', 'application/json'), URL))
      .toBe(false);
    expect(isForbiddenFormOrigin(request('POST', URL.origin, ''), URL)).toBe(false);
    expect(isForbiddenFormOrigin(request('POST', undefined, ''), URL)).toBe(true);
  });
});


describe('isAllowedCartImportHandoff', () => {
  const cartUrl = new globalThis.URL('https://minshop.plusthirtydk.workers.dev/api/cart');

  function cartRequest(origin: string, action: string): Request {
    return new Request(cartUrl, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ _action: action, items: '[]' }),
    });
  }

  it('allows the exact approved storefront origins to reach the cart import route', () => {
    for (const origin of [
      'https://plusthirty.dk',
      'https://www.plusthirty.dk',
      'https://greek-goods-nordic-market.lovable.app',
      'https://id-preview-67d1584e-a596-464c-835a-7ac48808323e.lovable.app',
    ]) {
      const request = cartRequest(origin, 'import');
      expect(isForbiddenFormOrigin(request, cartUrl)).toBe(true);
      expect(isAllowedCartImportHandoff(request, cartUrl)).toBe(true);
    }
  });

  it('checks the import action inside the cart route, not in middleware', () => {
    const allowed = cartRequest(
      'https://id-preview-67d1584e-a596-464c-835a-7ac48808323e.lovable.app',
      'import',
    );
    const denied = cartRequest(
      'https://id-preview-67d1584e-a596-464c-835a-7ac48808323e.lovable.app',
      'remove',
    );
    expect(isAllowedCrossSiteCartAction(allowed, cartUrl, 'import')).toBe(true);
    expect(isAllowedCrossSiteCartAction(denied, cartUrl, 'remove')).toBe(false);
  });

  it('rejects other origins, methods, paths, and missing origins', () => {
    expect(isAllowedCartImportHandoff(cartRequest('https://evil.example', 'import'), cartUrl)).toBe(false);
    const get = new Request(cartUrl, { method: 'GET', headers: { origin: 'https://plusthirty.dk' } });
    expect(isAllowedCartImportHandoff(get, cartUrl)).toBe(false);
    const otherPath = new globalThis.URL('https://minshop.plusthirtydk.workers.dev/api/checkout');
    expect(isAllowedCartImportHandoff(cartRequest('https://plusthirty.dk', 'import'), otherPath)).toBe(false);
    const noOrigin = new Request(cartUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _action: 'import', items: '[]' }),
    });
    expect(isAllowedCartImportHandoff(noOrigin, cartUrl)).toBe(false);
  });

  it('rejects requests without an origin or form content type', async () => {
    const noOrigin = new Request(cartUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _action: 'import', items: '[]' }),
    });
    expect(await isAllowedCartImportHandoff(noOrigin, cartUrl)).toBe(false);
  });
});
