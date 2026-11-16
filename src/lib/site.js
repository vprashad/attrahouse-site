// Build-time switches.
// SITE_MODE=landing (default): only the pre-launch landing page is built.
// SITE_MODE=shop: the full shop. Used for preview branches now, and for launch.
export const SITE_MODE = (import.meta.env.SITE_MODE || process.env.SITE_MODE || 'landing') === 'shop' ? 'shop' : 'landing';
export const CHECKOUT_OPEN = (import.meta.env.CHECKOUT_ENABLED || process.env.CHECKOUT_ENABLED) === 'true';
export const rm = (sen) => (sen == null ? '' : `RM${(sen / 100).toFixed(sen % 100 ? 2 : 0)}`);
