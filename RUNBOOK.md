# Runbook: attrahouse.com

How to operate the site day to day. Owner: Deployment/IT team. Viveg holds every account and key.

## Where things run

| Thing | Where |
| --- | --- |
| Code | GitHub `vprashad/attrahouse-site` (private) |
| Hosting | Cloudflare Worker `attrahouse-site`, with static assets |
| Live address (pre-launch landing page) | `https://attrahouse-site.attrahouse.workers.dev` (custom domain not attached yet) |
| Shop preview | `https://preview-attrahouse-site.attrahouse.workers.dev`, built from branch `preview` |
| Stock and orders database | Cloudflare D1 `attrahouse-stock` (live). Previews use `attrahouse-stock-preview` (test stock, from 18 Nov 2026). IDs in `wrangler.jsonc`, not secrets |
| Payments | HitPay. Previews use the sandbox; live account not opened yet (needs SSM number and company bank account) |
| Domains | Bought at Porkbun; DNS on Cloudflare (nameservers connected via Porkbun); DNSSEC on |

## Branches and what they build

- `main` builds the **landing page** (scripts/build.mjs reads Cloudflare's `WORKERS_CI_BRANCH`). Deploy command `npx wrangler deploy`.
- Any other branch builds the **shop**. Deploy command `npx wrangler preview`, which needs the `previews` block in `wrangler.jsonc`.
- Keep `src/worker/mode.js` committed as `"landing"`; the build rewrites it.

## Change something

1. Edit on a branch, `npm test` (must pass), `npm run build:shop` to check the shop builds.
2. Push the branch: Cloudflare builds a preview. Check it.
3. Fast-forward `preview` (and `main` when the change matters to the landing page). Nothing goes live without Viveg's go-ahead.

## Keys and settings (Cloudflare dashboard)

- Keys are **Secrets**, never plain Variables, never in the repository. A plain Variable added in the dashboard is replaced by the next deploy.
- Preview keys live on the **preview's own** Settings page (switch the top selector to `preview`): `HITPAY_API_KEY_SANDBOX`, `HITPAY_WEBHOOK_SALT_SANDBOX` (the sandbox **webhook endpoint's own salt**, from its detail view in HitPay, not the API Keys page), `TURNSTILE_SECRET_KEY`. Setting them under the main Worker's "Previews Base" did **not** reach the preview builds (17 Nov 2026).
- Live keys at launch: `HITPAY_API_KEY_LIVE`, `HITPAY_WEBHOOK_SALT_LIVE` (the live webhook endpoint's own salt) and `TURNSTILE_SECRET_KEY` on the Production Settings page. The Worker sends the `_LIVE` key only to `https://api.hit-pay.com` and the `_SANDBOX` key only to the sandbox.
- Plain settings (`CHECKOUT_ENABLED`, `LIVE_PAYMENTS`, `CURRENCY`, `HITPAY_BASE`) come from `wrangler.jsonc`; change them there.
- Build tokens: "Workers Builds" tokens created 17 Nov 2026 for Production and Previews. If builds fail on an API token error, Settings > Builds > API token > Create new token.

## Stock

- Starting numbers: `src/data/products.json` (`startStock`), seeded once into D1 by `INSERT OR IGNORE`. Changing the file later does **not** change live numbers; use the private stock page or a D1 query.
- Private page `/admin/` shows the **settings in use** (mode, buying, live payments, HitPay sandbox or live, whether each key is present, which stock database), then stock and orders, and sets numbers. Check the settings box after every settings change and before launch: anything in red needs fixing.
- Private page `/admin/` is reached only through Cloudflare Access (application "Attra House admin", policy "Viveg only"). It answers 404 until Cloudflare Access protects it and `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set (the Worker verifies Access's signed token itself).
- Restock: set the new number on `/admin/`. Refund: refund the buyer first (in HitPay where it allows; HitPay cannot refund DuitNow QR paid from a banking app, so those go back by bank transfer), then on `/admin/` tick "I have refunded this buyer", choose how, and press **Mark refunded**. For a paid order, also tick "Put the units back on sale" if the goods are coming back or were never sent. A second press does nothing.
- Read numbers without the page: Cloudflare > Storage & databases > D1 > attrahouse-stock > Console: `SELECT sku, available, sold FROM stock;`

## Orders and payment

- Checkout holds stock 20 minutes, writes an order, opens a HitPay payment request (`reference_number` = order id, `redirect_url` = `/order/?id=…`).
- A sale is recorded only when HitPay's API reports the payment request `completed` for the exact amount. The redirect page and the webhook (`/api/hitpay-webhook`) only trigger that check. The webhook fails closed (22 Nov 2026): a call with a wrong or missing signature gets 401, and if no webhook salt is set every call gets 503 `webhook_not_configured`, so HitPay's log shows the failure. The buyer's order page still confirms the payment by asking HitPay directly.
- `needs_refund`: paid after the hold expired and the stock had gone. Refund in HitPay, then Mark refunded (no units to put back). Refunded orders show "refunded" with the date and who marked it.
- Sandbox test payment that works: DuitNow QR, scanned with a phone's camera app (not a banking app). Sandbox cards need a bank account in the sandbox, which was not added.

## When something breaks

- Build failed: open the build in Cloudflare > Deployments (switch to `preview` for preview builds), Copy build log.
- Runtime errors: turn on Logs in the Worker's Observability, reproduce, read the log.
- "Payment is not available": HitPay refused or was unreachable. "Test payments are not set up": the `_SANDBOX` key is missing from the preview.
- Shop stuck on "Checking stock": `/api/stock` failing; check Logs and the D1 binding.

## Bot check (Cloudflare Turnstile)

- Widget "Attra House checkout" (Managed mode). Sitekey (public) in `src/data/turnstile.json`; secret only as the `TURNSTILE_SECRET_KEY` Secret.
- Checkout fails closed: no secret, no token, a bad token, a token for another hostname or action, or siteverify not answering means no payment page. The Settings in use box on `/admin` shows the secret as Present or Missing.
- When `attrahouse.com` goes on the Worker, add it to the widget's hostnames in the Turnstile dashboard.

## DuitNow QR refunds (Compliance, 20 Nov 2026)

HitPay cannot refund DuitNow QR paid from a banking app. Follow `compliance/website-legal-pages.md` section 2 in the Attra House project: email the address on the order from the business mailbox (EN/BM template there), ask only for order number, account holder's name, bank and account number, never store them in the site or its database, send the transfer from the company account, record the reference, then delete the email and empty Trash within 30 days. Then press Mark refunded on `/admin` with How = By bank transfer.

## Launch range, Bundle and delivery area (22 Nov 2026)

- **Phase 1 only** is on sale: Fruit Basket, Veggie Garden, Meal Time, Chef's Knife Block, Grand Kitchen Bundle, holders. Pasta Set, Pink Cake Set, Chocolate Cake Set and Grocery Playset carry `"status": "coming-soon"` in `src/data/products.json` and have no price or stock there. They show on the home page as a name and "Coming soon" only (Design spec section 6), have no product page (404), are left out of `/api/stock` and `/admin`, and `/api/checkout` refuses them (`not_on_sale`). To put one on sale: Finance confirms the price, Production the stock, Compliance the wording; then remove `status` and add `priceSen`, `startStock`, `tile`.
- **Bundle**: `priceSen` must equal Fruit Basket + Veggie Garden + Meal Time (a test fails otherwise), with the Chef's Knife Block listed under `free`. Wording is Compliance's, in `src/data/strings.json` (`bundle`), filled with computed amounts. Never show a "was" price or a "Save RM" figure. The Bundle and the Knife Block are separate stock numbers: a Bundle sale lowers only the Bundle's number, so the Knife Blocks packed into Bundles must be set aside from the ones sold on their own.
- **Delivery is within Malaysia only**: checkout asks for a 5-digit postcode and one of the 16 states and federal territories (`src/data/malaysia.json`); the Worker refuses anything else and works out the delivery region from the state. It does not check that the postcode belongs to the state.

## Legal pages, product name, three-set offer (22 Nov 2026, late)

- `/terms/`, `/returns/`, `/delivery/`, `/privacy/` carry Compliance's drafts (`compliance/website-legal-pages.md` sections 4 and 7) word for word, with their `[square brackets]` left in and a "draft" note at the top. Deployment writes none of this wording. The privacy page has the BM text under the English. Two fills Compliance's notes call for: the Web Analytics sentence is deleted (it is not on) and the email tool is named as Brevo (Viveg, 22 Nov). The free item's name and worth on the returns page come from `products.json`.
- The checkout tick box is replaced by Compliance's line above the Pay button ("By placing this order you agree to…"), with links.
- Product name is **Chef's Knife Block Set** (Viveg, 22 Nov). The page address stays `/chefs-knife-block/`.
- With all three sets in the basket the buyer is **offered** the switch to the Bundle (same price, free Knife Block Set); nothing changes unless they say yes (Viveg, 22 Nov evening, via Design). The sentence is Design's draft; Compliance has not read it yet.

## Checkout form fields (24 Nov 2026)

The delivery form follows the usual shop checkout pattern (Viveg, 24 Nov): Contact (email), then Country/Region, first name (optional), last name, address, apartment (optional), postcode, city, state/territory, phone. The Country/Region menu and the server both take their list from `countries` in `src/data/malaysia.json` (Malaysia only); to deliver elsewhere, add the country there and its states and fees. The order still stores one name and one address line, so the database did not change. Left out on purpose: company name, pickup, saved details, and marketing tick boxes (those need Compliance's wording).
