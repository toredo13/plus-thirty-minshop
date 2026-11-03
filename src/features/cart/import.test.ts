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
        { slug: 'feta', quantity: 5 },
        { slug: 'gyros', quantity: 1 },
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

  it('rejects duplicate quantities above the cart limit', () => {
    expect(
      parseCartImportItems(JSON.stringify([
        { slug: 'feta', quantity: 60 },
        { slug: 'feta', quantity: 40 },
      ])),
    ).toMatchObject({ ok: false });
  });
});
