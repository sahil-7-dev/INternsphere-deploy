// tests/unit/sanitize.test.js
//   Verifies sanitizeSubmissionHtml strips every common stored-XSS
//   payload while preserving formatting tags a contentEditable editor
//   legitimately produces.
import { describe, test, expect } from "vitest";
import { sanitizeSubmissionHtml } from "../../js/lib/sanitize.js";

describe("sanitizeSubmissionHtml() — XSS payloads", () => {
  test("strips <script>", () => {
    const out = sanitizeSubmissionHtml("hi <script>alert(1)</script> bye");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).toMatch(/hi/);
    expect(out).toMatch(/bye/);
  });

  test("strips <iframe>", () => {
    const out = sanitizeSubmissionHtml('<iframe src="evil.com"></iframe>');
    expect(out).not.toMatch(/<iframe/i);
  });

  test("strips <object>, <embed>, <link>, <meta>, <style>, <form>", () => {
    const dirty = `
      <object data="evil.swf"></object>
      <embed src="evil.swf">
      <link rel="stylesheet" href="evil.css">
      <meta http-equiv="refresh" content="0;url=evil.com">
      <style>body{display:none}</style>
      <form action="evil.com"><input name="x"></form>
    `;
    const out = sanitizeSubmissionHtml(dirty);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
    expect(out).not.toMatch(/<link/i);
    expect(out).not.toMatch(/<meta/i);
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<input/i);
  });

  test("strips inline event handlers (onerror, onclick, etc.)", () => {
    const out = sanitizeSubmissionHtml(
      '<img src="x" onerror="alert(1)" onclick="alert(2)" onmouseover="alert(3)">'
    );
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toMatch(/<img/i);   // tag itself should survive
  });

  test("strips javascript: URLs in href and src", () => {
    const out = sanitizeSubmissionHtml(
      '<a href="javascript:alert(1)">x</a><img src="javascript:alert(2)">'
    );
    expect(out).not.toMatch(/javascript:/i);
    // The tags themselves can stay; only the unsafe attr value is removed.
    expect(out).toMatch(/<a/i);
  });

  test("preserves common formatting tags", () => {
    const dirty =
      "<p><strong>bold</strong> and <em>italic</em> and <u>underline</u></p>" +
      "<ul><li>one</li><li>two</li></ul>" +
      '<a href="https://example.com">a link</a>' +
      "<br><span>span</span>";
    const out = sanitizeSubmissionHtml(dirty);
    expect(out).toMatch(/<strong/i);
    expect(out).toMatch(/<em/i);
    expect(out).toMatch(/<u/i);
    expect(out).toMatch(/<ul/i);
    expect(out).toMatch(/<li/i);
    expect(out).toMatch(/<a/i);
    expect(out).toMatch(/href="https:\/\/example.com"/);
    expect(out).toMatch(/<br/i);
    expect(out).toMatch(/<span/i);
  });

  test("returns empty string for nullish / blank input", () => {
    expect(sanitizeSubmissionHtml(null)).toBe("");
    expect(sanitizeSubmissionHtml(undefined)).toBe("");
    expect(sanitizeSubmissionHtml("")).toBe("");
    expect(sanitizeSubmissionHtml("   ")).toBe("");
  });

  test("nested script inside a safe tag is still removed", () => {
    const out = sanitizeSubmissionHtml(
      "<div><strong>safe</strong><script>nope</script></div>"
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/nope/);
    expect(out).toMatch(/safe/);
  });

  test("xlink:href javascript: URI is stripped", () => {
    // SVG-style attribute that some sanitisers miss.
    const out = sanitizeSubmissionHtml('<a xlink:href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });
});
