// js/gemini.js
//
// All Gemini traffic goes through /api/gemini — a Vercel serverless
// proxy that holds the API key server-side. The key is no longer in
// client JS. To point at a different proxy (e.g. local dev), set
// window.GEMINI_PROXY_URL before this module loads.

const DEFAULT_MODEL = "gemini-2.5-flash";

const PROXY_URL =
  (typeof window !== "undefined" && window.GEMINI_PROXY_URL) || "/api/gemini";

// generateContent
export async function askGemini(opts = {}) {
  const {
    prompt,
    system,
    parts = [],
    history = [],
    temperature = 0.7,
    maxTokens = 1024,
    model = DEFAULT_MODEL,
    responseMimeType,
    responseSchema,
  } = opts;

  if (!prompt && !parts.length) {
    throw new Error("askGemini: prompt or parts required");
  }

  const userParts = [];
  if (prompt) userParts.push({ text: prompt });
  for (const p of parts) userParts.push(p);

  const body = {
    contents: [...history, { role: "user", parts: userParts }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      // Disable thinking mode — gemini-2.5-flash now thinks by default which
      // adds latency and can break JSON schema structured output responses.
      thinkingConfig: { thinkingBudget: 0 },
      ...(responseMimeType ? { responseMimeType } : {}),
      ...(responseSchema ? { responseSchema } : {}),
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  // Attach Firebase ID token for server-side auth verification + per-user rate limiting
  let authHeader = {};
  try {
    const { auth } = await import("/firebase/firebase.js");
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  } catch {
    // Guest mode or auth unavailable — proceed without token
  }

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ model, body }),
  });

 if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        detail = j?.error?.message || JSON.stringify(j);
      } catch {
        detail = text;
      }
    } catch {
      detail = `HTTP ${res.status}`;
    }
    const err = new Error(`Gemini ${res.status}: ${detail}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  const data = await res.json();

  const cand = data?.candidates?.[0];
  if (!cand) return "";
  if (cand.finishReason === "SAFETY") {
    throw new Error("Gemini blocked the response due to safety filters.");
  }
  const partsOut = cand.content?.parts || [];
  return partsOut.map((p) => p.text || "").join("").trim();
}

// json response
export async function askGeminiJson(opts = {}) {
  const { schema, ...rest } = opts;
  if (!schema) throw new Error("askGeminiJson: schema required");

  const raw = await askGemini({
    ...rest,
    temperature: rest.temperature ?? 0.4,
    responseMimeType: "application/json",
    responseSchema: schema,
    maxTokens: rest.maxTokens ?? 4096,
  });

  const parsed = tryParseJsonLoose(raw);
  if (parsed !== undefined) return parsed;

  const partialReply = extractPartialReply(raw);
  const err = new Error("AI_TRUNCATED");
  err.truncated = true;
  err.parseError = true;
  err.partialReply = partialReply;
  console.warn("[gemini] JSON parse failed. Raw (truncated):", raw.slice(0, 600));
  throw err;
}

function tryParseJsonLoose(raw) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const attempts = [];

  attempts.push(raw);

  attempts.push(
    raw.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "").trim(),
  );

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(raw.slice(firstBrace, lastBrace + 1));
  }

  if (firstBrace !== -1) {
    const candidate = raw.slice(firstBrace);
    attempts.push(autoCloseJson(candidate));
  }

  for (const s of attempts) {
    if (!s) continue;
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object") return obj;
    } catch {
    }
  }
  return undefined;
}

function autoCloseJson(s) {
  let inString = false;
  let escape = false;
  let depth = 0;
  let end = s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  let result = s.slice(0, end);
  if (inString) result += '"';
  while (depth > 0) { result += "}"; depth--; }
  return result;
}

function extractPartialReply(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  try {
    return JSON.parse('"' + m[1] + '"');
  } catch {
    return m[1];
  }
}

// pdf helper
export async function analyzePdf(dataUrlOrBase64, prompt, opts = {}) {
  const base64 = (dataUrlOrBase64 || "").includes(",")
    ? dataUrlOrBase64.split(",", 2)[1]
    : dataUrlOrBase64;
  if (!base64) throw new Error("analyzePdf: PDF data missing");

  const pdfPart = {
    inlineData: { mimeType: "application/pdf", data: base64 },
  };

  const call = {
    ...opts,
    prompt,
    parts: [pdfPart, ...(opts.parts || [])],
  };

  return opts.schema ? askGeminiJson(call) : askGemini(call);
}

// chat
export function createChat({
  system,
  model,
  temperature,
  maxTokens,
  history: initialHistory = [],
  contextWindow = 30,
  onUpdate,
} = {}) {
  const history = Array.isArray(initialHistory) ? initialHistory.slice() : [];

  return {
    async send(message, { extraParts = [] } = {}) {
      const tail = history.slice(-contextWindow * 2);

      const reply = await askGemini({
        prompt: message,
        parts: extraParts,
        history: tail,
        system,
        model,
        temperature,
        maxTokens,
      });

      history.push({ role: "user",  parts: [{ text: message }] });
      history.push({ role: "model", parts: [{ text: reply }] });

      if (typeof onUpdate === "function") {
        try { onUpdate(history.slice()); } catch {}
      }
      return reply;
    },
    clear() {
      history.length = 0;
      if (typeof onUpdate === "function") {
        try { onUpdate([]); } catch {}
      }
    },
    get history() {
      return history.slice();
    },
  };
}

// error formatter
export function friendlyGeminiError(e) {
  if (!e) return "Something went wrong. Please try again.";

  if (e.truncated || e.parseError) {
    return "That response got cut off. Try a shorter request, or ask TARS to make the change in smaller steps.";
  }

  const s = e.status;
  if (s === 400) return "TARS couldn't process that. Try rephrasing.";
  if (s === 401 || s === 403)
    return "AI access is temporarily unavailable. Please try again later.";
  if (s === 413) return "That file is too large for the AI proxy. Try a PDF under 3 MB.";
  if (s === 429) return "Too many requests — give it a minute and try again.";
  if (s >= 500) return "AI service is having issues. Try again shortly.";

  if (e.message && /safety/i.test(e.message)) {
    return "That request was blocked by the content safety filter. Try rephrasing.";
  }

  if (e.message) console.warn("[gemini] error:", e.message);
  return "Something went wrong. Please try again.";
}
