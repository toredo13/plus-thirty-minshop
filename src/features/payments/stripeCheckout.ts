import type Stripe from 'stripe';
import { stripeAllowedCountries } from './stripeCountries.ts';
import { stripeTaxPriceOptions } from './stripeTax.ts';
import { STRIPE_CHECKOUT_TTL_SECONDS, type CreateCheckoutParams } from './provider';

/** Build the exact Stripe payload separately so checkout can be tested without charging a card. */
export function buildStripeCheckoutSessionParams(
  params: CreateCheckoutParams,
  nowSeconds = Math.floor(Date.now() / 1000),
): Stripe.Checkout.SessionCreateParams {
  const selected = params.selectedShipping;
  const selectedAddress = selected?.address;
  const servicePoint = selectedAddress?.servicePoint ?? null;
  const selectedShippingMetadata = selected && selectedAddress
    ? {
        shipping_cents: String(selected.amountCents),
        shipping_label: selected.label.slice(0, 500),
        shipping_delivery_method: selected.deliveryMethod,
        ship_to_name: (selectedAddress.name ?? '').slice(0, 500),
        ship_to_line1: (selectedAddress.line1 ?? '').slice(0, 500),
        ship_to_line2: (selectedAddress.line2 ?? '').slice(0, 500),
        ship_to_city: (selectedAddress.city ?? '').slice(0, 500),
        ship_to_state: (selectedAddress.state ?? '').slice(0, 500),
        ship_to_postal: (selectedAddress.postal ?? '').slice(0, 500),
        ship_to_country: (selectedAddress.country ?? '').slice(0, 2),
        ship_to_phone: (selectedAddress.phone ?? '').slice(0, 100),
        ...(servicePoint && {
          service_point_id: servicePoint.id.slice(0, 100),
          service_point_name: servicePoint.name.slice(0, 200),
          service_point_street: servicePoint.street.slice(0, 200),
          service_point_zip: servicePoint.zip.slice(0, 20),
          service_point_city: servicePoint.city.slice(0, 100),
          service_point_carrier: servicePoint.carrier,
        }),
        ...(selected.weightGrams != null && {
          shipping_weight_grams: String(selected.weightGrams),
        }),
      }
    : {};
  const shippingLineItem = selected
    ? [{
        price_data: {
          currency: params.lineItems[0]?.currency ?? 'dkk',
          unit_amount: selected.amountCents,
          ...stripeTaxPriceOptions(params.automaticTax),
          product_data: { name: `Shipping — ${selected.label}` },
        },
        quantity: 1,
      }]
    : [];

  return {
    mode: 'payment',
    expires_at: nowSeconds + STRIPE_CHECKOUT_TTL_SECONDS,
    line_items: [
      ...params.lineItems.map((li) => ({
        price_data: {
          currency: li.currency,
          unit_amount: li.amountCents,
          // Danish consumer prices include VAT; Stripe extracts VAT when enabled.
          ...stripeTaxPriceOptions(params.automaticTax),
          product_data: {
            name: li.name,
            ...(li.imageUrl && { images: [li.imageUrl] }),
          },
        },
        quantity: li.quantity,
      })),
      ...shippingLineItem,
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(selected?.email && { customer_email: selected.email }),
    ...((params.metadata || params.shipping?.shipmentWeightGrams != null || selected) && {
      metadata: {
        ...(params.metadata ?? {}),
        ...(params.shipping?.shipmentWeightGrams != null && {
          shipping_weight_grams: String(params.shipping.shipmentWeightGrams),
        }),
        ...selectedShippingMetadata,
      },
    }),
    ...(selected && params.automaticTax && {
      billing_address_collection: 'required' as const,
    }),
    ...(params.allowPromotionCodes && { allow_promotion_codes: true }),
    ...(params.automaticTax && { automatic_tax: { enabled: true } }),
    ...(params.shipping && {
      shipping_address_collection: {
        allowed_countries: stripeAllowedCountries(
          params.shipping.addressCountries,
          params.shipping.hasCatchAll === true,
        ) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
      },
      shipping_options: params.shipping.options.map((option) => ({
        shipping_rate_data: {
          type: 'fixed_amount' as const,
          display_name: option.label,
          fixed_amount: {
            amount: option.amountCents,
            currency: params.lineItems[0]?.currency ?? 'dkk',
          },
          metadata: { delivery: option.pickup ? 'pickup' : 'shipping' },
          ...stripeTaxPriceOptions(params.automaticTax),
        },
      })),
    }),
  };
}
