// tests/rules/firestore-rules.test.js
// ---------------------------------------------------------------------
//   Fires scenarios at the Firestore emulator using the rules in
//   firestore.rules. Runs via `npm run test:rules`, which invokes
//   `firebase emulators:exec --only firestore "vitest run ..."` so the
//   emulator is guaranteed to be up + torn down around the tests.
//
//   Three auth contexts per test suite:
//     • student    — role="student"
//     • company    — role="company"
//     • admin      — role="admin"
//     • unauth     — no auth at all
//
//   Each test pins a SINGLE behaviour (e.g. "a student can't read
//   another student's application") so a failure points directly at
//   the rule that regressed.
// ---------------------------------------------------------------------

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- test environment ---------------------------------------------

let testEnv;

// Read the emulator port from firebase.json so there's only ONE source
// of truth. Bumping the port in firebase.json (e.g. because 8080 is in
// use locally) used to require a second edit here — easy to forget.
function firestoreEmulatorPort() {
  const cfg = JSON.parse(readFileSync(resolve("firebase.json"), "utf8"));
  return cfg?.emulators?.firestore?.port ?? 8080;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "internsphere-rules-test",
    firestore: {
      rules: readFileSync(resolve("firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: firestoreEmulatorPort(),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  // Reset the emulator between tests so stale docs don't leak.
  await testEnv.clearFirestore();
});

// --- helpers ------------------------------------------------------

// Seed the /users/{uid} doc for a given identity with a role. Rules'
// isAdmin() helper reads this doc, so every authed context needs it
// BEFORE we run the actual scenario.
async function seedUser(uid, role) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", uid), { role, email: `${uid}@test` });
  });
}

// Seed an internship owned by `companyUid`.
async function seedInternship(id, companyUid, extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "internships", id), {
      companyId: companyUid,
      title: "Frontend Intern",
      ...extra,
    });
  });
}

// Seed an application from `studentUid` to `companyUid`.
async function seedApplication(id, studentUid, companyUid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "applications", id), {
      studentId: studentUid,
      companyId: companyUid,
      status: "Pending",
    });
  });
}

// Authed context shortcuts.
function asStudent() { return testEnv.authenticatedContext("stu").firestore(); }
function asCompany() { return testEnv.authenticatedContext("co").firestore(); }
function asOtherCompany() { return testEnv.authenticatedContext("co2").firestore(); }
function asAdmin()   { return testEnv.authenticatedContext("adm").firestore(); }
function asUnauth()  { return testEnv.unauthenticatedContext().firestore(); }

// --- suites -------------------------------------------------------

describe("applications", () => {
  beforeEach(async () => {
    await seedUser("stu", "student");
    await seedUser("stu2", "student");
    await seedUser("co",  "company");
    await seedUser("co2", "company");
    await seedUser("adm", "admin");
    await seedApplication("appA", "stu", "co");
  });

  test("student CAN read their own application", async () => {
    await assertSucceeds(getDoc(doc(asStudent(), "applications", "appA")));
  });

  test("student CANNOT read another student's application", async () => {
    await seedApplication("appB", "stu2", "co");
    // "stu" authed tries to read "stu2"'s app.
    await assertFails(getDoc(doc(asStudent(), "applications", "appB")));
  });

  test("company CAN read applications for their internships", async () => {
    await assertSucceeds(getDoc(doc(asCompany(), "applications", "appA")));
  });

  test("company CANNOT read applications for a DIFFERENT company", async () => {
    await assertFails(getDoc(doc(asOtherCompany(), "applications", "appA")));
  });

  test("admin CAN read any application", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), "applications", "appA")));
  });

  test("unauthenticated CANNOT read applications", async () => {
    await assertFails(getDoc(doc(asUnauth(), "applications", "appA")));
  });

  test("student CAN create an application with their own studentId", async () => {
    await assertSucceeds(
      addDoc(collection(asStudent(), "applications"), {
        studentId: "stu",
        companyId: "co",
        status: "Pending",
      })
    );
  });

  test("student CANNOT create an application impersonating another student", async () => {
    await assertFails(
      addDoc(collection(asStudent(), "applications"), {
        studentId: "stu2",       // spoofed
        companyId: "co",
        status: "Pending",
      })
    );
  });

  test("admin CAN delete an application (soft-triage)", async () => {
    await assertSucceeds(deleteDoc(doc(asAdmin(), "applications", "appA")));
  });

  test("company CANNOT delete an application", async () => {
    await assertFails(deleteDoc(doc(asCompany(), "applications", "appA")));
  });
});

describe("internships", () => {
  beforeEach(async () => {
    await seedUser("stu", "student");
    await seedUser("co",  "company");
    await seedUser("co2", "company");
    await seedUser("adm", "admin");
    await seedInternship("int1", "co");
  });

  test("any authed user CAN read internships (public listing)", async () => {
    await assertSucceeds(getDoc(doc(asStudent(), "internships", "int1")));
    await assertSucceeds(getDoc(doc(asCompany(), "internships", "int1")));
    await assertSucceeds(getDoc(doc(asOtherCompany(), "internships", "int1")));
  });

  test("owning company CAN update their internship", async () => {
    await assertSucceeds(
      updateDoc(doc(asCompany(), "internships", "int1"), { title: "Updated" })
    );
  });

  test("DIFFERENT company CANNOT update an internship they don't own", async () => {
    await assertFails(
      updateDoc(doc(asOtherCompany(), "internships", "int1"), { title: "Hijacked" })
    );
  });

  test("student CANNOT create internships", async () => {
    await assertFails(
      addDoc(collection(asStudent(), "internships"), {
        companyId: "stu",   // impostor
        title: "Fake",
      })
    );
  });

  test("admin CAN delete any internship (takedown)", async () => {
    await assertSucceeds(deleteDoc(doc(asAdmin(), "internships", "int1")));
  });
});

describe("supportMessages", () => {
  beforeEach(async () => {
    await seedUser("stu", "student");
    await seedUser("co",  "company");
    await seedUser("adm", "admin");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "supportMessages", "msg1"), {
        uid: "stu", email: "stu@test", message: "help",
      });
    });
  });

  test("authed user CAN submit a support message with their own uid", async () => {
    await assertSucceeds(
      addDoc(collection(asStudent(), "supportMessages"), {
        uid: "stu", email: "stu@test", message: "new ticket",
      })
    );
  });

  test("user CANNOT submit a support message impersonating someone else", async () => {
    await assertFails(
      addDoc(collection(asStudent(), "supportMessages"), {
        uid: "stu2",               // wrong uid
        email: "stu2@test",
        message: "spoofed",
      })
    );
  });

  test("non-admin CANNOT read the support inbox", async () => {
    await assertFails(getDoc(doc(asStudent(), "supportMessages", "msg1")));
    await assertFails(getDoc(doc(asCompany(), "supportMessages", "msg1")));
  });

  test("admin CAN read + update support messages", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), "supportMessages", "msg1")));
    await assertSucceeds(
      updateDoc(doc(asAdmin(), "supportMessages", "msg1"), { resolved: true })
    );
  });
});

describe("notifications", () => {
  beforeEach(async () => {
    await seedUser("stu", "student");
    await seedUser("co",  "company");
    await seedUser("adm", "admin");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "notifications", "n1"), {
        studentId: "stu", message: "hi", senderUid: "co", senderRole: "company",
      });
    });
  });

  test("recipient CAN read their own notifications", async () => {
    await assertSucceeds(getDoc(doc(asStudent(), "notifications", "n1")));
  });

  test("non-recipient CANNOT read someone else's notifications", async () => {
    await assertFails(getDoc(doc(asCompany(), "notifications", "n1")));
  });

  test("user CAN create a notification where senderUid matches them", async () => {
    await assertSucceeds(
      addDoc(collection(asCompany(), "notifications"), {
        studentId: "stu",
        message: "legit",
        senderUid: "co",
        senderRole: "company",
      })
    );
  });

  test("user CANNOT spoof another sender's uid on a notification", async () => {
    // Student tries to write a notification with senderUid=co (company
    // impersonation — could be used for phishing).
    await assertFails(
      addDoc(collection(asStudent(), "notifications"), {
        studentId: "stu",
        message: "fake",
        senderUid: "co",
        senderRole: "company",
      })
    );
  });

  test("admin CAN create notifications with any senderUid (broadcast)", async () => {
    // Use a senderUid that does NOT match the admin's auth uid — otherwise
    // the "senderUid == request.auth.uid" branch would pass and we'd be
    // rubber-stamping the test without actually exercising the isAdmin()
    // bypass. Passing "system-broadcast" (≠ "adm") forces the rule to
    // rely on the isAdmin() allowance.
    await assertSucceeds(
      addDoc(collection(asAdmin(), "notifications"), {
        studentId: "stu",
        message: "broadcast",
        senderUid: "system-broadcast",
        senderRole: "admin",
      })
    );
  });

  test("non-admin CANNOT create notification with a foreign senderUid even if they know an admin exists", async () => {
    // Regression guard for the "senderUid must match caller OR isAdmin()"
    // rule: a company must not be able to send a broadcast by stamping
    // senderUid to someone else's uid.
    await assertFails(
      addDoc(collection(asCompany(), "notifications"), {
        studentId: "stu",
        message: "spoofed broadcast",
        senderUid: "adm",          // trying to impersonate admin
        senderRole: "admin",
      })
    );
  });
});

describe("reports (moderation queue)", () => {
  beforeEach(async () => {
    await seedUser("stu", "student");
    await seedUser("co",  "company");
    await seedUser("adm", "admin");
  });

  test("user CAN create a report with their own reporterUid", async () => {
    await assertSucceeds(
      addDoc(collection(asStudent(), "reports"), {
        reporterUid: "stu",
        targetType: "internship",
        targetId: "int1",
        reason: "spam",
      })
    );
  });

  test("user CANNOT create a report impersonating another reporter", async () => {
    await assertFails(
      addDoc(collection(asStudent(), "reports"), {
        reporterUid: "co",     // spoofed
        targetType: "internship",
        targetId: "int1",
        reason: "spam",
      })
    );
  });

  test("non-admin CANNOT read the moderation queue", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "reports", "r1"), {
        reporterUid: "stu", targetType: "internship", targetId: "x",
      });
    });
    await assertFails(getDoc(doc(asStudent(), "reports", "r1")));
  });

  test("admin CAN read + update reports; NOBODY can delete", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "reports", "r1"), {
        reporterUid: "stu", targetType: "internship", targetId: "x",
      });
    });
    await assertSucceeds(getDoc(doc(asAdmin(), "reports", "r1")));
    await assertSucceeds(
      updateDoc(doc(asAdmin(), "reports", "r1"), { resolution: "dismissed" })
    );
    // Even admin can't delete — audit-log preservation.
    await assertFails(deleteDoc(doc(asAdmin(), "reports", "r1")));
  });
});

describe("adminActions (audit log)", () => {
  beforeEach(async () => {
    await seedUser("stu", "student");
    await seedUser("adm", "admin");
  });

  test("admin CAN write audit log entries", async () => {
    await assertSucceeds(
      addDoc(collection(asAdmin(), "adminActions"), {
        type: "approve-company", actor: "adm", at: new Date(),
      })
    );
  });

  test("non-admin CANNOT write or read the audit log", async () => {
    await assertFails(
      addDoc(collection(asStudent(), "adminActions"), {
        type: "suspend", actor: "stu",
      })
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "adminActions", "a1"), { type: "x" });
    });
    await assertFails(getDoc(doc(asStudent(), "adminActions", "a1")));
  });

  test("NOBODY — not even admin — can edit or delete past audit entries", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "adminActions", "a1"), { type: "x" });
    });
    await assertFails(
      updateDoc(doc(asAdmin(), "adminActions", "a1"), { type: "edited" })
    );
    await assertFails(deleteDoc(doc(asAdmin(), "adminActions", "a1")));
  });
});
