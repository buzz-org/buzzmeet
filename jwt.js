// app.js
import module from 'module';
process.env.NODE_PATH = "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\node_modules";
module.Module._initPaths();

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const express = require("express");
const http = require("http");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let uuidv4;
(async () => {
  const uuid = await import('uuid');
  uuidv4 = uuid.v4;
})();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // allow CORS from our demo client
  cors: { origin: true, credentials: true }
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// *** CONFIG (demo values) ***
const ACCESS_TOKEN_SECRET = "change_this_to_a_strong_secret_access"; // replace
const REFRESH_TOKEN_SECRET = "change_this_to_a_strong_secret_refresh"; // replace
const ACCESS_TOKEN_EXP = "20s"; // short for demo; in prod ~minutes
const REFRESH_TOKEN_EXP = "7d";   // long-lived refresh, but rotated
const REFRESH_COOKIE_NAME = "rt"; // refresh token cookie name

// *** In-memory stores for demo ***
// refreshTokens: maps refreshTokenId (jti) => { token, userId, expiresAt }
const refreshTokens = new Map();

// userRefreshIndex: maps userId => Set of active refresh token jti
const userRefreshIndex = new Map();

// Simple users database (demo)
const users = {
  "alice": { id: "user-alice", password: "alicepass", displayName: "Alice" },
  "bob":   { id: "user-bob", password: "bobpass", displayName: "Bob" }
};

// --- Helpers ---
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.displayName },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXP }
  );
}

function signRefreshToken(user, jti) {
  // The refresh token contains the jti and user id; we use a different secret.
  return jwt.sign(
    { sub: user.id, jti },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXP }
  );
}

function storeRefreshToken(jti, token, userId, expiresAt) {
  refreshTokens.set(jti, { token, userId, expiresAt });
  if (!userRefreshIndex.has(userId)) userRefreshIndex.set(userId, new Set());
  userRefreshIndex.get(userId).add(jti);
}

function removeRefreshToken(jti) {
  const rec = refreshTokens.get(jti);
  if (!rec) return;
  refreshTokens.delete(jti);
  const set = userRefreshIndex.get(rec.userId);
  if (set) {
    set.delete(jti);
    if (set.size === 0) userRefreshIndex.delete(rec.userId);
  }
}

function revokeAllRefreshTokensForUser(userId) {
  const set = userRefreshIndex.get(userId);
  if (!set) return;
  for (const jti of Array.from(set)) {
    refreshTokens.delete(jti);
  }
  userRefreshIndex.delete(userId);
}

// http-only cookie setter for refresh token
function setRefreshCookie(res, token) {
  // Secure should be true in production (HTTPS)
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false, // set true on production with HTTPS
    path: "/",
    // no explicit maxAge - cookie expires with token (jwt expiry) but you can set maxAge if preferred.
  });
}

// --- Routes ---

// Public: login - issues access token + refresh token (cookie)
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: "username+password required" });

  const user = users[username];
  if (!user || user.password !== password) return res.status(401).json({ message: "invalid credentials" });

  // Create tokens
  const accessToken = signAccessToken(user);
  const jti = uuidv4(); // unique id for this refresh token
  const refreshToken = signRefreshToken(user, jti);

  // store refresh token
  const decoded = jwt.decode(refreshToken);
  const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000;
  storeRefreshToken(jti, refreshToken, user.id, expiresAt);

  // set cookie
  setRefreshCookie(res, refreshToken);

  return res.json({ accessToken, userId: user.id, name: user.displayName });
});

// Protected route example using access token in Authorization header
app.get("/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ message: "missing token" });
  const token = auth.slice(7);

  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    // payload.sub is userId
    return res.json({ userId: payload.sub, name: payload.name, tokenPayload: payload });
  } catch (err) {
    return res.status(401).json({ message: "invalid/expired access token" });
  }
});

// Refresh endpoint: reads refresh token cookie, rotates refresh token
app.post("/refresh", (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "no refresh token cookie" });

  // Verify refresh token signature first
  let payload;
  try {
    payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (err) {
    // token invalid - possible tampering. Try to decode to find user for safety action.
    try {
      const maybe = jwt.decode(token);
      if (maybe && maybe.sub) revokeAllRefreshTokensForUser(maybe.sub);
    } catch (e) { /* ignore */ }

    res.clearCookie(REFRESH_COOKIE_NAME);
    return res.status(401).json({ message: "invalid refresh token" });
  }

  const { jti, sub: userId } = payload;
  if (!jti || !userId) {
    res.clearCookie(REFRESH_COOKIE_NAME);
    return res.status(401).json({ message: "invalid refresh token payload" });
  }

  // Find stored token record
  const stored = refreshTokens.get(jti);
  if (!stored) {
    // possible token reuse (someone presenting an old refresh token).
    // Security action: revoke all tokens for this user.
    revokeAllRefreshTokensForUser(userId);
    res.clearCookie(REFRESH_COOKIE_NAME);
    return res.status(401).json({ message: "refresh token reuse detected. logged out." });
  }

  // Optional: check token string matches stored.token (defense-in-depth)
  if (stored.token !== token) {
    // Something fishy: revoke everything
    revokeAllRefreshTokensForUser(userId);
    res.clearCookie(REFRESH_COOKIE_NAME);
    return res.status(401).json({ message: "refresh token mismatch. logged out." });
  }

  // All good -- rotate: remove old record, issue new refresh token
  removeRefreshToken(jti);

  // Build new refresh token with new jti
  const newJti = uuidv4();
  const user = Object.values(users).find(u => u.id === userId);
  if (!user) {
    res.clearCookie(REFRESH_COOKIE_NAME);
    return res.status(401).json({ message: "unknown user" });
  }

  const newRefreshToken = signRefreshToken(user, newJti);
  const decodedNew = jwt.decode(newRefreshToken);
  const newExpiresAt = decodedNew.exp ? decodedNew.exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000;
  storeRefreshToken(newJti, newRefreshToken, userId, newExpiresAt);

  // Issue fresh access token
  const accessToken = signAccessToken(user);

  // Set new refresh token cookie (rotation)
  setRefreshCookie(res, newRefreshToken);

  return res.json({ accessToken });
});

// Logout: clears cookie and server-side tokens for the user
app.post("/logout", (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
      revokeAllRefreshTokensForUser(payload.sub);
    } catch (e) {
      // ignore
    }
  }
  res.clearCookie(REFRESH_COOKIE_NAME);
  return res.json({ ok: true });
});

// For demo: list server-side refresh tokens (unsafe in prod)
app.get("/__debug/refresh-tokens", (req, res) => {
  const arr = [];
  for (const [jti, rec] of refreshTokens.entries()) {
    arr.push({ jti, userId: rec.userId, expiresAt: rec.expiresAt });
  }
  res.json(arr);
});

// ---------- socket.io authentication ----------
io.use((socket, next) => {
  // client should send access token in handshake auth: { token: "Bearer ..." } or { token: "xxx" }
  const tokenBearer = socket.handshake.auth && socket.handshake.auth.token;
  if (!tokenBearer) return next(new Error("missing token in socket auth"));

  // accept either "Bearer xxx" or raw token
  const token = tokenBearer.startsWith && tokenBearer.startsWith("Bearer ")
    ? tokenBearer.slice(7)
    : tokenBearer;

  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    // attach user info to socket
    socket.user = { id: payload.sub, name: payload.name };
    return next();
  } catch (err) {
    return next(new Error("invalid/expired access token"));
  }
});

io.on("connection", (socket) => {
  console.log("socket connected", socket.id, "user:", socket.user);
  socket.emit("welcome", { msg: `hello ${socket.user.name}`, user: socket.user });

  socket.on("echo", (d) => {
    console.log("socket message", socket.id, "user:", socket.user);
    socket.emit("echo", { you: socket.user, d });
  });

  socket.on("disconnect", (reason) => {
    console.log("socket disconnected", socket.id, reason);
  });
});

// start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log("Server listening on", PORT));
