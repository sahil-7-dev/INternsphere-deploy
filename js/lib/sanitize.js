// js/lib/sanitize.js

const DANGEROUS_TAGS = new Set([
  "SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META",
  "STYLE", "BASE", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION",
]);

export function sanitizeSubmissionHtml(dirty) {
  const raw = String(dirty || "");
  if (!raw.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!doctype html><body>${raw}</body>`, "text/html");

  doc.body.querySelectorAll("*").forEach((el) => {
    if (DANGEROUS_TAGS.has(el.tagName)) { el.remove(); return; }
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name === "src" || name === "xlink:href")
          && value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}
