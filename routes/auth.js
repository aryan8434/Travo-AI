import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

/**
 * JWT secret is required — no insecure fallback. index.js also guards this on boot.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is not configured (min 32 chars)");
  }
  return secret;
}

function issueToken(user) {
  return jwt.sign(
    { userId: user._id, username: user.username },
    getJwtSecret(),
    { expiresIn: "1d", algorithm: "HS256", issuer: "travo-auth", audience: "travo-user" },
  );
}

// User Signup Endpoint
router.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const cleanUsername = String(username).trim();
    const cleanPassword = password;
    if (username.length > 32 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Invalid credentials" });

    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      return res.status(400).json({ error: "Username must be 3-32 characters" });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      return res
        .status(400)
        .json({ error: "Username may only contain letters, numbers, and _ . -" });
    }

    if (cleanPassword.length < 8 || Buffer.byteLength(cleanPassword, "utf8") > 72) {
      return res.status(400).json({ error: "Password must be at least 8 characters and at most 72 UTF-8 bytes" });
    }

    const exists = await User.findOne({ username: cleanUsername });
    if (exists) {
      return res
        .status(400)
        .json({ error: "Username already exists. Please login instead." });
    }

    const passwordHash = await User.hashPassword(cleanPassword);
    const newUser = await User.create({
      username: cleanUsername,
      passwordHash,
      ledgerVersion: 2,
      wallet: 0,
    });

    res.json({
      success: true,
      token: issueToken(newUser),
      user: { username: cleanUsername, walletBalance: 0 },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// User Login Endpoint
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const cleanUsername = String(username).trim();
    const cleanPassword = password;
    if (username.length > 32 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Invalid credentials" });

    const user = await User.findOne({ username: cleanUsername });

    // Generic message — do not disclose whether the username exists.
    const invalid = () =>
      res.status(400).json({ error: "Invalid username or password" });

    if (cleanUsername === "test1234" || !user || !user.passwordHash) return invalid();

    const ok = await user.verifyPassword(cleanPassword);
    if (!ok) return invalid();

    res.json({
      success: true,
      token: issueToken(user),
      user: {
        username: user.username,
        walletBalance: user.wallet ?? 0,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
