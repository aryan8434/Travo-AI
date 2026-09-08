import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, index: true, required: true },

  // Stores a bcrypt hash only — never a plaintext password.
  passwordHash: { type: String, required: true },

  ledgerVersion: { type: Number, default: 0 },
  paymentReviewRequired: { type: Boolean, default: false },
  wallet: { type: Number, default: 0 },
  bookings: { type: Array, default: [] },
  paymentOrders: { type: Array, default: [] },
  paymentMethods: { type: Array, default: [] },
  walletHistory: { type: Array, default: [] },

  // link chat sessions to user
  chatSessions: [{ type: mongoose.Schema.Types.ObjectId, ref: "ChatSession" }],
});

/**
 * Convenience helpers so callers never touch bcrypt directly.
 */
UserSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(String(plain), 10);
};

UserSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(String(plain), this.passwordHash);
};

export default mongoose.model("User", UserSchema);
