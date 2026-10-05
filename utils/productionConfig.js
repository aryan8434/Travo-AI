import crypto from 'node:crypto';
import compromisedKeys from '../data/compromised-payment-keys.json' with { type: 'json' };

export function coreProductionIssues(env = process.env) {
  const issues = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) issues.push('JWT_SECRET must contain at least 32 characters');
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI || '')) issues.push('MONGO_URI must point to persistent MongoDB storage');
  const origins = (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(s => { try { const u = new URL(s); return u.protocol !== 'https:' || u.origin !== s || ['localhost', '127.0.0.1'].includes(u.hostname); } catch { return true; } })) issues.push('CORS_ORIGINS must contain exact public HTTPS origins');
  return issues;
}

// RAZORPAY_MODE=test is an explicit opt-in for demos: it accepts only rzp_test_
// keys, so no real money can move, and the webhook becomes optional because
// browser verification settles test payments on its own.
export function paymentMode(env = process.env) {
  return env.RAZORPAY_MODE === 'test' ? 'test' : 'live';
}

export function paymentProductionIssues(env = process.env) {
  const issues = [];
  const mode = paymentMode(env);
  if (!new RegExp(`^rzp_${mode}_[A-Za-z0-9]+$`).test(env.RAZORPAY_KEY_ID || '') || !env.RAZORPAY_KEY_SECRET) issues.push(mode === 'test' ? 'Test mode requires a Razorpay test key pair (rzp_test_)' : 'A fresh live Razorpay key pair is required');
  if (compromisedKeys.includes(crypto.createHash('sha256').update(env.RAZORPAY_KEY_ID || '').digest('hex'))) issues.push('The configured Razorpay key was exposed in Git and must be replaced');
  const webhook = env.RAZORPAY_WEBHOOK_SECRET;
  if ((mode === 'live' || webhook) && (!webhook || webhook.length < 32)) issues.push('RAZORPAY_WEBHOOK_SECRET must contain at least 32 characters');
  if (webhook && webhook === env.JWT_SECRET) issues.push('Webhook and authentication secrets must be different');
  return issues;
}

export function productionIssues(env = process.env) {
  return [...coreProductionIssues(env), ...paymentProductionIssues(env)];
}

export function assertProductionConfig(env = process.env, { requirePayments = true } = {}) {
  if (env.NODE_ENV !== 'production') return;
  const issues = requirePayments ? productionIssues(env) : coreProductionIssues(env);
  if (issues.length) throw new Error(`Production configuration incomplete: ${issues.join('; ')}`);
}
