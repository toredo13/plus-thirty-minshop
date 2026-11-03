import { describe, expect, it } from 'vitest';
import { parseCartImportItems } from './import';

describe('parseCartImportItems', () => {
  it('validates products and combines duplicate slugs', () => {
    expect(
      parseCartImportItems(JSON.stringify([
        { slug: ' feta ', quantity: 2 },
        { slug: 'gyros', quantity: 1 },
        { slug: 'feta', quantity: 3 },
      ])),
    ).toEqual({
      ok: true,
      items: [
        { slug: 'feta', quantity: 5, variantId: null, extraIds: [] },
        { slug: 'gyros', quantity: 1, variantId: null, extraIds: [] },
      ],
    });
  });

  it('rejects malformed, empty, or oversized payloads', () => {
    expect(parseCartImportItems('{bad').ok).toBe(false);
    expect(parseCartImportItems('[]')).toMatchObject({ ok: false });
    expect(parseCartImportItems('x'.repeat(64 * 1024 + 1))).toMatchObject({ ok: false });

    const tooMany = Array.from({ length: 51 }, (_, index) => ({
      slug: String(index),
      quantity: 1,
    }));
    expect(parseCartImportItems(JSON.stringify(tooMany))).toMatchObject({ ok: false });
  });

  it('rejects malformed slugs and non-integer or non-number quantities', () => {
    const invalidItems = [
      { slug: '', quantity: 1 },
      { slug: 'feta', quantity: '2' },
      { slug: 'feta', quantity: true },
      { slug: 'feta', quantity: 1.5 },
      { slug: 'feta', quantity: 0 },
      { slug: 'feta', quantity: 100 },
    ];

    for (const item of invalidItems) {
      expect(parseCartImportItems(JSON.stringify([item])).ok).toBe(false);
    }
  });

  it('preserves variant selections and combines only matching variant/extra lines', () => {
    const result = parseCartImportItems(JSON.stringify([
      { slug: 'feta', quantity: 2, variant_id: 'var_abcdefghjk' },
      { slug: 'feta', quantity: 1, variant_id: 'var_abcdefghjk' },
      { slug: 'feta', quantity: 4, variant_id: 'var_0123456789' },
      { slug: 'feta', quantity: 1, variant_id: 'var_abcdefghjk', extra_ids: ['xtra_abcdefghjk'] },
    ]));

    expect(result).toEqual({
      ok: true,
      items: [
        { slug: 'feta', quantity: 3, variantId: 'var_abcdefghjk', extraIds: [] },
        { slug: 'feta', quantity: 4, variantId: 'var_0123456789', extraIds: [] },
        { slug: 'feta', quantity: 1, variantId: 'var_abcdefghjk', extraIds: ['xtra_abcdefghjk'] },
      ],
    });
  });

  it('normalizes and deduplicates extra IDs', () => {
    expect(parseCartImportItems(JSON.stringify([
      { slug: 'feta', quantity: 1, extra_ids: ['xtra_abcdefghjk', 'xtra_abcdefghjk'] },
    ]))).toMatchObject({
      ok: true,
      items: [{ extraIds: ['xtra_abcdefghjk'] }],
    });
  });

  it('rejects invalid variant and extra public IDs', () => {
    expect(parseCartImportItems(JSON.stringify([
      { slug: 'feta', quantity: 1, variant_id: 'prod_abcdefghjk' },
    ]))).toMatchObject({ ok: false });
    expect(parseCartImportItems(JSON.stringify([
      { slug: 'feta', quantity: 1, extra_ids: ['var_abcdefghjk'] },
    ]))).toMatchObject({ ok: false });
    expect(parseCartImportItems(JSON.stringify([
      { slug: 'feta', quantity: 1, extra_ids: Array(21).fill('xtra_abcdefghjk') },
    ]))).toMatchObject({ ok: false });
  });

  it('rejects duplicate quantities above the cart limit', () => {
    expect(
      parseCartImportItems(JSON.stringify([
        { slug: 'feta', quantity: 60 },
        { slug: 'feta', quantity: 40 },
      ])),
    ).toMatchObject({ ok: false });
  });
});
