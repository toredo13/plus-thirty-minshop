import type { DeepPartial, SiteConfig } from './config';

/**
 * Plus Thirty store settings.
 * Shipping remains off until the Shipmondo integration and Danish rates
 * are implemented and verified end-to-end.
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
    enabled: false,
    zones: [],
  },
};
