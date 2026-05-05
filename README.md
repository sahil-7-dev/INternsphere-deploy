<div align="center">

<img src="https://img.shields.io/badge/status-live-brightgreen?style=flat-square" />
<img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
<img src="https://img.shields.io/badge/firebase-v12.10.0-orange?style=flat-square&logo=firebase&logoColor=white" />
<img src="https://img.shields.io/badge/deployed-vercel-black?style=flat-square&logo=vercel" />
<img src="https://img.shields.io/badge/AI-Gemini%202.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white" />

# InternSphere

**Full-lifecycle internship platform — discovery, application, task execution, and certification — powered by Google Gemini 2.5 Flash.**

[Live](https://internsphere-pi.vercel.app) · [Report an Issue](https://github.com/your-username/internsphere/issues)

</div>

---

## Overview

Most internship platforms stop at the listing. InternSphere covers the entire lifecycle: AI-scored discovery, resume analysis before you apply, real-time application tracking via Firestore listeners, a structured Virtual Workroom for post-acceptance task execution, and verifiable completion certificates — all in one system across three role-aware interfaces (Student, Company, Admin).

The stack is intentionally minimal: no build step, no framework, no managed backend. A static multi-page app on Vercel backed by Firebase Auth, Cloud Firestore, and Cloud Storage, with a single serverless function proxying all Gemini API calls so the key never reaches the client.

---

## Screenshots

![Student Dashboard](./screenshots/Student%20Dashboard.png)
![Resume Analyzer](./screenshots/Tars%20Resume%20Analyzer.png)
![Virtual Workroom](./screenshots/Virtual%20Workroom.png)
![Internship Listings](./screenshots/Internship's%20Listing.png)

---

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────────┐     Gemini API
│   Browser   │ ─────────────► │  Vercel (static MPA) │ ──────────────►  Google Gemini 2.5 Flash
│  (no build) │ ◄───────────── │  + /api/gemini (fn)  │
└─────────────┘                └──────────────────────┘
       │                                  │
       │  onSnapshot listeners            │  Admin SDK / REST
       ▼                                  ▼
┌─────────────────────────────────────────────────────┐
│                  Firebase                           │
│   Auth   │   Cloud Firestore   │   Cloud Storage    │
└─────────────────────────────────────────────────────┘
```

All AI requests pass through `/api/gemini`. The Gemini API key is a Vercel environment variable — it is never present in the client bundle. Per-user rate limits (10 req/min, 80 req/day) are enforced at the proxy layer via Upstash Redis.

---

## Features

### Student

| | |
|---|---|
| **Resume Analyzer** | ATS score (0–100), skill-gap detection, section-by-section breakdown, before/after rewrite pairs, score trend sparkline across re-uploads. Results persisted to Firestore; latest cached in `sessionStorage` for instant re-renders. |
| **Skill-Match Scoring** | 0–100 fit score per listing, computed from the union of manually entered skills and AI-detected skills. Returns `null` (not `0`) when no skill data exists — intentional, to avoid misleading scores on listing cards. |
| **Apply with Live CV Feedback** | CV-vs-role analysis runs before submission. Retry logic handles malformed Gemini responses; shape validation catches missing `fitScore` or `suggestions` keys. |
| **Application Tracker** | Real-time status via `onSnapshot`. No polling. |
| **Virtual Workroom** | `contenteditable` rich-text editor, 2s auto-save, PDF upload to Cloud Storage, Focus Mode, Undo-AI snapshot stack. |
| **TARS — 4 surfaces, 30 actions** | Role Assistant (4 chips, listing detail) · Career Guidance (11 actions, dashboard) · Workroom Assistant (7 drafting actions) · Hiring Intelligence (8 recruiter actions). Shared system-prompt composer across all surfaces. |
| **AI Quick Search** | `Ctrl+K` modal. Filters across title, company, location, and skills in real time against up to 20 listings. |
| **Recommended For You** | Top-5 highest skill-match open listings, recomputed on every profile or resume change. Hidden when no skill data is present. |

### Company

| | |
|---|---|
| **Listing Management** | Create, pause, close. Listings only go live after admin verification clears. |
| **Applicant Pipeline** | Shortlist → Approve → Reject with structured feedback per application. |
| **TARS Hiring Intelligence** | Pipeline snapshot, pending-review alerts, AI applicant ranking with fit score / verdict / strengths / gaps, skill coverage by role, interview prioritisation, free-text prompt. |
| **Workroom** | Assign tasks with `requirePdf` and `isFinal` flags. Score and annotate submissions. `isFinal` completion unlocks certificate issuance. |

### Admin

| | |
|---|---|
| **Company Verification Queue** | Approve enables listing creation. Reject triggers `deleteAuthUser` Cloud Function + Firestore document removal. |
| **User Management** | `disabled: true` auto-signs the user out on next page load via the auth guard. |
| **Broadcast** | Fan-out notifications to all users or a specific role via the `senderUid` admin bypass in Firestore rules. |
| **Audit Log** | `adminActions` is write-once. `update` and `delete` are denied at the rules level — tamper-evident by design. |

---

## Data Model

Eleven top-level Firestore collections. Document IDs match Firebase Auth UIDs where applicable to avoid join overhead.

```
users/             uid, email, name, role, disabled, createdAt
students/          uid, skills[], savedInternships[], resumeAnalysis, resumeAnalysisHistory[]
companies/         uid, companyName, verified
internships/       companyId, title, description, skills[], status (open|paused|closed)
applications/      studentId, companyId, internshipId, status, feedback{}, certificateIssued
tasks/             internshipId, companyId, order, requirePdf, isFinal
taskSubmissions/   studentId, taskId, content (sanitised HTML), pdfUrl, feedback{}
notifications/     studentId, senderUid, type, status (unread|read)
supportMessages/   uid, message, status (open|resolved)
reports/           reporterUid, targetType, targetId, status  — delete denied, audit preserved
adminActions/      adminUid, actionType, targetUid, note      — update/delete denied
```

Application state machine: `Pending → Shortlisted → Approved → WorkroomActive → CertificateIssued`, with `Rejected` and `Withdrawn` branches off `Pending` and `Shortlisted`.

---

## Security

- **Gemini API key** — server-side only, inside the `/api/gemini` Vercel function. Never shipped to the browser.
- **Firestore Security Rules** — role separation enforced at the database layer, not the UI. `senderUid` spoofing on notifications is explicitly blocked; the admin broadcast bypass requires a verified `role == "admin"` document lookup, not just a flag check.
- **XSS** — `esc()` for reflected content, `sanitizeSubmissionHtml()` for Workroom submissions before any company-side render. Both are unit-tested independently.
- **Audit integrity** — `adminActions` and `reports` deny `delete` unconditionally in rules.

---

## Testing

112 scenarios across three streams, all green on the production build.

| Stream | Cases | Pass rate |
|---|---|---|
| Vitest unit — `js/lib/` helpers | 45 | 100% |
| Firebase Emulator — `firestore.rules` | 32 | 100% |
| Manual — Student flow | 15 | 100% |
| Manual — Company flow | 12 | 100% |
| Manual — Admin flow | 8 | 100% |

10 first-run failures were surfaced and resolved during Sprint 6. Notable ones: a `senderUid` spoofing vulnerability introduced when the admin broadcast bypass was added (the rule over-permitted any authenticated user); Gemini responses wrapped in markdown code fences breaking `JSON.parse`; `computeMatch` treating `"JavaScript"` and `"javascript"` as distinct strings, causing 0% scores for valid matches.

---

## Local Development

**Prerequisites:** Node.js, Firebase CLI (`npm i -g firebase-tools`), a Firebase project with Auth / Firestore / Storage enabled.

```bash
git clone https://github.com/your-username/internsphere.git
cd internsphere

# Serve locally — no build step
npx serve .

# Unit tests
npx vitest

# Rules tests (requires emulator)
firebase emulators:start --only firestore
npx vitest --config vitest.rules.config.js
```

**Environment variables** (Vercel):

```
GEMINI_API_KEY              # Required — never expose client-side
FIREBASE_PROJECT_ID         # Required for Admin SDK in the proxy
FIREBASE_CLIENT_EMAIL       # Required
FIREBASE_PRIVATE_KEY        # Required
UPSTASH_REDIS_REST_URL      # Optional — enables per-user rate limiting
UPSTASH_REDIS_REST_TOKEN    # Optional
```

Deploy:

```bash
firebase deploy --only firestore:rules
vercel --prod
```

---

## Project Structure

```
internsphere/
├── api/
│   └── gemini.js           # Serverless proxy — key isolation, rate limiting
├── firebase/
│   └── firebase.js         # SDK init
├── js/
│   ├── auth.js             # Auth flows + role-based routing
│   ├── ai-search.js        # Ctrl+K quick search modal
│   └── lib/
│       ├── match.js        # Skill-match scoring + rebuildUserSkillSet
│       ├── sanitize.js     # Workroom HTML sanitisation
│       ├── escape.js       # XSS escape helpers
│       └── auth-errors.js  # Firebase error code → human-readable message
├── css/                    # Shared dark-mode design system
├── *.html                  # Role-aware pages (MPA, no router)
├── firestore.rules         # Security rules (tested against emulator)
└── tests/                  # Vitest unit + rules test suites
```

---

## Roadmap

- [ ] TARS Companion Mode — wake-word activation, Gemini function calling, intent classifier (edit | explain | navigate)
- [ ] AI Interview Prep Coach — TARS mock interview mode with role-specific rubric scoring
- [ ] GitHub + LinkedIn OAuth — one-click profile import via provider APIs
- [ ] Real-time in-app messaging — `messages` sub-collection per application, `onSnapshot` delivery
- [ ] Email + push notifications — Firebase Extensions (Trigger Email) + FCM
- [ ] E2E test suite — Playwright against Firebase Emulator, CI on GitHub Actions
- [ ] `aiInteractions` audit collection — write-once log of all Gemini outputs for admin review
- [ ] Native mobile app — React Native / Flutter, same Firestore backend

---

## License

[MIT](./LICENSE)
