// HitPay API: create a payment page, and ask HitPay whether it was paid.
// Docs: https://docs.hitpayapp.com/apis/guide/online-payments
// The API key stays on Cloudflare (a secret); it never reaches the browser or the repository.

const SANDBOX = 'https://api.sandbox.hit-pay.com';

function base(env) { return (env.HITPAY_BASE || SANDBOX).replace(/\/$/, ''); }
/** True only when talking to HitPay's live API. */
export function isLive(env) { return base(env) === 'https://api.hit-pay.com'; }
/**
 * Keys are named by the account they belong to, so a sandbox key can never be sent to the
 * live API or the other way round: HITPAY_API_KEY_SANDBOX / HITPAY_API_KEY_LIVE, and the same
 * for HITPAY_WEBHOOK_SALT_SANDBOX / HITPAY_WEBHOOK_SALT_LIVE.
 */
export function apiKey(env) { return isLive(env) ? env.HITPAY_API_KEY_LIVE : env.HITPAY_API_KEY_SANDBOX; }
export function webhookSalt(env) { return isLive(env) ? env.HITPAY_WEBHOOK_SALT_LIVE : env.HITPAY_WEBHOOK_SALT_SANDBOX; }
function headers(env) {
  return { 'X-BUSINESS-API-KEY': apiKey(env), 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' };
}
export const senToAmount = (sen) => (sen / 100).toFixed(2);
/**
 * HitPay's amount back in sen, whatever form it comes in: "328.00", "2,880.00", 2880 or 2880.5.
 * Returns null if it is not a clean money amount.
 */
export function amountToSen(amount) {
  const s = String(amount ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Create a HitPay payment request. Returns { id, url } or throws. */
export async function createPaymentRequest(env, fetchFn, o) {
  const body = new URLSearchParams({
    amount: senToAmount(o.totalSen),
    currency: env.CURRENCY || 'MYR',
    email: o.email,
    name: o.name,
    phone: o.phone,
    purpose: o.purpose,
    reference_number: o.reference,
    redirect_url: o.redirectUrl,
  });
  const r = await fetchFn(`${base(env)}/v1/payment-requests`, { method: 'POST', headers: headers(env), body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id || !data.url) throw new Error(`hitpay_create_failed ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return { id: data.id, url: data.url };
}

/** Ask HitPay for a payment request's current state. */
export async function getPaymentRequest(env, fetchFn, id) {
  const r = await fetchFn(`${base(env)}/v1/payment-requests/${encodeURIComponent(id)}`, { method: 'GET', headers: headers(env) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`hitpay_get_failed ${r.status}`);
  return data;
}

/** HMAC-SHA256 of the raw body with the webhook salt, compared in constant time. */
export async function verifySignature(salt, rawBody, signature) {
  if (!salt || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/**
 * Is this webhook call really from HitPay? Fails closed: with no salt set, every call is refused,
 * so an unsigned call can never be accepted by mistake. Returns null when the call is good.
 */
export async function checkWebhook(salt, rawBody, signature) {
  if (!salt) return { status: 503, error: 'webhook_not_configured' };
  if (!(await verifySignature(salt, rawBody, signature))) return { status: 401, error: 'bad_signature' };
  return null;
}
