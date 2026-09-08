import jwt from "jsonwebtoken";

/**
 * Bearer-token auth middleware. Attaches req.userId and req.username from a
 * verified JWT. Rejects with 401 on any problem.
 */
export default function auth(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    console.error("JWT_SECRET missing — rejecting authenticated request");
    return res.status(503).json({ error: "Auth not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: "travo-auth", audience: "travo-user" });
    if (!/^[a-f0-9]{24}$/i.test(decoded.userId) || typeof decoded.username !== "string") throw new Error("Invalid identity");
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
