import type { Order } from '../orders/db';

const BASE = 'https://app.shipmondo.com/api/public/v3';

export interface ShipmondoProduct {
  code: string;
  name: string;
  carrierCode: string;
  carrierName: string;
  description: string;
  requiredServices: string[];
  requiredFields: string[];
  servicePointProduct: boolean;
  available: boolean;
  weightIntervals: Array<{ fromWeight: number; toWeight: number }>; 
  raw: Record<string, unknown>;
}

export interface ShipmondoParty {
  type: 'sender' | 'receiver';
  name: string;
  address1: string;
  address2?: string;
  postal_code: string;
  city: string;
  country_code: string;
  email?: string;
  phone?: string;
  mobile?: string;
}

export interface ShipmondoShipmentInput {
  productCode: string;
  serviceCodes?: string[];
  reference: string;
  sender: ShipmondoParty;
  receiver: ShipmondoParty;
  weightGrams: number;
  servicePointId?: string | null;
  servicePointProduct?: boolean;
}

export interface ShipmondoShipment {
  id: string;
  carrierCode: string;
  trackingNumber: string;
  priceCents: number;
  reference: string | null;
  service: string | null;
  raw: Record<string, unknown>;
}

export type ShipmondoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; uncertain?: boolean };

function auth(username: string, key: string): string {
  return `Basic ${btoa(`${username}:${key}`)}`;
}

function messageFrom(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'description']) {
      const candidate = obj[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }
  return fallback;
}

function productFrom(value: unknown, countryCode: string): ShipmondoProduct | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const carrier = raw.carrier && typeof raw.carrier === 'object'
    ? (raw.carrier as Record<string, unknown>)
    : {};
  const code = String(raw.code ?? raw.product_code ?? '').trim();
  if (!code) return null;

  const required = Array.isArray(raw.required_services)
    ? raw.required_services.map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return String(obj.code ?? obj.service_code ?? '');
        }
        return '';
      }).filter(Boolean)
    : [];

  const availableServices = Array.isArray(raw.available_services)
    ? raw.available_services
    : [];
  const requiredFromAvailable = availableServices.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const service = item as Record<string, unknown>;
    return service.required === true ? [String(service.code ?? service.service_code ?? '')] : [];
  }).filter(Boolean);

  const countryCombinations = Array.isArray(raw.country_combinations)
    ? raw.country_combinations.filter((item) => item && typeof item === 'object') as Record<string, unknown>[]
    : [];
  const allRequiredServices = [
    ...required,
    ...countryCombinations.flatMap((combination) =>
      Array.isArray(combination.required_services)
        ? combination.required_services.map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const service = item as Record<string, unknown>;
              return String(service.code ?? service.service_code ?? '');
            }
            return '';
          }).filter(Boolean)
        : [],
    ),
  ];
  const serviceRequiredFields = [
    ...(Array.isArray(raw.required_services) ? raw.required_services : []),
    ...countryCombinations.flatMap((combination) =>
      Array.isArray(combination.required_services) ? combination.required_services : [],
    ),
  ].flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const service = item as Record<string, unknown>;
    const fields = service.required_fields;
    if (Array.isArray(fields)) return fields.map(String);
    if (typeof fields === 'string' && fields) return [fields];
    return [];
  });
  const directRequiredFields = Array.isArray(raw.required_fields)
    ? raw.required_fields.map(String)
    : typeof raw.required_fields === 'string' && raw.required_fields
      ? [raw.required_fields]
      : [];
  const combinationRequiredFields = countryCombinations.flatMap((combination) =>
    Array.isArray(combination.required_fields) ? combination.required_fields.map(String) : [],
  );
  const requiredFieldValues = [...new Set([
    ...directRequiredFields,
    ...combinationRequiredFields,
    ...serviceRequiredFields,
  ].filter(Boolean))];

  const countryWeightIntervals = countryCombinations.flatMap((combination) =>
    Array.isArray(combination.weight_intervals) ? combination.weight_intervals : [],
  );
  const rawWeightIntervals = Array.isArray(raw.weight_intervals) ? raw.weight_intervals : countryWeightIntervals;
  const weightIntervals = rawWeightIntervals.length > 0
    ? rawWeightIntervals.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const interval = item as Record<string, unknown>;
        const fromWeight = Number(interval.from_weight ?? interval.min ?? interval.from);
        const toWeight = Number(interval.to_weight ?? interval.max ?? interval.to);
        return Number.isFinite(fromWeight) && Number.isFinite(toWeight)
          ? [{ fromWeight, toWeight }]
          : [];
      })
    : [];
  const matchingCountryCombinations = countryCombinations.filter((combination) => {
    const sender = String(combination.sender_country_code ?? '').toUpperCase();
    const receiver = String(combination.receiver_country_code ?? '').toUpperCase();
    return (!sender || sender === countryCode.toUpperCase()) &&
      (!receiver || receiver === countryCode.toUpperCase());
  });
  const destination = raw.destination_country && typeof raw.destination_country === 'object'
    ? raw.destination_country as Record<string, unknown>
    : null;
  const destinationCode = String(destination?.code ?? '').toUpperCase();
  const availableInCountry = destinationCode && destinationCode !== countryCode.toUpperCase()
    ? false
    : matchingCountryCombinations.length === 0
      ? countryCombinations.length === 0
      : matchingCountryCombinations.some((combination) => combination.shipmondo_agreement_available !== false);

  return {
    code,
    name: String(raw.name ?? raw.product_name ?? code),
    carrierCode: String(carrier.code ?? raw.carrier_code ?? '').toLowerCase(),
    carrierName: String(carrier.name ?? raw.carrier_name ?? carrier.code ?? ''),
    description: String(raw.description ?? ''),
    requiredServices: [...new Set([...allRequiredServices, ...requiredFromAvailable])],
    requiredFields: [...new Set(requiredFieldValues)],
    servicePointProduct: raw.service_point_product === true ||
      countryCombinations.some((combination) => combination.service_point_product === true) ||
      raw.service_point_required === true ||
      raw.service_point === true ||
      /parcel ?shop|pakkeshop|service ?point|pickup|shop ?delivery|shopdelivery|collect/i.test(
        `${raw.name ?? ''} ${raw.description ?? ''}`,
      ),
    available: raw.available !== false && availableInCountry,
    weightIntervals,
    raw,
  };
}

/** Fetch Shipmondo carrier products available for the store's destination country. */
export async function fetchShipmondoProducts(
  username: string,
  key: string,
  countryCode = 'DK',
): Promise<ShipmondoResult<ShipmondoProduct[]>> {
  let response: Response;
  try {
    const url = new URL(`${BASE}/products`);
    url.searchParams.set('sender_country_code', 'DK');
    url.searchParams.set('receiver_country_code', countryCode.toUpperCase());
    response = await fetch(url, {
      headers: {
        authorization: auth(username, key),
        accept: 'application/json',
      },
    });
  } catch {
    return { ok: false, error: 'Shipmondo could not be reached.' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: `Shipmondo returned an unreadable response (HTTP ${response.status}).` };
  }
  if (!response.ok) {
    return { ok: false, error: messageFrom(body, `Shipmondo returned HTTP ${response.status}.`) };
  }

  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? ((body as Record<string, unknown>).products ??
         (body as Record<string, unknown>).data ??
         (body as Record<string, unknown>).results)
      : null;
  if (!Array.isArray(list)) {
    return { ok: false, error: 'Shipmondo returned a product list in an unexpected format.' };
  }
  return {
    ok: true,
    value: list
      .map((product) => productFrom(product, countryCode))
      .filter((product): product is ShipmondoProduct => product !== null && product.available),
  };
}

/** Build a Shipmondo shipment payload. This only books after an explicit admin action. */
export function buildShipmondoShipmentPayload(input: ShipmondoShipmentInput): Record<string, unknown> {
  const pointId = input.servicePointId?.trim();
  return {
    own_agreement: false,
    label_format: 'a4_pdf',
    product_code: input.productCode,
    ...(input.serviceCodes?.length ? { service_codes: input.serviceCodes.join(',') } : {}),
    reference: input.reference,
    ...(pointId
      ? { service_point_id: pointId, automatic_select_service_point: false }
      : input.servicePointProduct
        ? { automatic_select_service_point: true }
        : {}),
    parties: [input.sender, input.receiver],
    parcels: [{ weight: input.weightGrams }],
  };
}

export async function createShipmondoShipment(
  username: string,
  key: string,
  input: ShipmondoShipmentInput,
): Promise<ShipmondoResult<ShipmondoShipment>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/shipments`, {
      method: 'POST',
      headers: {
        authorization: auth(username, key),
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildShipmondoShipmentPayload(input)),
    });
  } catch {
    return { ok: false, error: 'The connection to Shipmondo was lost during booking.', uncertain: true };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: `Shipmondo returned an unreadable response (HTTP ${response.status}).`,
      uncertain: response.ok || response.status >= 500,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: messageFrom(body, `Shipmondo returned HTTP ${response.status}.`),
      uncertain: response.status >= 500,
    };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Shipmondo did not return shipment details.', uncertain: true };
  }
  const raw = body as Record<string, unknown>;
  const id = String(raw.id ?? raw.shipment_id ?? '').trim();
  const trackingNumber = String(raw.pkg_no ?? raw.tracking_number ?? '').trim();
  if (!id || !trackingNumber) {
    return {
      ok: false,
      error: 'Shipmondo may have created the shipment but did not return its shipment ID and tracking number. Check Shipmondo before trying again.',
      uncertain: true,
    };
  }
  const price = Number(raw.price ?? 0);
  return {
    ok: true,
    value: {
      id,
      carrierCode: String(raw.carrier_code ?? '').toLowerCase(),
      trackingNumber,
      priceCents: Number.isFinite(price) ? Math.round(price * 100) : 0,
      reference: String(raw.reference ?? input.reference),
      service: String(raw.product_name ?? input.productCode),
      raw,
    },
  };
}

export async function getShipmondoShipment(
  username: string,
  key: string,
  shipmentId: string,
): Promise<ShipmondoResult<ShipmondoShipment>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/shipments/${encodeURIComponent(shipmentId)}`, {
      headers: { authorization: auth(username, key), accept: 'application/json' },
    });
  } catch {
    return { ok: false, error: 'Shipmondo could not be reached.' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: `Shipmondo returned an unreadable response (HTTP ${response.status}).` };
  }
  if (!response.ok) {
    return { ok: false, error: messageFrom(body, `Shipmondo returned HTTP ${response.status}.`) };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Shipmondo returned an unexpected shipment response.' };
  }

  const raw = body as Record<string, unknown>;
  const id = String(raw.id ?? raw.shipment_id ?? '');
  const trackingNumber = String(raw.pkg_no ?? raw.tracking_number ?? '');
  if (!id || !trackingNumber) return { ok: false, error: 'The shipment is not booked or has no tracking number.' };
  const price = Number(raw.price ?? 0);
  return {
    ok: true,
    value: {
      id,
      carrierCode: String(raw.carrier_code ?? '').toLowerCase(),
      trackingNumber,
      priceCents: Number.isFinite(price) ? Math.round(price * 100) : 0,
      reference: typeof raw.reference === 'string' ? raw.reference : null,
      service: typeof raw.product_name === 'string' ? raw.product_name : null,
      raw,
    },
  };
}

/** Fetch a booked label as PDF through Minshop, keeping the Shipmondo API key server-side. */
export async function getShipmondoLabelPdf(
  username: string,
  key: string,
  shipmentId: string,
): Promise<ShipmondoResult<Response>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/shipments/${encodeURIComponent(shipmentId)}/labels`, {
      headers: {
        authorization: auth(username, key),
        accept: 'application/pdf',
      },
    });
  } catch {
    return { ok: false, error: 'Shipmondo could not be reached.' };
  }
  if (!response.ok) {
    let body: unknown = null;
    try { body = await response.json(); } catch {}
    return { ok: false, error: messageFrom(body, `Shipmondo returned HTTP ${response.status} while fetching the label.`) };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('pdf')) {
    return { ok: false, error: 'Shipmondo did not return a PDF label.' };
  }
  return { ok: true, value: response };
}

export function shipmondoCarrierCode(code: string): string {
  const value = code.toLowerCase();
  if (value.includes('gls')) return 'gls';
  if (value.includes('dao')) return 'dao';
  if (value.includes('postnord') || value === 'pdk' || value.includes('post_nord')) return 'postnord';
  return 'other';
}

export function servicePointFromOrder(order: Pick<Order, 'ship_address'>): string | null {
  if (!order.ship_address) return null;
  try {
    const parsed = JSON.parse(order.ship_address) as Record<string, unknown>;
    const point = parsed.servicePoint ?? parsed.service_point ?? parsed.pickupPoint ?? parsed.pickup_point;
    if (typeof point === 'string') return point.trim() || null;
    if (point && typeof point === 'object') {
      const obj = point as Record<string, unknown>;
      const value = obj.id ?? obj.number;
      return value == null ? null : String(value);
    }
  } catch {}
  return null;
}

export function servicePointCarrierFromOrder(order: Pick<Order, 'ship_address'>): string | null {
  if (!order.ship_address) return null;
  try {
    const parsed = JSON.parse(order.ship_address) as Record<string, unknown>;
    const point = parsed.servicePoint ?? parsed.service_point ?? parsed.pickupPoint ?? parsed.pickup_point;
    if (!point || typeof point !== 'object') return null;
    const carrier = (point as Record<string, unknown>).carrier;
    return typeof carrier === 'string' ? shipmondoCarrierCode(carrier) : null;
  } catch {
    return null;
  }
}
