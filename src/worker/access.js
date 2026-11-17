// Private pages (/admin/) are protected by Cloudflare Access: Cloudflare asks for a sign-in
// before the request reaches the Worker, then attaches a signed token. The Worker checks that
// token itself, so the pages stay closed even if Access is ever switched off by mistake.
// Needs ACCESS_TEAM_DOMAIN (e.g. attrahouse.cloudflareaccess.com) and ACCESS_AUD (the
// application's audience tag). Without them, /admin/ answers 404.

let certCache = { at: 0, keys: [] };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function keys(team, fetchFn) {
  if (Date.now() - certCache.at < 3600_000 && certCache.keys.length) return certCache.keys;
  const r = await fetchFn(`https://${team}/cdn-cgi/access/certs`);
  const { keys: k = [] } = await r.json();
  certCache = { at: Date.now(), keys: k };
  return k;
}

/** Returns the signed-in email, or null. */
export async function accessUser(request, env, fetchFn = fetch) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!team || !aud) return null;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) return null;
  let header, payload;
  try { header = JSON.parse(new TextDecoder().decode(b64url(h))); payload = JSON.parse(new TextDecoder().decode(b64url(p))); } catch { return null; }
  if (header.alg !== 'RS256') return null;
  const jwk = (await keys(team, fetchFn)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud) || payload.iss !== `https://${team}` || !(payload.exp > now)) return null;
  return payload.email || null;
}
