// =====================================================================
// functions/index.js — InternSphere Cloud Functions
//
// Deploy:
//   1. From repo root: `npm install -g firebase-tools` (once).
//   2. `firebase login`.
//   3. `firebase init functions` — pick the existing project, JS, don't
//      overwrite package.json or index.js when prompted.
//   4. `cd functions && npm install`.
//   5. `firebase deploy --only functions`.
//
// Until the function is deployed, the admin "Delete user" button will
// still delete the Firestore docs; it just won't delete the Auth record
// (the admin UI warns about this in the confirm dialog). Once deployed,
// the client calls this function automatically and the Auth record is
// removed too — fully-deleted user in one click.
// =====================================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * deleteAuthUser — removes a user from Firebase Auth by uid.
 * Callable from the client via `httpsCallable`. Caller MUST be an
 * admin (verified by reading their own users/{uid}.role). Rejects
 * any other caller with HTTP 403 so the function isn't a back door.
 */
exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  // --- Authn: caller must be signed in.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Sign in required.",
    );
  }

  // --- Authz: caller must be an admin. Re-check server-side — never
  //     trust the client to tell us its own role.
  const callerSnap = await admin
    .firestore()
    .collection("users")
    .doc(context.auth.uid)
    .get();
  if (!callerSnap.exists || callerSnap.data().role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can delete users.",
    );
  }

  const targetUid = String(data?.uid || "").trim();
  if (!targetUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing target uid.",
    );
  }

  // Prevent an admin from accidentally nuking themselves via a crafted
  // client call. The UI already blocks this but defense-in-depth.
  if (targetUid === context.auth.uid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Admins cannot delete their own account from the admin panel.",
    );
  }

  // --- Delete the Auth record. This throws `auth/user-not-found` if
  //     the record is already gone (e.g. the Firestore docs were
  //     cleaned up but the Auth account was manually deleted first).
  //     We swallow that specific error as a success since the net
  //     outcome (user has no Auth account) is what we wanted.
  try {
    await admin.auth().deleteUser(targetUid);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return { ok: true, note: "auth-record-already-missing" };
    }
    throw new functions.https.HttpsError("internal", err.message);
  }

  return { ok: true };
});
