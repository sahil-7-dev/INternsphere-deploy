// tests/unit/guard-rolehome.test.js
//   Exercises the role → home-URL mapping — the shared source of truth
//   for both login.js's post-login redirect AND guard.js's requireRole
//   "route the unauthorized user to their own home" logic.
//
//   We import directly from js/lib/role-home.js (a pure, Firebase-free
//   module) so the test can never drift from production. Importing the
//   full js/guard.js would pull in Firebase at module-load time.

import { describe, test, expect } from "vitest";
import { roleHome } from "../../js/lib/role-home.js";

describe("roleHome()", () => {
  test("admin → admin.html", () => {
    expect(roleHome("admin")).toBe("admin.html");
  });

  test("company → dashboard-company.html", () => {
    expect(roleHome("company")).toBe("dashboard-company.html");
  });

  test("student → dashboard.html", () => {
    expect(roleHome("student")).toBe("dashboard.html");
  });

  test("dev (special developer role) → dashboard.html", () => {
    // `dev` should share the student dashboard because that's where
    // the developer-mode greeting + tooling lives.
    expect(roleHome("dev")).toBe("dashboard.html");
  });

  test("unknown / missing role falls back to student dashboard", () => {
    // Safer default — never dump a signed-in user back to login when
    // their role field is missing or corrupted.
    expect(roleHome("")).toBe("dashboard.html");
    expect(roleHome(undefined)).toBe("dashboard.html");
    expect(roleHome(null)).toBe("dashboard.html");
    expect(roleHome("some-unexpected-role")).toBe("dashboard.html");
  });
});
