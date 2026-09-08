export class BoundedMap extends Map {
  constructor(max = 2000, ttl = 30 * 60 * 1000) { super(); this.max = max; this.ttl = ttl; this.expiry = new Map(); }
  set(key, value) {
    if (this.size >= this.max && !this.has(key)) this.delete(this.keys().next().value);
    this.expiry.set(key, Date.now() + this.ttl);
    return super.set(key, value);
  }
  get(key) { if (this.expiry.get(key) < Date.now()) this.delete(key); return super.get(key); }
  has(key) { if (this.expiry.get(key) < Date.now()) this.delete(key); return super.has(key); }
  delete(key) { this.expiry.delete(key); return super.delete(key); }
}
