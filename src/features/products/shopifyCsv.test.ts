import { describe, expect, it } from 'vitest';
import { parseShopifyCsv } from './shopifyCsv';

describe('parseShopifyCsv', () => {
  it('parses a Shopify product row and preserves the exported price and stock', () => {
    const csv = [
      'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant Price,Variant Inventory Qty,Variant Grams,Variant Requires Shipping,Status,Image Src',
      'feta,Feta,"<p>Greek, PDO</p>",Plus Thirty,Mejeriprodukter,sub:feta,true,Title,Default Title,0.01,0,0.0,true,active,https://cdn.shopify.com/image.jpg',
    ].join('\n');

    const result = parseShopifyCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      handle: 'feta',
      name: 'Feta',
      description: '<p>Greek, PDO</p>',
      vendor: 'Plus Thirty',
      productType: 'Mejeriprodukter',
      tags: ['sub:feta'],
      published: true,
      price: 0.01,
      stock: 0,
      weightGrams: 0,
      requiresShipping: true,
      imageUrls: ['https://cdn.shopify.com/image.jpg'],
    });
  });

  it('groups additional image rows under one product', () => {
    const csv = [
      'Handle,Title,Variant Price,Variant Inventory Qty,Image Src',
      'feta,Feta,0.01,0,https://cdn.shopify.com/one.jpg',
      'feta,,0.01,0,https://cdn.shopify.com/two.jpg',
    ].join('\n');
    const result = parseShopifyCsv(csv);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].imageUrls).toHaveLength(2);
  });

  it('rejects real product variants rather than silently losing them', () => {
    const csv = [
      'Handle,Title,Variant Price,Variant Inventory Qty,Image Src,Option1 Name,Option1 Value',
      'feta,Feta,0.01,0,https://cdn.shopify.com/one.jpg,Size,1 kg',
    ].join('\n');
    const result = parseShopifyCsv(csv);
    expect(result.products).toHaveLength(0);
    expect(result.errors[0]).toContain('has product variants');
  });
});
