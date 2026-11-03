import { describe, expect, it } from 'vitest';
import type { CreateCheckoutParams } from './provider';
import { STRIPE_CHECKOUT_TTL_SECONDS } from './provider';
import { buildStripeCheckoutSessionParams } from './stripeCheckout';

describe('buildStripeCheckoutSessionParams', () => {
  it('keeps DKK checkout amounts inclusive of VAT and preserves a selected Danish pickup point', () => {
    const params: CreateCheckoutParams = {
      lineItems: [
        {
          name: 'Premium feta',
          amountCents: 1295,
          currency: 'dkk',
          quantity: 2,
          imageUrl: 'https://images.example/feta.jpg',
        },
      ],
      successUrl: 'https://store.example/success',
      cancelUrl: 'https://store.example/cancel',
      automaticTax: true,
      selectedShipping: {
        label: 'GLS ParcelShop',
        amountCents: 350,
        weightGrams: 1800,
        deliveryMethod: 'pickup',
        email: 'buyer@example.com',
        address: {
          name: 'Buyer',
          line1: 'Test Street 1',
          line2: null,
          city: 'Copenhagen',
          state: null,
          postal: '2500',
          country: 'DK',
          phone: '+4512345678',
          servicePoint: {
            id: 'gls-123',
            name: 'GLS Valby',
            street: 'Valby Langgade 1',
            zip: '2500',
            city: 'Copenhagen',
            carrier: 'gls',
          },
        },
      },
    };

    const payload = buildStripeCheckoutSessionParams(params, 1_800_000_000);
    const lineItems = payload.line_items ?? [];

    expect(payload.mode).toBe('payment');
    expect(payload.expires_at).toBe(1_800_000_000 + STRIPE_CHECKOUT_TTL_SECONDS);
    expect(payload.automatic_tax).toEqual({ enabled: true });
    expect(payload.billing_address_collection).toBe('required');
    expect(payload.customer_email).toBe('buyer@example.com');
    expect(lineItems).toHaveLength(2);
    expect(lineItems[0]).toMatchObject({
      quantity: 2,
      price_data: {
        currency: 'dkk',
        unit_amount: 1295,
        tax_behavior: 'inclusive',
        product_data: { name: 'Premium feta', images: ['https://images.example/feta.jpg'] },
      },
    });
    expect(lineItems[1]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: 'dkk',
        unit_amount: 350,
        tax_behavior: 'inclusive',
        product_data: { name: 'Shipping — GLS ParcelShop' },
      },
    });
    expect(payload.metadata).toMatchObject({
      shipping_cents: '350',
      shipping_delivery_method: 'pickup',
      service_point_id: 'gls-123',
      service_point_carrier: 'gls',
      shipping_weight_grams: '1800',
      ship_to_country: 'DK',
    });
  });

  it('marks configured carrier rates as pickup or home shipping in Stripe metadata', () => {
    const params: CreateCheckoutParams = {
      lineItems: [{ name: 'Olives', amountCents: 500, currency: 'dkk', quantity: 1 }],
      successUrl: 'https://store.example/success',
      cancelUrl: 'https://store.example/cancel',
      shipping: {
        addressCountries: ['DK'],
        options: [
          { label: 'DAO parcel shop', amountCents: 290, pickup: true },
          { label: 'PostNord home delivery', amountCents: 490 },
        ],
      },
    };

    const payload = buildStripeCheckoutSessionParams(params, 1_800_000_000);
    const options = payload.shipping_options ?? [];

    expect(options).toHaveLength(2);
    expect(options[0]?.shipping_rate_data).toMatchObject({
      display_name: 'DAO parcel shop',
      fixed_amount: { amount: 290, currency: 'dkk' },
      metadata: { delivery: 'pickup' },
    });
    expect(options[1]?.shipping_rate_data).toMatchObject({
      display_name: 'PostNord home delivery',
      fixed_amount: { amount: 490, currency: 'dkk' },
      metadata: { delivery: 'shipping' },
    });
    expect(options[0]?.shipping_rate_data?.tax_behavior).toBeUndefined();
  });
});
