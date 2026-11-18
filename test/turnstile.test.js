import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBot } from '../src/worker/turnstile.js';
import { runningSettings } from '../src/worker/settings.js';

const env = { TURNSTILE_SECRET_KEY: 'test-secret-value' };
const args = { token: 'x'.repeat(40), ip: '203.0.113.5', hostname: 'preview-attrahouse-site.attrahouse.workers.dev', action: 'checkout' };
function cf(answer) {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, body: Object.fromEntries(new URLSearchParams(init.body.toString())) }); return new Response(JSON.stringify(answer)); };
  return { calls, fetchFn };
}

test('a real token for this site and action passes, and Cloudflare is asked with the secret, token and IP', async () => {
  const c = cf({ success: true, hostname: args.hostname, action: 'checkout' });
  assert.equal(await checkBot(env, c.fetchFn, args), null);
  assert.equal(c.calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.deepEqual(c.calls[0].body, { secret: 'test-secret-value', response: args.token, remoteip: '203.0.113.5' });
});

test('a token Cloudflare rejects, or one for another site or action, is refused', async () => {
  for (const answer of [
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: true, hostname: 'evil.example', action: 'checkout' },
    { success: true, hostname: args.hostname, action: 'login' },
    {},
  ]) assert.deepEqual(await checkBot(env, cf(answer).fetchFn, args), { status: 403, error: 'bot_check_failed' }, JSON.stringify(answer));
});

test('no token, or a strange one, is refused without asking Cloudflare', async () => {
  for (const token of [undefined, '', 'short', 123, 'x'.repeat(3000)]) {
    const c = cf({ success: true, hostname: args.hostname, action: 'checkout' });
    assert.deepEqual(await checkBot(env, c.fetchFn, { ...args, token }), { status: 400, error: 'bot_check_failed' });
    assert.equal(c.calls.length, 0);
  }
});

test('fails closed: no secret set, or Cloudflare not answering, means no checkout', async () => {
  assert.deepEqual(await checkBot({}, cf({ success: true }).fetchFn, args), { status: 503, error: 'bot_check_not_configured' });
  const down = async () => { throw new Error('network'); };
  assert.deepEqual(await checkBot(env, down, args), { status: 503, error: 'bot_check_unavailable' });
  const notJson = async () => new Response('<html>oops</html>');
  assert.deepEqual(await checkBot(env, notJson, args), { status: 503, error: 'bot_check_unavailable' });
});

test('the Settings in use box shows the bot check secret as Present or Missing, red when buying is on without it', () => {
  const row = (e) => runningSettings(e, 'shop').find((r) => r.label.startsWith('TURNSTILE_SECRET_KEY'));
  assert.deepEqual([row({ CHECKOUT_ENABLED: 'true', TURNSTILE_SECRET_KEY: 's' }).value, row({ CHECKOUT_ENABLED: 'true', TURNSTILE_SECRET_KEY: 's' }).warn], ['Present', false]);
  assert.deepEqual([row({ CHECKOUT_ENABLED: 'true' }).value, row({ CHECKOUT_ENABLED: 'true' }).warn], ['Missing', true]);
  assert.equal(row({ CHECKOUT_ENABLED: 'false' }).warn, false);
});
