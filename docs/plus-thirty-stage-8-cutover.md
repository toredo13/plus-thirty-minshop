# Plus Thirty — Stage 8 cutover and rollback runbook

This runbook is the final production gate for moving Plus Thirty away from Shopify. Stage 8 is not permission to cancel Shopify or change DNS before every gate below has evidence.

## Stage 7 — automated test evidence

The latest checked revisions passed:

- Minshop `plus-thirty-v020`, commit `71b6d6d7bddee273ac64d6cfecb85b3c7aeb3dbd`: Minshop quality checks passed (unit tests, Astro/TypeScript checks, Cloudflare Worker build).
- The same Minshop commit: full `Verify` passed, including unit/integration verification, D1-backed cart and checkout integration, and the `market` and `studio` theme contract/build jobs.
- Lovable storefront `main`, commit `c3e852e7e03b1a18fd41b97fa80c182a475b6222`: Storefront tests and production build passed, including wholesale order approval/pricing tests.

These are automated CI checks. They do not prove live provider credentials, Cloudflare production bindings, custom-domain routing, a real payment, or a real carrier booking are correct.

## Current production configuration facts

Inspected in the repository:

- Store currency: DKK.
- Store timezone: Europe/Copenhagen.
- Shipping in `src/store.config.ts` is deliberately `enabled: false` with an empty zones list.
- `wrangler.template.jsonc` provisions D1 and R2. Integrations requiring external credentials must be configured separately in the deployed environment / Admin; no provider secrets belong in Git.
- The Lovable storefront points at Minshop by `VITE_MINSHOP_BASE_URL`, falling back to `https://minshop.plusthirtydk.workers.dev`.
- The Worker must keep `CANONICAL_ORIGIN` unset while `plusthirty.dk` serves the Lovable storefront.
- Retail cart handoff is a POST to Minshop; only product slugs and quantities cross the boundary. Minshop resolves prices, stock and availability from D1.
- Approved B2B customers and customer-specific prices remain in the authenticated Supabase flow.

## Gate A — Shopify archive (before any shutdown)

Create an owner-controlled, private archive outside GitHub. Export and verify, as available in the Shopify Admin:

1. Products (including images/handles, options, variants, SKU/barcode, weight, inventory and status).
2. Orders (including line items, totals, taxes, discounts, addresses, payment/refund and fulfillment/tracking history).
3. Customers and company/B2B records required for legal/accounting and service continuity.
4. Discount codes, gift cards/store credit, collections/categories, pages/blog content, navigation, URL redirects and files.
5. Theme source/assets and a record of store settings: domains, taxes, shipping, payment methods, email notifications, legal pages, apps and subscriptions.
6. Financial reports/payout and tax records required for accounting.

Keep personal data and exports private, encrypted, and retained according to applicable Danish/EU data-protection and accounting requirements. Do not commit exports or credentials to GitHub.

The Shopify CSV product importer in Minshop is available under Admin → Import from Shopify. The catalogue is not migrated until the owner imports the export and reconciles product count, images, DKK prices, active status, SKU/barcode, stock, weights, categories and variants. The current importer explicitly rejects real variants; do not publish affected products until their variants are added/resolved in Minshop.

## Gate B — production Minshop readiness

Before customers are sent to Minshop checkout, record evidence for every item:

- Confirm the deployed Worker URL and the current production version.
- Confirm remote D1 migrations are applied and the production D1 database contains the reconciled catalogue.
- Confirm R2 images load publicly with no Shopify CDN dependency.
- Set and verify the first Admin password; remove demo/sample products and data.
- Configure Stripe production keys and webhook endpoint; verify successful payment, abandoned/expired checkout, payment failure, refund and duplicate webhook/idempotency behaviour in test mode first.
- Configure Shipmondo credentials and Danish DAO, GLS and PostNord services/rates. Verify home delivery, parcel-shop search/map/list, saved service-point selection, quote, label/tracking lifecycle and email notifications with the real account. Do not purchase a paid label during testing without the owner's explicit approval.
- Configure Danish delivery zones/rates in Admin and deliberately enable shipping only after the carrier tests pass. The checked-in safe default is currently shipping-off.
- Verify correct consumer-facing DKK/VAT prices, shipping/VAT treatment and the accounting/tax configuration with the store's Danish accountant/provider settings.
- Verify order confirmation, failed/expired payment, refund and shipped emails.
- Verify B2B approval, default discount, per-product fixed/percentage prices, invoice-request order history and rejected/unapproved access.
- Verify mobile and desktop, DA/EN/EL languages, product pages, cart, checkout, pickup, legal pages and contact paths.

Use Stripe test mode and provider test facilities wherever supported. A real customer charge or paid carrier label requires explicit owner approval and must be reconciled/refunded as appropriate.

## Gate C — custom domain and routing

- Inspect the active DNS and hosting target for `plusthirty.dk` and `www.plusthirty.dk` before changing anything.
- Keep the public domain on the final Lovable storefront. Minshop remains on its Worker origin unless a separately planned domain architecture has been tested.
- Keep `VITE_MINSHOP_BASE_URL` set to the actual HTTPS Worker origin in the Lovable production environment.
- Keep Minshop `CANONICAL_ORIGIN` unset while the Worker is not serving the public storefront domain.
- Confirm HTTPS, redirect behaviour, canonical URLs, sitemap, robots.txt, checkout handoff allowlist and email sender/domain verification.
- Change DNS only when the Lovable build has been published and verified, and record the old DNS values and TTLs first so rollback is possible.

## Gate D — controlled launch and rollback

1. Put Shopify exports and the current DNS/provider configuration in the private archive.
2. Publish the final Lovable storefront and verify its production build/URL.
3. Complete one end-to-end test order in the intended production setup (test payment mode where supported). Verify D1 order, stock reservation/settlement, payment, shipping method or pickup point, confirmation email and order administration.
4. If a live charge is required to validate the live account, obtain explicit owner approval first; make a small controlled order and refund/reconcile it.
5. Monitor the first real orders and payment/shipping webhooks. Keep Shopify active and accessible throughout this period.
6. If any gate fails, stop new orders on the new checkout, restore the previously recorded DNS/checkout routing, and continue serving customers on the previous working path. Do not delete the old store/data.
7. Cancel Shopify only after the owner confirms the archive is complete, all new live orders/payments/refunds/fulfillments work, and there is no remaining Shopify dependency. Retain the archive and accounting records.

## Stop conditions

Do not perform the DNS cutover or cancel Shopify while any of these remain true:

- Shopify archive has not been created and checked.
- Catalogue/variants/images/prices/stock have not been reconciled.
- Production Worker, D1, R2 or Admin access is unverified.
- Shipping is still disabled or Shipmondo rates/pickup point flow are unverified.
- Stripe live configuration/webhook/refund flow is unverified.
- Domain target, HTTPS and rollback values are not recorded.
- No verified end-to-end order exists.

## Current handover status

- Stage 7 automated CI: passed on the revisions listed above.
- B2B pricing unit coverage: added and passed.
- Stripe checkout payload unit coverage: added and passed.
- Full Minshop Verify: passed on commit `71b6d6d7bddee273ac64d6cfecb85b3c7aeb3dbd`.
- Shopify archive, production catalogue reconciliation, real provider configuration, domain verification and live order: not evidenced by CI; these remain owner/account-level cutover gates.
