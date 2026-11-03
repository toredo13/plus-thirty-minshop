/**
 * Plus Thirty's Danish retail prices already include VAT. When Stripe Tax is
 * enabled, Stripe must extract the tax component from the listed amount rather
 * than add VAT on top. Use this for merchandise and delivery line items alike.
 */
export function stripeTaxPriceOptions(automaticTax: boolean | undefined): {
  tax_behavior: 'inclusive';
} | {} {
  return automaticTax ? { tax_behavior: 'inclusive' } : {};
}
