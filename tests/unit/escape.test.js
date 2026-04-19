// tests/unit/escape.test.js
//   Unit tests for js/lib/escape.js — verifies HTML/attribute escaping
//   against a battery of common XSS-injection payloads.
import { describe, test, expect } from "vitest";
import { esc, escAttr } from "../../js/lib/escape.js";

describe("esc()", () => {
  test("returns empty string for nullish input", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc("")).toBe("");
  });

  test("passes plain text through unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
    expect(esc("Acme Inc — Frontend Intern")).toBe("Acme Inc — Frontend Intern");
  });

  test("escapes <, >, &, and double-quotes", () => {
    expect(esc("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(esc('<img src="x">')).toBe("&lt;img src=&quot;x&quot;&gt;");
    expect(esc("a & b")).toBe("a &amp; b");
  });

  test("does NOT escape single quotes (esc is for body context)", () => {
    expect(esc("it's fine")).toBe("it's fine");
  });

  test("coerces non-string inputs", () => {
    expect(esc(42)).toBe("42");
    expect(esc(true)).toBe("true");
  });

  test("escape order matters — & must be escaped first", () => {
    // If `<` were replaced before `&`, then "<" → "&lt;" and the next
    // pass would hit the `&` and produce "&amp;lt;" — double-escape.
    // This test ensures the implementation avoids that.
    expect(esc("<&>")).toBe("&lt;&amp;&gt;");
  });
});

describe("escAttr()", () => {
  test("escapes single quotes (extra over esc)", () => {
    expect(escAttr("it's")).toBe("it&#39;s");
  });

  test("escapes the same chars as esc plus single quote", () => {
    expect(escAttr(`a"b'c<d>e&f`)).toBe("a&quot;b&#39;c&lt;d&gt;e&amp;f");
  });

  test("returns empty string for nullish input", () => {
    expect(escAttr(null)).toBe("");
    expect(escAttr(undefined)).toBe("");
  });

  test("safe for breaking out of attribute context", () => {
    // Defends against `<div data-x="${escAttr(s)}">` where s contains a quote.
    const payload = `" onclick="alert(1)`;
    const result = escAttr(payload);
    expect(result).not.toContain('"');
    expect(result).toBe("&quot; onclick=&quot;alert(1)");
  });
});
