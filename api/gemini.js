// Vercel serverless proxy for Google Gemini.
// Keeps GEMINI_API_KEY on the server. Set it in the Vercel project's
// Environment Variables (Settings → Environment Variables).
//
// Optional env:
//   ALLOWED_ORIGINS — comma-separated list of origins allowed to call
//     this endpoint (e.g. "https://your-site.vercel.app,http://localhost:3000").
//     If unset, any origin is allowed — fine for first deploys, tighten later.

export const config = {
  maxDuration: 30,
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : "";

  if (allowOrigin) res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (allowed.length > 0 && !allowed.includes(origin)) {
    return res.status(403).json({ error: { message: "Origin not allowed" } });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res
      .status(500)
      .json({ error: { message: "GEMINI_API_KEY not configured" } });
  }

  const { model, body } = req.body || {};
  if (!model || !body || typeof body !== "object") {
    return res
      .status(400)
      .json({ error: { message: "model and body required" } });
  }

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${key}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res
      .status(upstream.status)
      .setHeader("Content-Type", "application/json")
      .send(text);
  } catch (err) {
    res.status(502).json({ error: { message: err.message || "Upstream error" } });
  }
}
