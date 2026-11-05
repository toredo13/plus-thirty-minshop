import {
  normalizeRate,
  type ShippingConfig,
} from './calculator';
import {
  shipmondoCarrierCode,
  type ShipmondoProduct,
} from './shipmondo';
import type { PickupCarrier } from './pickupPoints';

export type CheckoutDeliveryChoice = 'pickup' | 'home';

/** A home-delivery product must be an address-delivery service, not a return/drop-off product. */
export function isShipmondoHomeDeliveryProduct(product: ShipmondoProduct): boolean {
  if (product.servicePointProduct) return false;
  const description = `${product.code} ${product.name} ${product.description}`.toLowerCase();
  if (/return|retur|drop[ -]?off|indlever|business|erhverv/.test(description)) return false;
  return /home|hjem|privat|private|door|delivery|omdeling|mypack/.test(description) ||
    /(?:_HD|_HOME|_MH)$/i.test(product.code);
}

/** The first available Shipmondo product matching the buyer's carrier + delivery choice. */
export function shipmondoProductForCheckout(
  products: ShipmondoProduct[],
  carrier: PickupCarrier,
  choice: CheckoutDeliveryChoice,
): ShipmondoProduct | null {
  return products.find((product) =>
    shipmondoCarrierCode(product.carrierCode || product.carrierName) === carrier &&
    (choice === 'pickup' ? product.servicePointProduct : isShipmondoHomeDeliveryProduct(product)),
  ) ?? null;
}

/** Show only the configured Minshop prices that match the selected delivery choice. */
export function shippingConfigForChoice(
  config: ShippingConfig,
  choice: CheckoutDeliveryChoice,
): ShippingConfig {
  return {
    ...config,
    zones: config.zones.flatMap((zone) => {
      const rates = zone.rates.filter((rate) => {
        const type = normalizeRate(rate).pricing.type;
        return choice === 'pickup'
          ? type === 'service_point'
          : type === 'flat' || type === 'weight';
      });
      return rates.length > 0 ? [{ ...zone, rates }] : [];
    }),
  };
}

/** Only show the three Danish carriers that have a matching delivery product. */
export function checkoutCarriers(
  products: ShipmondoProduct[],
  choice: CheckoutDeliveryChoice,
): PickupCarrier[] {
  return (['gls', 'postnord', 'dao'] as const).filter((carrier) =>
    shipmondoProductForCheckout(products, carrier, choice) !== null,
  );
}
