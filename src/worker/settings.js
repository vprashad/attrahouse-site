// "Settings in use" box on the private page: what this running copy of the site is actually
// using, read when the page opens. Never shows a key or salt, only whether one is present.
import { isLive } from './hitpay.js';

const has = (v) => typeof v === 'string' && v.length > 0;
const onOff = (v) => (v === 'true' ? 'On' : 'Off');

/** Rows of { label, value, warn } for the box. `warn` marks a combination that should not happen. */
export function runningSettings(env, siteMode) {
  const live = isLive(env);
  const keyName = live ? 'HITPAY_API_KEY_LIVE' : 'HITPAY_API_KEY_SANDBOX';
  const saltName = live ? 'HITPAY_WEBHOOK_SALT_LIVE' : 'HITPAY_WEBHOOK_SALT_SANDBOX';
  const key = env[keyName], salt = env[saltName];
  const db = env.STOCK_DB;
  return [
    { label: 'Site mode', value: siteMode === 'shop' ? 'Shop' : 'Landing page', warn: false },
    { label: 'Buying', value: onOff(env.CHECKOUT_ENABLED), warn: false },
    { label: 'Live payments', value: onOff(env.LIVE_PAYMENTS), warn: (env.LIVE_PAYMENTS === 'true') !== live },
    { label: 'HitPay', value: live ? 'Live (real money)' : 'Sandbox (test money)', warn: (env.LIVE_PAYMENTS === 'true') !== live },
    { label: `${keyName}`, value: has(key) ? 'Present' : 'Missing', warn: env.CHECKOUT_ENABLED === 'true' && !has(key) },
    { label: `${saltName}`, value: has(salt) ? 'Present' : 'Missing', warn: env.CHECKOUT_ENABLED === 'true' && !has(salt) },
    {
      label: 'Stock database',
      value: db === 'attrahouse-stock' ? 'attrahouse-stock (real stock)' : db === 'attrahouse-stock-preview' ? 'attrahouse-stock-preview (test stock)' : 'Not labelled',
      warn: !has(db) || (db === 'attrahouse-stock-preview' && live),
    },
    { label: 'TURNSTILE_SECRET_KEY (bot check)', value: has(env.TURNSTILE_SECRET_KEY) ? 'Present' : 'Missing', warn: env.CHECKOUT_ENABLED === 'true' && !has(env.TURNSTILE_SECRET_KEY) },
    // Brevo (order emails); not used by any code yet, so a missing key is not a warning.
    { label: 'BREVO_API_KEY (order emails)', value: has(env.BREVO_API_KEY) ? 'Present' : 'Missing', warn: false },
    { label: 'Currency', value: env.CURRENCY || 'Not set', warn: env.CURRENCY !== 'MYR' },
  ];
}
