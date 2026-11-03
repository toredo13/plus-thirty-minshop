# Plus Thirty deployment

This branch is the production Minshop backend for Plus Thirty.

## Architecture
- Store currency: DKK.
- Store time zone: Europe/Copenhagen.
- The existing Plus Thirty storefront keeps its design and DA / EN / EL language switch.
- Product catalogue, retail prices, stock, and product images are served by Minshop.
- Retail checkout is handed off to Minshop, which owns the cart, address, shipping selection, payment session, order, and label workflow.
- Approved wholesale accounts, customer-specific pricing, and wholesale order submission remain on the existing authenticated Supabase flow.
- The Shopify CSV importer is available in Admin; the catalogue is not considered migrated until the owner uploads the exported CSV and the imported products are reviewed.

## Lovable catalogue API

The catalogue is public read-only JSON with cross-origin GET / OPTIONS enabled:

- `GET /api/products?limit=100&offset=0` returns `products`, `total`, `limit`,
  `offset`, and `query`. The default page size is 24 and the maximum is 100;
  keep requesting pages until `offset` reaches `total`.
- `GET /api/products/{slug}` returns one active product with its variants and extras.
- Each product exposes its Minshop public `id`, `slug`, name, description, DKK
  price (amount and cents), stock availability, categories, original Shopify
  `tags` and `source_handle`, image URL, and public product URL.

Build category/subcategory filters from `categories` and the retained `tags`.
Use `slug` for the retail cart handoff. The API is read-only; never use browser
prices or stock as checkout authority.

During the split architecture, keep `CANONICAL_ORIGIN` unset: the Worker
serves its own `workers.dev` host while `plusthirty.dk` remains on Lovable.
This setting also changes Minshop HTML canonical metadata, sitemap, and robots.txt,
not only product API links. The Lovable frontend should construct its public
product-page URLs from each product's `slug`, using its own domain. Do not set
`CANONICAL_ORIGIN=https://plusthirty.dk` unless the Worker is intentionally
serving those canonical routes too.

## Lovable retail cart handoff

The customer-facing domain and storefront remain on Lovable. Set a Lovable-side
environment value such as `MINSHOP_ORIGIN` to the deployed Minshop Worker origin.
Use the actual Worker hostname from Cloudflare; do not point this value at
`plusthirty.dk`, because that domain continues to serve the Lovable storefront.

When the shopper checks out from Lovable, submit a normal top-level form POST to
`${MINSHOP_ORIGIN}/api/cart` (not a cross-origin JavaScript fetch). The form fields are:

- `_action=import`
- `items=[{"slug":"product-slug","quantity":2}]` (JSON string; one row per product)

Minshop sets its own HttpOnly cart cookie and replies with a 303 redirect to its
`/cart` page. The shopper then completes address, shipping, payment, and order
steps on Minshop. Do not send prices, stock values, or discount calculations in
the handoff: Minshop resolves current products, prices, and availability from D1.

The only permitted browser origins for this handoff are
`https://plusthirty.dk`, `https://www.plusthirty.dk`, and
`https://greek-goods-nordic-market.lovable.app`. Keep this allowlist exact; do not
replace it with a wildcard. The import accepts 1–50 products and quantities up to
99. Products requiring a Minshop variant selection are rejected with HTTP 409;
the storefront must show an error rather than silently losing the selection.

Wholesale checkout is separate: approved wholesale users and their customer-specific
pricing continue through the existing authenticated Supabase flow, not this retail
cart handoff.

## Go-live gates
- Shipping remains disabled until Danish delivery rates are configured and the Shipmondo lookup has been verified with the owner's API credentials.
- Card / Bitcoin / Lightning payment methods must be configured and verified before customers are allowed to make live payments.
- The first Admin password must be set before the store is made public.
- Do not buy a real shipping label or create a charge during a technical test without the owner's explicit approval.

No credentials or API keys belong in this repository.
