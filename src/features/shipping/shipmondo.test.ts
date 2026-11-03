import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildShipmondoShipmentPayload,
  createShipmondoShipment,
  fetchShipmondoProducts,
  getShipmondoLabelPdf,
  getShipmondoShipment,
  shipmondoCarrierCode,
} from './shipmondo';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Shipmondo adapter', () => {
  it('normalizes products and required service codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{
      code: 'GLSDK_SD',
      name: 'GLS ShopDelivery',
      carrier: { code: 'gls', name: 'GLS' },
      required_services: [{ code: 'EMAIL_NT' }],
      service_point_product: true,
      weight_intervals: [{ min: 0, max: 20000 }],
    }])));

    const result = await fetchShipmondoProducts('api-user', 'api-key', 'DK');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({
      code: 'GLSDK_SD',
      carrierCode: 'gls',
      requiredServices: ['EMAIL_NT'],
      servicePointProduct: true,
    });
  });

  it('builds a shipment for the chosen parcel shop and sender/receiver', () => {
    const payload = buildShipmondoShipmentPayload({
      productCode: 'GLSDK_SD',
      serviceCodes: ['EMAIL_NT'],
      reference: 'Plus Thirty ord_123',
      sender: {
        type: 'sender', name: 'Plus Thirty', address1: 'Main Street 1',
        postal_code: '2500', city: 'Valby', country_code: 'DK',
        email: 'info@example.dk', phone: '12345678',
      },
      receiver: {
        type: 'receiver', name: 'Customer', address1: 'Road 2',
        postal_code: '1000', city: 'Copenhagen', country_code: 'DK',
        email: 'customer@example.dk',
      },
      weightGrams: 1250,
      servicePointId: '1234',
      servicePointProduct: true,
    });

    expect(payload.product_code).toBe('GLSDK_SD');
    expect(payload.service_codes).toBe('EMAIL_NT');
    expect(payload.service_point_id).toBe('1234');
    expect(payload.automatic_select_service_point).toBe(false);
    expect(payload.parcels).toEqual([{ weight: 1250 }]);
  });

  it('automatically selects a service point only when the admin has enabled it', () => {
    const payload = buildShipmondoShipmentPayload({
      productCode: 'GLSDK_SD',
      reference: 'Plus Thirty ord_123',
      sender: { type: 'sender', name: 'Plus Thirty', address1: 'A', postal_code: '2500', city: 'Valby', country_code: 'DK' },
      receiver: { type: 'receiver', name: 'Customer', address1: 'B', postal_code: '1000', city: 'Copenhagen', country_code: 'DK' },
      weightGrams: 900,
      servicePointProduct: true,
    });
    expect(payload.automatic_select_service_point).toBe(true);
  });

  it('parses created shipment details and preserves a fractional DKK price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      id: 1168,
      carrier_code: 'gls',
      pkg_no: '6064518784',
      price: '42.5',
      reference: 'Plus Thirty ord_123',
    })));

    const result = await createShipmondoShipment('api-user', 'api-key', {
      productCode: 'GLSDK_SD',
      reference: 'Plus Thirty ord_123',
      sender: { type: 'sender', name: 'Plus Thirty', address1: 'A', postal_code: '2500', city: 'Valby', country_code: 'DK' },
      receiver: { type: 'receiver', name: 'Customer', address1: 'B', postal_code: '1000', city: 'Copenhagen', country_code: 'DK' },
      weightGrams: 1000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: '1168',
      carrierCode: 'gls',
      trackingNumber: '6064518784',
      priceCents: 4250,
      reference: 'Plus Thirty ord_123',
    });
  });

  it('marks a network failure during shipment creation as uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network lost')));
    const result = await createShipmondoShipment('api-user', 'api-key', {
      productCode: 'GLSDK_SD',
      reference: 'Plus Thirty ord_123',
      sender: { type: 'sender', name: 'Plus Thirty', address1: 'A', postal_code: '2500', city: 'Valby', country_code: 'DK' },
      receiver: { type: 'receiver', name: 'Customer', address1: 'B', postal_code: '1000', city: 'Copenhagen', country_code: 'DK' },
      weightGrams: 1000,
    });
    expect(result).toMatchObject({ ok: false, uncertain: true });
  });

  it('reads a shipment for manual recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      id: 1168, carrier_code: 'gls', pkg_no: '6064518784',
      price: '42.50', reference: 'Plus Thirty ord_123',
    })));
    const result = await getShipmondoShipment('api-user', 'api-key', '1168');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reference).toBe('Plus Thirty ord_123');
  });

  it('returns the PDF response only for a PDF content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-test', {
      headers: { 'content-type': 'application/pdf' },
    })));
    const result = await getShipmondoLabelPdf('api-user', 'api-key', '1168');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.headers.get('content-type')).toContain('application/pdf');
  });

  it('maps Danish carrier codes without inventing a tracking URL', () => {
    expect(shipmondoCarrierCode('GLS')).toBe('gls');
    expect(shipmondoCarrierCode('dao')).toBe('dao');
    expect(shipmondoCarrierCode('pdk')).toBe('postnord');
    expect(shipmondoCarrierCode('something else')).toBe('other');
  });
});
