# InternSphere — test suite

Two independent suites:

| Suite | What it covers | Env |
|---|---|---|
| **Unit** (`tests/unit/`) | Pure helpers: HTML escaping, auth-error translation, stored-XSS sanitiser, skill-match scoring, role routing. Runs under jsdom — no Firebase, no browser. | Node + Vitest |
| **Rules** (`tests/rules/`) | `firestore.rules` — every critical read/write path for students, companies, admins, and unauthenticated visitors. Verifies users can't read other users' data, can't spoof sender fields, etc. | Node + Firebase Emulator |

## First-time setup

You need Node 18+ and (for the rules suite only) Java 11+ and `firebase-tools`.

```bash
# From the project root
npm install                             # installs vitest, jsdom, @firebase/rules-unit-testing, firebase SDK

# Only needed for the rules suite:
npm install -g firebase-tools           # one-time global install of Firebase CLI
```

## Run the tests

### Unit only (fast, no emulator)

```bash
npm run test:unit
```

Runs every file in `tests/unit/**/*.test.js`. Expect ~35 tests, < 2 seconds.

Watch mode while hacking a helper:

```bash
npm run test:unit:watch
```

### Firestore rules (needs the emulator)

```bash
npm run test:rules
```

That command wraps the tests in `firebase emulators:exec` so the emulator starts + stops automatically. Expect ~30 tests, ~10 seconds the first time (emulator boot).

If the emulator port (8080) is already in use, edit `firebase.json` and bump it — the rules test reads `emulators.firestore.port` from that file, so there's nothing else to change.

### Both suites in one shot

```bash
npm test
```

## What each unit file pins down

| File | Module under test | Scenario count |
|---|---|---|
| `escape.test.js` | `js/lib/escape.js` — `esc`, `escAttr` | 8 |
| `auth-errors.test.js` | `js/lib/auth-errors.js` — `friendlyAuthError`, `AUTH_MESSAGES` | 6 |
| `sanitize.test.js` | `js/lib/sanitize.js` — `sanitizeSubmissionHtml` (stored-XSS guard for the company review modal) | 9 |
| `match.test.js` | `js/lib/match.js` — `rebuildUserSkillSet`, `computeMatch` | 16 |
| `guard-rolehome.test.js` | role → home-URL mapping | 5 |

## What the rules suite pins down

Each describe block targets ONE collection; each test targets ONE rule branch:

- **applications** — student can only read their own; company can only read apps targeting them; admin can read all; student can't spoof `studentId` on create; admin alone can delete.
- **internships** — public read (authed); only owning company can update; only admin can take down.
- **supportMessages** — creator must be `request.auth.uid`; only admin can read + resolve.
- **notifications** — recipient can read theirs; `senderUid` must match caller unless admin (so companies can't be impersonated in broadcasts); admin can batch-broadcast with a foreign `senderUid` (broadcast test uses a uid ≠ admin's own so the `isAdmin()` bypass is actually exercised, not the match-uid branch); non-admin spoofing admin uid is blocked.
- **reports** — reporter uid must match caller; non-admin can't read the queue; nobody can delete entries (audit preservation).
- **adminActions** — admin-only read + write; NOBODY can update or delete once written (tamper-evident log).

## If a unit test fails

- Run it in watch mode (`npm run test:unit:watch`) — it'll re-run on save.
- Unit tests target pure functions in `js/lib/*`. Changes to those modules are the most likely source of a regression.

## If a rules test fails

- The error message from `@firebase/rules-unit-testing` names the rule that denied (or should have denied) the operation.
- Copy the current `firestore.rules` into the Firebase console → Firestore → Rules → Rules Playground and replay the same scenario manually to narrow down which line changed behaviour.
- Common gotchas:
  - `beforeEach` seeds data with `withSecurityRulesDisabled` — forgetting this means the rules block the *seeding*, not just the test call.
  - Firestore rules treat create + update differently (`request.resource` vs. `resource`). A rule that works on update can miss a spoof on create (this is how I caught the notification-sender-spoofing gap).
