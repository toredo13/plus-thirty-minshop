import type { D1Database } from '@cloudflare/workers-types';
import { getSecret } from '../secrets/store';

export type PickupCarrier = 'gls' | 'postnord' | 'dao';

export interface PickupPoint {
  id: string;
  name: string;
  street: string;
  zip: string;
  city: string;
  distance: number;
  carrier: PickupCarrier;
}

export type PickupPointResult =
  | { ok: true; points: PickupPoint[] }
  | { ok: false; error: string };

function xmlValue(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = xml.match(new RegExp(`<${escaped}>([^<]*)</${escaped}>`, 'i'))?.[1] ?? '';
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

/** Search nearby Danish parcel shops. Shipmondo keys stay server-side in the D1 vault. */
export async function findPickupPoints(
  db: D1Database,
  carrier: PickupCarrier,
  zip: string,
  street: string,
): Promise<PickupPointResult> {
  if (!/^\d{4}$/.test(zip)) return { ok: false, error: 'Enter a valid 4-digit Danish postcode.' };
  const address = street.trim().slice(0, 120);

  try {
    if (carrier === 'gls') {
      const params = new URLSearchParams({
        street: address,
        zipcode: zip,
        countryIso3166A2: 'DK',
        Amount: '3',
      });
      const response = await fetch(
        `https://www.gls.dk/webservices_v4/wsShopFinder.asmx/SearchNearestParcelShops?${params}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return { ok: false, error: `GLS parcel-shop search failed (HTTP ${response.status}).` };
      const xml = await response.text();
      const blocks = xml.split('<PakkeshopData>').slice(1, 4);
      const points = blocks.map((block) => ({
        id: xmlValue(block, 'Number'),
        name: xmlValue(block, 'CompanyName'),
        street: xmlValue(block, 'Streetname'),
        zip: xmlValue(block, 'ZipCode'),
        city: xmlValue(block, 'CityName'),
        distance: Number(xmlValue(block, 'DistanceMetersAsTheCrowFlies')) || 0,
        carrier,
      })).filter((point) => point.id && point.name);
      return { ok: true, points };
    }

    const [username, key] = await Promise.all([
      getSecret(db, 'shipmondo_api_user'),
      getSecret(db, 'shipmondo_api_key'),
    ]);
    if (!username || !key) {
      return { ok: false, error: 'Shipmondo API credentials are not configured.' };
    }

    const params = new URLSearchParams({
      carrier_code: carrier,
      country_code: 'DK',
      zipcode: zip,
      address,
      quantity: '3',
    });
    const response = await fetch(
      `https://app.shipmondo.com/api/public/v3/pickup_points?${params}`,
      {
        headers: {
          authorization: `Basic ${btoa(`${username}:${key}`)}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 401 || response.status === 403
          ? 'Shipmondo did not authorize the pickup-point request. Check the API access.'
          : `Shipmondo parcel-shop search failed (HTTP ${response.status}).`,
      };
    }

    const body: unknown = await response.json();
    const list = Array.isArray(body)
      ? body
      : body && typeof body === 'object'
        ? ((body as Record<string, unknown>).pickup_points ??
           (body as Record<string, unknown>).points ??
           (body as Record<string, unknown>).data)
        : null;
    if (!Array.isArray(list)) {
      return { ok: false, error: 'Shipmondo returned an unexpected parcel-shop list.' };
    }

    const points = list.slice(0, 3).flatMap((item): PickupPoint[] => {
      if (!item || typeof item !== 'object') return [];
      const point = item as Record<string, unknown>;
      const id = String(point.number ?? point.id ?? '').trim();
      const name = String(point.company_name ?? point.name ?? '').trim();
      if (!id || !name) return [];
      return [{
        id,
        name,
        street: String(point.address ?? point.street ?? '').trim(),
        zip: String(point.zipcode ?? point.zip ?? '').trim(),
        city: String(point.city ?? '').trim(),
        distance: Number(point.distance) || 0,
        carrier,
      }];
    });
    return { ok: true, points };
  } catch {
    return { ok: false, error: 'Parcel-shop search is temporarily unavailable. Try again.' };
  }
}

export function isPickupCarrier(value: unknown): value is PickupCarrier {
  return value === 'gls' || value === 'postnord' || value === 'dao';
}
