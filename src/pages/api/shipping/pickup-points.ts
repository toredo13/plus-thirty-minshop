import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { findPickupPoints, isPickupCarrier } from '../../../features/shipping/pickupPoints';

export const prerender = false;

/** GET /api/shipping/pickup-points?carrier=gls|postnord|dao&zip=2500&street=... */
export const GET: APIRoute = async ({ url }) => {
  const carrier = url.searchParams.get('carrier');
  const zip = String(url.searchParams.get('zip') ?? '').trim();
  const street = String(url.searchParams.get('street') ?? '').trim();

  if (!isPickupCarrier(carrier) || !/^\\d{4}$/.test(zip) || street.length > 120) {
    return Response.json(
      { ok: false, points: [], error: 'Choose a carrier and enter a valid Danish postcode.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const result = await findPickupPoints(env.DB, carrier, zip, street);
  return Response.json(
    result.ok
      ? { ok: true, points: result.points }
      : { ok: false, points: [], error: result.error },
    {
      status: result.ok ? 200 : 502,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};
