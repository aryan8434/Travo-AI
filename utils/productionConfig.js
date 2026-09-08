import crypto from 'node:crypto';
import compromisedKeys from '../data/compromised-payment-keys.json' with { type: 'json' };

export function productionIssues(env = process.env) {
  const issues = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) issues.push('JWT_SECRET must contain at least 32 characters');
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI || '')) issues.push('MONGO_URI must point to persistent MongoDB storage');
  const origins = (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(s => { try { const u = new URL(s); return u.protocol !== 'https:' || u.origin !== s || ['localhost', '127.0.0.1'].includes(u.hostname); } catch { return true; } })) issues.push('CORS_ORIGINS must contain exact public HTTPS origins');
  if (!/^rzp_live_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID || '') || !env.RAZORPAY_KEY_SECRET) issues.push('A fresh live Razorpay key pair is required');
  if (compromisedKeys.includes(crypto.createHash('sha256').update(env.RAZORPAY_KEY_ID || '').digest('hex'))) issues.push('The configured Razorpay key was exposed in Git and must be replaced');
  if (!env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET.length < 32) issues.push('RAZORPAY_WEBHOOK_SECRET must contain at least 32 characters');
  if (env.RAZORPAY_WEBHOOK_SECRET && env.RAZORPAY_WEBHOOK_SECRET === env.JWT_SECRET) issues.push('Webhook and authentication secrets must be different');
  return issues;
}

export function assertProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const issues = productionIssues(env);
  if (issues.length) throw new Error(`Production configuration incomplete: ${issues.join('; ')}`);
}
