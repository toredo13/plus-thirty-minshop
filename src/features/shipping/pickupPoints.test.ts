import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPickupPoints } from './pickupPoints';

vi.mock('../secrets/store', () => ({
  getSecret: vi.fn(async (_db: unknown, name: string) =>
    name === 'shipmondo_api_user' ? 'api-user' : 'api-key',
  ),
}));

afterEach(() => vi.unstubAllGlobals());

describe('Shipmondo pickup-point lookup', () => {
  it('rejects a non-Danish postcode without calling Shipmondo', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    const result = await findPickupPoints({} as never, 'gls', 'DK2500', 'Example Street 1');

    expect(result).toEqual({
      ok: false,
      error: 'Enter a valid 4-digit Danish postcode.',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('requests three parcel shops for the chosen carrier and normalizes Shipmondo results', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        number: '95892',
        id: '95892',
        company_name: '7-Eleven Odense C',
        address: 'Vestergade 89',
        zipcode: '5000',
        city: 'Odense C',
        distance: 182,
        carrier_code: 'gls',
      },
      {
        number: '95893',
        company_name: 'Parcel shop two',
        address: 'Main Street 2',
        zipcode: '5000',
        city: 'Odense C',
        distance: 420,
      },
    ]), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', request);

    const result = await findPickupPoints({} as never, 'gls', '5000', 'Vestergade 1');

    expect(result).toMatchObject({
      ok: true,
      points: [
        {
          id: '95892',
          name: '7-Eleven Odense C',
          street: 'Vestergade 89',
          zip: '5000',
          city: 'Odense C',
          distance: 182,
          carrier: 'gls',
        },
        {
          id: '95893',
          name: 'Parcel shop two',
          carrier: 'gls',
        },
      ],
    });
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/public/v3/pickup_points');
    expect(url.searchParams.get('carrier_code')).toBe('gls');
    expect(url.searchParams.get('country_code')).toBe('DK');
    expect(url.searchParams.get('zipcode')).toBe('5000');
    expect(url.searchParams.get('address')).toBe('Vestergade 1');
    expect(url.searchParams.get('quantity')).toBe('3');
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: `Basic ${btoa('api-user:api-key')}`,
      accept: 'application/json',
    });
  });

  it('returns a clear error when the Shipmondo API access is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

    const result = await findPickupPoints({} as never, 'postnord', '2500', 'Example Street 2');

    expect(result).toEqual({
      ok: false,
      error: 'Shipmondo did not authorize the pickup-point request. Check the API access.',
    });
  });
});
