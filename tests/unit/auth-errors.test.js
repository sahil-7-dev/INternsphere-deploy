// tests/unit/auth-errors.test.js
//   Verifies the friendlyAuthError helper translates Firebase Auth
//   error codes into human-readable text and never silently swallows
//   unknown errors.
import { describe, test, expect } from "vitest";
import { friendlyAuthError, AUTH_MESSAGES } from "../../js/lib/auth-errors.js";

describe("friendlyAuthError()", () => {
  test("returns generic fallback for null/undefined", () => {
    expect(friendlyAuthError(null)).toBe("Something went wrong.");
    expect(friendlyAuthError(undefined)).toBe("Something went wrong.");
  });

  test("returns mapped message for known err.code", () => {
    expect(friendlyAuthError({ code: "auth/wrong-password" }))
      .toBe(AUTH_MESSAGES["auth/wrong-password"]);
    expect(friendlyAuthError({ code: "auth/email-already-in-use" }))
      .toBe(AUTH_MESSAGES["auth/email-already-in-use"]);
  });

  test("digs the code out of err.message when err.code is missing", () => {
    // Some Firebase SDK builds ship errors like
    //   `Error: Firebase: Error (auth/user-not-found).`
    // with no `.code` property — the helper has to fish it out.
    const err = { message: "Firebase: Error (auth/user-not-found)." };
    expect(friendlyAuthError(err)).toBe(AUTH_MESSAGES["auth/user-not-found"]);
  });

  test("falls back to err.message for unknown codes", () => {
    const err = { code: "auth/unheard-of", message: "Something specific went wrong." };
    expect(friendlyAuthError(err)).toBe("Something specific went wrong.");
  });

  test("falls back to generic message when err has neither code nor message", () => {
    expect(friendlyAuthError({})).toBe("Something went wrong.");
  });

  test("AUTH_MESSAGES covers every code the login flow throws", () => {
    // Pinning the set of codes — if anyone removes one, this fails so
    // the change has to be deliberate.
    const required = [
      "auth/invalid-email", "auth/user-disabled", "auth/user-not-found",
      "auth/wrong-password", "auth/invalid-credential",
      "auth/email-already-in-use", "auth/weak-password",
      "auth/missing-password", "auth/too-many-requests",
      "auth/network-request-failed", "auth/popup-closed-by-user",
      "auth/popup-blocked",
    ];
    for (const code of required) {
      expect(AUTH_MESSAGES[code]).toBeTruthy();
    }
  });

  test("messages don't expose the raw 'Firebase: Error (...)' chrome", () => {
    for (const msg of Object.values(AUTH_MESSAGES)) {
      expect(msg).not.toMatch(/Firebase:/);
      expect(msg).not.toMatch(/auth\//);
    }
  });
});
