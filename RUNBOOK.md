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
- Preview keys live on the **preview's own** Settings page (switch the top selector to `preview`): `HITPAY_API_KEY_SANDBOX`, `HITPAY_WEBHOOK_SALT_SANDBOX`. Setting them under the main Worker's "Previews Base" did **not** reach the preview builds (17 Nov 2026).
- Live keys at launch: `HITPAY_API_KEY_LIVE`, `HITPAY_WEBHOOK_SALT_LIVE` on the Production Settings page. The Worker sends the `_LIVE` key only to `https://api.hit-pay.com` and the `_SANDBOX` key only to the sandbox.
- Plain settings (`CHECKOUT_ENABLED`, `LIVE_PAYMENTS`, `CURRENCY`, `HITPAY_BASE`) come from `wrangler.jsonc`; change them there.
- Build tokens: "Workers Builds" tokens created 17 Nov 2026 for Production and Previews. If builds fail on an API token error, Settings > Builds > API token > Create new token.

## Stock

- Starting numbers: `src/data/products.json` (`startStock`), seeded once into D1 by `INSERT OR IGNORE`. Changing the file later does **not** change live numbers; use the private stock page or a D1 query.
- Private page `/admin/` shows the **settings in use** (mode, buying, live payments, HitPay sandbox or live, whether each key is present, which stock database), then stock and orders, and sets numbers. Check the settings box after every settings change and before launch: anything in red needs fixing.
- Private page `/admin/` is reached only through Cloudflare Access (application "Attra House admin", policy "Viveg only"). It answers 404 until Cloudflare Access protects it and `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set (the Worker verifies Access's signed token itself).
- Restock: set the new number on `/admin/`. Refund: refund in HitPay first, then on `/admin/` tick "I have refunded this in HitPay" on the order and press **Mark refunded**. For a paid order, also tick "Put the units back on sale" if the goods are coming back or were never sent. A second press does nothing.
- Read numbers without the page: Cloudflare > Storage & databases > D1 > attrahouse-stock > Console: `SELECT sku, available, sold FROM stock;`

## Orders and payment

- Checkout holds stock 20 minutes, writes an order, opens a HitPay payment request (`reference_number` = order id, `redirect_url` = `/order/?id=…`).
- A sale is recorded only when HitPay's API reports the payment request `completed` for the exact amount. The redirect page and the webhook (`/api/hitpay-webhook`) only trigger that check.
- `needs_refund`: paid after the hold expired and the stock had gone. Refund in HitPay, then Mark refunded (no units to put back). Refunded orders show "refunded" with the date and who marked it.
- Sandbox test payment that works: DuitNow QR, scanned with a phone's camera app (not a banking app). Sandbox cards need a bank account in the sandbox, which was not added.

## When something breaks

- Build failed: open the build in Cloudflare > Deployments (switch to `preview` for preview builds), Copy build log.
- Runtime errors: turn on Logs in the Worker's Observability, reproduce, read the log.
- "Payment is not available": HitPay refused or was unreachable. "Test payments are not set up": the `_SANDBOX` key is missing from the preview.
- Shop stuck on "Checking stock": `/api/stock` failing; check Logs and the D1 binding.
