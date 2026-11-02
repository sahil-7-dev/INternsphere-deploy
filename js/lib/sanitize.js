// js/lib/sanitize.js

const DANGEROUS_TAGS = new Set([
  "SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META",
  "STYLE", "BASE", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION",
  // DOMParser documents have scripting disabled, so <noscript> content is
  // parsed as markup here but as raw text once re-inserted into the live
  // page — the classic mutation-XSS vector. Frames/applets are never needed.
  "NOSCRIPT", "FRAME", "FRAMESET", "APPLET",
  // SVG animation elements can rewrite href to a javascript: URL at runtime.
  "ANIMATE", "SET", "ANIMATEMOTION", "ANIMATETRANSFORM",
]);

const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction"]);

export function sanitizeSubmissionHtml(dirty) {
  const raw = String(dirty || "");
  if (!raw.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!doctype html><body>${raw}</body>`, "text/html");

  doc.body.querySelectorAll("*").forEach((el) => {
    // SVG/MathML elements keep their original case in tagName.
    if (DANGEROUS_TAGS.has(String(el.tagName).toUpperCase())) { el.remove(); return; }
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      // Browsers ignore ASCII whitespace/control chars inside a URL scheme,
      // so "java\tscript:" must be treated like "javascript:".
      const value = String(attr.value || "")
        .replace(/[\x00-\x20]+/g, "")
        .toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if (URL_ATTRS.has(name)
          && (value.startsWith("javascript:") || value.startsWith("vbscript:")
              || (value.startsWith("data:") && !value.startsWith("data:image/")))) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}
