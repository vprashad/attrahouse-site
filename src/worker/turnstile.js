// Cloudflare Turnstile: a bot check on checkout. The browser gets a one-time token from Cloudflare;
// the Worker asks Cloudflare's siteverify whether that token is real, fresh, for this site and this action.
// Fails closed: no secret, no token, a bad token or Cloudflare not answering means no checkout.
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Returns null when the check passed, or { status, error } to send back to the buyer. */
export async function checkBot(env, fetchFn, { token, ip, hostname, action }) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('turnstile_not_configured');
    return { status: 503, error: 'bot_check_not_configured' };
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) return { status: 400, error: 'bot_check_failed' };
  let data;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set('remoteip', ip);
    const r = await fetchFn(SITEVERIFY, { method: 'POST', body });
    data = await r.json();
  } catch (e) {
    console.error('turnstile_unavailable', String(e));
    return { status: 503, error: 'bot_check_unavailable' };
  }
  const ok = data && data.success === true && data.hostname === hostname && (!action || data.action === action);
  if (!ok) {
    console.error(`turnstile_failed codes=${JSON.stringify(data && data['error-codes'])} host=${data && data.hostname} action=${data && data.action}`);
    return { status: 403, error: 'bot_check_failed' };
  }
  return null;
}
