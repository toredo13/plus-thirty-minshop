import type { DeepPartial, SiteConfig } from './config';

/**
 * Plus Thirty store overrides.
 *
 * Keep shipping disabled during integration: real Danish carrier rates and
 * Shipmondo pickup-point selection will be added before live card checkout.
 */
export const storeOverrides: DeepPartial<SiteConfig> = {
  storeName: 'Plus Thirty',
  currency: 'dkk',
  timeZone: 'Europe/Copenhagen',
  shipping: {
    enabled: false,
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
