import mongoose from 'mongoose';
import crypto from 'node:crypto';

const schema = new mongoose.Schema({
  _id: String,
  totalHits: { type: Number, default: 0 },
  resetTime: { type: Date, required: true, expires: 0 },
}, { versionKey: false });
const Counter = mongoose.models.RateLimitCounter || mongoose.model('RateLimitCounter', schema);

// Fixed windows shared by every function instance; expired windows never count
// toward a new window even before MongoDB's TTL cleanup has run.
export class MongoRateLimitStore {
  localKeys = false;
  constructor(prefix) { this.prefix = prefix; }
  init({ windowMs }) { this.windowMs = windowMs; }
  window(key) {
    const start = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return { _id: `${this.prefix}:${start}:${hash}`, resetTime: new Date(start + this.windowMs) };
  }
  async increment(key) {
    const { _id, resetTime } = this.window(key);
    let doc;
    try {
      doc = await Counter.findOneAndUpdate({ _id }, { $inc: { totalHits: 1 }, $setOnInsert: { resetTime } }, { upsert: true, returnDocument: 'after' }).lean();
    } catch (err) {
      if (err.code !== 11000) throw err;
      doc = await Counter.findOneAndUpdate({ _id }, { $inc: { totalHits: 1 } }, { returnDocument: 'after' }).lean();
    }
    return { totalHits: doc.totalHits, resetTime: doc.resetTime };
  }
  async decrement(key) { await Counter.updateOne({ _id: this.window(key)._id, totalHits: { $gt: 0 } }, { $inc: { totalHits: -1 } }); }
  async resetKey(key) { await Counter.deleteOne({ _id: this.window(key)._id }); }
}
