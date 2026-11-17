# Launch checklist

Nothing here is done until it is ticked and Viveg has said go.

## Must be true (other teams)
- [ ] Compliance: name search on "Attra House" clear; MC mark and number supplied; terms, privacy notice, shipping and returns approved; company details for the footer
- [ ] Finance: delivery fees in `src/data/products.json` (`delivery`); prices re-checked
- [ ] Production: contents, box sizes, dispatch time for every product
- [ ] HitPay live account approved (needs SSM number and the company bank account)
- [ ] Hyrule 3D Forge and 3DPmom commercial licences bought (Viveg asked to be reminded)
- [ ] Ask Viveg again: limit per buyer in the first batch? (He said no for now, 16 Nov 2026)

## Switches (Claude, with Viveg)
- [ ] Give previews their own D1 database, so a test on a preview can never change real stock
- [ ] Reset every product to the real for-sale quantity
- [ ] Production vars: `CHECKOUT_ENABLED=true`, `LIVE_PAYMENTS=true`, `HITPAY_BASE=https://api.hit-pay.com`; live `HITPAY_API_KEY` and `HITPAY_WEBHOOK_SALT` added as secrets by Viveg
- [ ] HitPay live webhook endpoint `https://attrahouse.com/api/hitpay-webhook`, event `payment_request.completed`
- [ ] Turnstile bot check on checkout
- [ ] Cloudflare Access on `/admin/` (and `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` set)
- [ ] Remove `public/_headers` noindex rule; add a site map
- [ ] Build `main` as the shop (change `scripts/build.mjs`) with `STRICT=1`: no placeholders left
- [ ] Custom domain attrahouse.com on the Worker; attra-house.com redirects to it
- [ ] One real purchase by Viveg, refunded, before announcing

## Tests run before launch
- [ ] Buy each product and the Bundle in sandbox; stock and totals right
- [ ] Two buyers for the last unit; payment abandoned; payment failed; late payment
- [ ] Every page at 375, 768, 1024, 1440 px; real Android and iPhone
