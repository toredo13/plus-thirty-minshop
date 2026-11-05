import { describe, expect, it } from 'vitest';
import type { ShipmondoProduct } from './shipmondo';
import {
  checkoutCarriers,
  isShipmondoHomeDeliveryProduct,
  shipmondoProductForCheckout,
  shippingConfigForChoice,
} from './checkout';

const product = (
  code: string,
  carrierCode: string,
  name: string,
  servicePointProduct: boolean,
): ShipmondoProduct => ({
  code,
  name,
  carrierCode,
  carrierName: carrierCode,
  description: '',
  requiredServices: [],
  requiredFields: [],
  servicePointProduct,
  available: true,
  weightIntervals: [],
  raw: {},
});

describe('Shipmondo checkout selection', () => {
  const products = [
    product('GLSDK_SD', 'gls', 'GLS ShopDelivery', true),
    product('GLSDK_HD', 'gls', 'Omdeling til privat', false),
    product('PDK_MC', 'pdk', 'MyPack Collect', true),
    product('PDK_MH', 'pdk', 'MyPack Home', false),
    product('DAO_HOME', 'dao', 'DAO Home Delivery', false),
    product('DAO_RET', 'dao', 'DAO Return Drop Off', false),
  ];

  it('maps pickup and home choices to the correct Shipmondo product', () => {
    expect(shipmondoProductForCheckout(products, 'gls', 'pickup')?.code).toBe('GLSDK_SD');
    expect(shipmondoProductForCheckout(products, 'gls', 'home')?.code).toBe('GLSDK_HD');
    expect(shipmondoProductForCheckout(products, 'postnord', 'pickup')?.code).toBe('PDK_MC');
    expect(shipmondoProductForCheckout(products, 'postnord', 'home')?.code).toBe('PDK_MH');
    expect(shipmondoProductForCheckout(products, 'dao', 'home')?.code).toBe('DAO_HOME');
    expect(shipmondoProductForCheckout(products, 'dao', 'pickup')).toBeNull();
  });

  it('does not mistake return/drop-off services for home delivery', () => {
    expect(isShipmondoHomeDeliveryProduct(products[5]!)).toBe(false);
  });

  it('shows only carriers that offer the requested delivery choice', () => {
    expect(checkoutCarriers(products, 'pickup')).toEqual(['gls', 'postnord']);
    expect(checkoutCarriers(products, 'home')).toEqual(['gls', 'postnord', 'dao']);
  });

  it('keeps only rates matching the selected delivery method', () => {
    const config = {
      enabled: true,
      zones: [{
        countries: ['DK'],
        rates: [
          { label: 'Home', pricing: { type: 'flat' as const, amountCents: 3900 } },
          { label: 'Pickup', pricing: { type: 'service_point' as const, amountCents: 2900 } },
          { label: 'Store collection', pricing: { type: 'pickup' as const, amountCents: 0 } },
        ],
        freeOverCents: null,
      }],
    };
    expect(shippingConfigForChoice(config, 'pickup').zones[0]?.rates.map((rate) => rate.label))
      .toEqual(['Pickup']);
    expect(shippingConfigForChoice(config, 'home').zones[0]?.rates.map((rate) => rate.label))
      .toEqual(['Home']);
  });
});
