# attrahouse.com

The Attra House shop: magnetic play food, 3D-printed in Malaysia.

Plans this code follows (private Claude docs): the Website Build Plan, the Selling and Stock Plan, and the Accounts Setup guide.

## How it is built

| Part | What | Where |
| --- | --- | --- |
| Pages | Astro 7, static output | `src/pages`, `src/components` |
| Styles | Tokens from the approved style sheet (16 Nov 2026) | `src/styles/site.css` |
| Fonts | Fredoka and Nunito, served from the site itself | `@fontsource/*` |
| Products, prices, stock numbers | One file | `src/data/products.json` |
| Company details | One file, filled by Compliance | `src/data/company.json` |
| Stock counter and API | Cloudflare Worker + D1 | `src/worker/`, `migrations/` |
| Snap animations | Plain script, stand-in drawings | `public/js/snap.js`, `src/components/art/` |

## Two modes

`SITE_MODE` decides what is built:

- `landing` (default): only the pre-launch landing page (logo, one line, Instagram). Every shop page is removed after the build, and `/api/*` answers 404.
- `shop`: the full shop.

`CHECKOUT_ENABLED=true` turns on buying. It stays `false` until HitPay is connected and tested.

A launch build runs with `SITE_MODE=shop STRICT=1` and stops if any `[bracketed placeholder]` is left on a page.

## Stock rules

- Each product's number starts at the for-sale quantity in `products.json`. SIRIM units are not counted.
- The number can never go below 0 (database CHECK), so the last unit cannot be sold twice.
- Going to payment holds the units for 20 minutes. Unpaid holds go back on sale (checked every 5 minutes and on every stock read).
- Above 3 left the site says "In stock"; from 3 down, "Only N left"; at 0, "Sold out" and the product's waitlist form.
- The Grand Kitchen Bundle is its own stock. Holders sell as any 2 for RM29.

## Commands

```
npm install
npm test            # stock rules, on a local stand-in for D1
npm run build       # landing page
npm run build:shop  # full shop
```

## Never in this repository

Passwords, API keys (HitPay, Brevo), bank details. Keys live in Cloudflare's settings for the Worker.
