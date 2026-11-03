import type { DeepPartial, SiteConfig } from './config';

/**
 * Plus Thirty store settings.
 * Shipping stays fail-closed until the Shipmondo integration is implemented
 * and tested; no checkout should offer an unconfigured carrier rate.
 */
export const storeOverrides: DeepPartial<SiteConfig> = {
  storeName: 'Plus Thirty',
  currency: 'dkk',
  timeZone: 'Europe/Copenhagen',
  features: {
    blog: false,
    reviews: false,
    accounts: false,
  },
  shipping: {
    enabled: true,
    zones: [
      {
        name: 'Denmark',
        countries: ['DK'],
        rates: [],
        freeOverCents: null,
      },
    ],
  },
};
