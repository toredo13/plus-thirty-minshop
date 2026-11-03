import { describe, expect, it } from 'vitest';
import { stripeTaxPriceOptions } from './stripeTax';

describe('stripeTaxPriceOptions', () => {
  it('extracts VAT from the displayed price when Stripe Tax is enabled', () => {
    expect(stripeTaxPriceOptions(true)).toEqual({ tax_behavior: 'inclusive' });
  });

  it('does not set tax behavior when automatic tax is disabled', () => {
    expect(stripeTaxPriceOptions(false)).toEqual({});
    expect(stripeTaxPriceOptions(undefined)).toEqual({});
  });
});
