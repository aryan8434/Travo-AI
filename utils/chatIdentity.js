import crypto from 'node:crypto';
import auth from './auth.js';
// A domain-separated shared key keeps guest cookies valid across cold starts.
const sessionSecret = process.env.JWT_SECRET
  ? crypto.createHmac('sha256', process.env.JWT_SECRET).update('travo-guest-session-v1').digest()
  : crypto.randomBytes(32);
const sign = id => crypto.createHmac('sha256', sessionSecret).update(id).digest('hex');

// Chat IDs supplied in the body never choose another visitor's history.
export function chatIdentity(req, res, next) {
  if (req.headers.authorization) return auth(req, res, () => {
    req.chatSessionId = `user:${req.userId}`;
    next();
  });
  const raw = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('travo_session='))?.slice(14) || '';
  const [id, signature] = raw.split('.');
  let guestId = id;
  if (!/^[a-f0-9]{48}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(signature || '') || !crypto.timingSafeEqual(Buffer.from(sign(id)), Buffer.from(signature))) {
    guestId = crypto.randomBytes(24).toString('hex');
    res.cookie('travo_session', `${guestId}.${sign(guestId)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 86400000, path: '/' });
  }
  req.chatSessionId = `guest:${guestId}`;
  next();
}
