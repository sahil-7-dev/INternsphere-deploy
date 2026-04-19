// js/lib/auth-errors.js

export const AUTH_MESSAGES = {
  "auth/invalid-email":               "That email doesn't look right. Check the address and try again.",
  "auth/user-disabled":               "This account has been disabled. Contact support.",
  "auth/user-not-found":              "No account found with that email.",
  "auth/wrong-password":              "Wrong password. Try again or use Forgot password.",
  "auth/invalid-credential":          "Wrong email or password. Try again or use Forgot password.",
  "auth/invalid-login-credentials":   "Wrong email or password. Try again or use Forgot password.",
  "auth/email-already-in-use":        "That email already has an account — try logging in instead.",
  "auth/weak-password":               "Password is too weak. Use at least 6 characters.",
  "auth/missing-password":            "Please enter a password.",
  "auth/too-many-requests":           "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed":      "Network error. Check your connection and try again.",
  "auth/popup-closed-by-user":        "Sign-in popup was closed before completing.",
  "auth/popup-blocked":               "Your browser blocked the sign-in popup. Allow popups for this site.",
  "auth/cancelled-popup-request":     "Another sign-in popup is already open.",
  "auth/account-exists-with-different-credential":
                                      "An account already exists with this email — sign in with the original method.",
  "auth/operation-not-allowed":       "This sign-in method isn't enabled.",
  "auth/requires-recent-login":       "Please log in again to continue.",
};

export function friendlyAuthError(err) {
  if (!err) return "Something went wrong.";
  const code = err.code || "";
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  const m = String(err.message || "").match(/auth\/[a-z0-9-]+/i);
  if (m && AUTH_MESSAGES[m[0]]) return AUTH_MESSAGES[m[0]];
  return err.message || "Something went wrong.";
}
