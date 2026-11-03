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

## Go-live gates
- Shipping remains disabled until Danish delivery rates are configured and the Shipmondo lookup has been verified with the owner's API credentials.
- Card / Bitcoin / Lightning payment methods must be configured and verified before customers are allowed to make live payments.
- The first Admin password must be set before the store is made public.
- Do not buy a real shipping label or create a charge during a technical test without the owner's explicit approval.

No credentials or API keys belong in this repository.
