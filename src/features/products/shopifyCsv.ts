export interface ShopifyImportProduct {
  handle: string;
  name: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  published: boolean;
  status: string;
  price: number;
  stock: number;
  weightGrams: number | null;
  requiresShipping: boolean;
  imageUrls: string[];
}

export interface ShopifyCsvParseResult {
  products: ShopifyImportProduct[];
  errors: string[];
}

function parseRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function truthy(value: string | undefined): boolean {
  return ['true', 'yes', '1'].includes((value ?? '').trim().toLowerCase());
}

function numberField(value: string | undefined, fallback: number, field: string, handle: string): number {
  const parsed = Number((value ?? '').trim());
  if (!Number.isFinite(parsed)) throw new Error(`Product "${handle}": invalid ${field}.`);
  return parsed;
}

/** Parse Shopify's native product CSV and group extra image rows by product handle. */
export function parseShopifyCsv(input: string): ShopifyCsvParseResult {
  const matrix = parseRows(input);
  if (matrix.length < 2) return { products: [], errors: ['The CSV has no product rows.'] };

  const headers = matrix[0].map((h) => h.trim());
  const required = ['Handle', 'Title', 'Variant Price', 'Variant Inventory Qty', 'Image Src'];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) return { products: [], errors: [`Missing Shopify columns: ${missing.join(', ')}`] };

  const products = new Map<string, ShopifyImportProduct>();
  const errors: string[] = [];

  matrix.slice(1).forEach((cells, rowIndex) => {
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    const handle = String(row.Handle ?? '').trim();
    if (!handle) return;

    const optionFields = ['Option1 Name', 'Option2 Name', 'Option3 Name'];
    const optionValues = ['Option1 Value', 'Option2 Value', 'Option3 Value'];
    const hasRealVariant = optionFields.some((key, i) => {
      const name = String(row[key] ?? '').trim();
      const value = String(row[optionValues[i]] ?? '').trim();
      return (name && name !== 'Title') || (value && value !== 'Default Title');
    });
    if (hasRealVariant) {
      errors.push(`Row ${rowIndex + 2} (${handle}) has product variants. This import file contains no variant support for those rows.`);
      return;
    }

    let product = products.get(handle);
    if (!product) {
      try {
        const price = numberField(row['Variant Price'], Number.NaN, 'price', handle);
        const stock = numberField(row['Variant Inventory Qty'], 0, 'stock', handle);
        const rawWeight = String(row['Variant Grams'] ?? '').trim();
        const weightGrams = rawWeight === '' ? null : numberField(rawWeight, 0, 'weight', handle);
        if (price < 0 || stock < 0 || !Number.isInteger(stock) || (weightGrams !== null && weightGrams < 0)) {
          throw new Error(`Product "${handle}": price, stock, or weight is outside the allowed range.`);
        }
        product = {
          handle,
          name: String(row.Title ?? '').trim() || handle,
          description: String(row['Body (HTML)'] ?? ''),
          vendor: String(row.Vendor ?? ''),
          productType: String(row.Type ?? ''),
          tags: String(row.Tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
          published: truthy(row.Published),
          status: String(row.Status ?? ''),
          price,
          stock,
          weightGrams,
          requiresShipping: truthy(row['Variant Requires Shipping']),
          imageUrls: [],
        };
        products.set(handle, product);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    const imageUrl = String(row['Image Src'] ?? '').trim();
    if (imageUrl && !product.imageUrls.includes(imageUrl)) product.imageUrls.push(imageUrl);
  });

  return { products: [...products.values()], errors };
}
