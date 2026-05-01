// Vercel serverless proxy for Google Gemini.
// Keeps GEMINI_API_KEY on the server. Set it in the Vercel project's
// Environment Variables (Settings → Environment Variables).
//
// Required env:
//   GEMINI_API_KEY           — your Gemini API key
//   FIREBASE_PROJECT_ID      — e.g. internsphere-9c869
//   UPSTASH_REDIS_REST_URL   — from Upstash dashboard
//   UPSTASH_REDIS_REST_TOKEN — from Upstash dashboard
//
// Optional env:
//   ALLOWED_ORIGINS       — comma-separated list of origins allowed to call
//     this endpoint (e.g. "https://your-site.vercel.app,http://localhost:3000").
//     If unset, any origin is allowed — fine for first deploys, tighten later.
//   RATE_LIMIT_REQUESTS   — max requests per window per user (default: 10)
//   RATE_LIMIT_WINDOW_SEC — window size in seconds (default: 60)
//   DAILY_LIMIT_REQUESTS  — max requests per day per user (default: 80)

import { createVerify } from "crypto";

export const config = {
  maxDuration: 30,
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RATE_LIMIT_REQUESTS   = parseInt(process.env.RATE_LIMIT_REQUESTS   || "10",  10);
const RATE_LIMIT_WINDOW_SEC = parseInt(process.env.RATE_LIMIT_WINDOW_SEC || "60",  10);
const DAILY_LIMIT_REQUESTS  = parseInt(process.env.DAILY_LIMIT_REQUESTS  || "80",  10);

// ---------------------------------------------------------------------------
// Firebase token verification
// Uses Node's built-in `createVerify` with the raw PEM cert — no manual
// ASN.1 parsing, no crypto.subtle.importKey keyData issues.
// ---------------------------------------------------------------------------

let _cachedKeys = null;
let _cachedKeysExpiry = 0;

async function getFirebasePublicKeys() {
  const now = Date.now();
  if (_cachedKeys && now < _cachedKeysExpiry) return _cachedKeys;

  const res = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3_600_000;

  _cachedKeys = await res.json();
  _cachedKeysExpiry = now + maxAge;
  return _cachedKeys;
}

function b64UrlDecode(str) {
  // Convert base64url to base64, then decode
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded  = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

async function verifyFirebaseToken(idToken) {
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID not configured");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [headerB64, payloadB64, sigB64] = parts;

  const header  = JSON.parse(b64UrlDecode(headerB64).toString("utf8"));
  const payload = JSON.parse(b64UrlDecode(payloadB64).toString("utf8"));

  const now = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < now)
    throw new Error("Token expired");
  if (!payload.iat || now - payload.iat > 3600)
    throw new Error("Token too old");
  if (payload.aud !== projectId)
    throw new Error(`Token audience mismatch: got "${payload.aud}", expected "${projectId}"`);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`)
    throw new Error(`Token issuer mismatch: got "${payload.iss}"`);

  const keys = await getFirebasePublicKeys();
  const certPem = keys[header.kid];
  if (!certPem) throw new Error(`Unknown token key ID: ${header.kid}`);

  // Use Node's crypto.createVerify directly with the PEM cert —
  // no need to extract SPKI manually, no crypto.subtle involved.
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature    = b64UrlDecode(sigB64);

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);

  const valid = verifier.verify(certPem, signature);
  if (!valid) throw new Error("Token signature invalid");

  return { uid: payload.sub, email: payload.email || null };
}

// ---------------------------------------------------------------------------
// Upstash Redis — per-user rate limiting
//   1. Sliding window:  10 requests per 60 seconds
//   2. Daily cap:       80 requests per UTC day
// ---------------------------------------------------------------------------

async function checkRateLimit(uid) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash not configured");

  const now         = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_SEC * 1000;

  const utcDate   = new Date().toISOString().slice(0, 10);
  const minuteKey = `ratelimit:gemini:${uid}`;
  const dailyKey  = `ratelimit:daily:${uid}:${utcDate}`;

  const pipeline = [
    ["ZREMRANGEBYSCORE", minuteKey, "-inf", windowStart],
    ["ZADD", minuteKey, now, `${now}-${Math.random()}`],
    ["ZCARD", minuteKey],
    ["EXPIRE", minuteKey, RATE_LIMIT_WINDOW_SEC * 2],
    ["INCR", dailyKey],
    ["EXPIRE", dailyKey, 172800],
  ];

  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pipeline),
  });

  if (!res.ok) throw new Error("Rate limit check failed");

  const results     = await res.json();
  const minuteCount = results[2]?.result ?? results[2];
  const dailyCount  = results[4]?.result ?? results[4];

  const minuteAllowed = minuteCount <= RATE_LIMIT_REQUESTS;
  const dailyAllowed  = dailyCount  <= DAILY_LIMIT_REQUESTS;

  return {
    allowed:         minuteAllowed && dailyAllowed,
    minuteCount,
    dailyCount,
    minuteLimit:     RATE_LIMIT_REQUESTS,
    dailyLimit:      DAILY_LIMIT_REQUESTS,
    minuteRemaining: Math.max(0, RATE_LIMIT_REQUESTS  - minuteCount),
    dailyRemaining:  Math.max(0, DAILY_LIMIT_REQUESTS - dailyCount),
    limitHit: !dailyAllowed ? "daily" : !minuteAllowed ? "minute" : null,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const origin  = req.headers.origin || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : "";

  if (allowOrigin) res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (allowed.length > 0 && !allowed.includes(origin)) {
    return res.status(403).json({ error: { message: "Origin not allowed" } });
  }

  // ── Firebase token verification ──────────────────────────────────────────
  const authHeader = req.headers.authorization || "";
  const idToken    = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }

  let user;
  try {
    user = await verifyFirebaseToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: { message: `Invalid token: ${err.message}` } });
  }

  // ── Rate limiting: 10 req/min + 80 req/day ───────────────────────────────
  try {
    const rl = await checkRateLimit(user.uid);

    res.setHeader("X-RateLimit-Minute-Limit",     rl.minuteLimit);
    res.setHeader("X-RateLimit-Minute-Remaining", rl.minuteRemaining);
    res.setHeader("X-RateLimit-Daily-Limit",      rl.dailyLimit);
    res.setHeader("X-RateLimit-Daily-Remaining",  rl.dailyRemaining);

    if (!rl.allowed) {
      const msg = rl.limitHit === "daily"
        ? `Daily limit reached — you have used all ${DAILY_LIMIT_REQUESTS} AI requests for today. Resets at midnight UTC.`
        : `Too many requests — max ${RATE_LIMIT_REQUESTS} per ${RATE_LIMIT_WINDOW_SEC}s. Please wait a moment.`;

      return res.status(429).json({ error: { message: msg } });
    }
  } catch (err) {
    console.error("[rate-limit] Redis error:", err.message);
  }

  // ── Gemini proxy ─────────────────────────────────────────────────────────
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: { message: "GEMINI_API_KEY not configured" } });
  }

  const { model, body } = req.body || {};
  if (!model || !body || typeof body !== "object") {
    return res.status(400).json({ error: { message: "model and body required" } });
  }

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${key}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").send(text);
  } catch (err) {
    res.status(502).json({ error: { message: err.message || "Upstream error" } });
  }
}
