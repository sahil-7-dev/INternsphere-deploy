# Dev-only Ghost Mode — notes

Private cinematic + flyby effects gated to a single Firebase account.
This file is internal and excluded from Vercel deploys via `.vercelignore`.

---

## Quick facts

- **Your dev prefix** is currently set to `8e1b59b572` in `js/dashboard.js` (line 1019).
- **This never changes** for your Firebase account. Set once, works forever.
- **Only the account with that UID** sees the ghost intro + flybys. Everyone else gets the clean dashboard.
- **The code is never sent to non-dev users** — `internal-analytics.js` is only dynamically imported when the UID hash matches, so their browser never even downloads it.

---

## Files involved

| File | What it does |
|---|---|
| `js/internal-analytics.js` | Renamed from `ghost-mode.js`. Auto-runs on import. Plays cinematic, schedules flybys. |
| `assets/images/_cache/` | Renamed from `Ghost/`. Contains `atmosphere.png`, `candle.png`, `skeleton.png`, `bat.png`, `bats.png`. |
| `js/dashboard.js` (line ~1011+) | Contains `_maybeLoadInternal(uid)` that hash-checks the UID and imports the analytics file on match. |
| `.vercelignore` | Tells Vercel not to ship the above files to production. |

---

## How to set up from scratch (if you ever reset / change Firebase projects)

### Step 1 — Get your UID hash prefix

1. Start your localhost server and open the dashboard.
2. Log in with **the account you want as dev**.
3. Open DevTools (press F12) → **Console** tab.
4. Paste this and press Enter:

```js
(async () => {
  const { auth } = await import("/firebase/firebase.js");
  const uid = auth.currentUser?.uid;
  if (!uid) { console.error("Not signed in"); return; }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  console.log("UID:", uid);
  console.log("Dev prefix:", hex.slice(0, 10));
})();
```

5. Copy the 10-character value printed after `Dev prefix:`.

**Alternative if the console snippet errors:**
- Firebase Console → your project → Authentication → Users → copy the UID for your email.
- Paste the UID into this snippet (in any browser console, no login needed):

```js
(async () => {
  const uid = "PASTE_YOUR_UID_HERE";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  console.log("Dev prefix:", hex.slice(0, 10));
})();
```

### Step 2 — Paste the prefix into the code

Open `js/dashboard.js` in your code editor. Find this line (around line 1019):

```js
const DEV_UID_HASH_PREFIX = "__UNSET__";
```

Replace `"__UNSET__"` with your prefix:

```js
const DEV_UID_HASH_PREFIX = "8e1b59b572";
```

Save the file.

### Step 3 — Test it

1. Hard refresh the dashboard: **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac).
2. Make sure you're logged in as yourself.
3. The cinematic should play once, then flybys appear every 45-55s.

If nothing happens after refresh, open DevTools → Console and run:

```js
sessionStorage.clear()
```

Then refresh again. (The cinematic is session-scoped — one play per browser tab session.)

---

## How to temporarily see the cinematic as a non-dev user (for testing)

In `js/dashboard.js`, comment out these two guard lines inside `_maybeLoadInternal`:

```js
// if (DEV_UID_HASH_PREFIX === "__UNSET__") return;
// if (!hex.startsWith(DEV_UID_HASH_PREFIX)) return;
```

Now any logged-in user triggers the cinematic. **Uncomment before committing or pushing.**

---

## How to turn off the ghost mode entirely

Set the prefix back to `"__UNSET__"` — no one, not even you, will trigger it:

```js
const DEV_UID_HASH_PREFIX = "__UNSET__";
```

The file + assets still live in your repo (nothing is fetched), so you can turn it back on later.

---

## How to completely remove the ghost system

If you want it gone for good:

1. Delete `js/internal-analytics.js`.
2. Delete `assets/images/_cache/`.
3. In `js/dashboard.js`, delete the whole `_maybeLoadInternal` function and its call in the `onAuthStateChanged` block.
4. Remove the matching lines in `.vercelignore`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Cinematic doesn't play on refresh | `sessionStorage.clear()` in console → refresh. Once-per-session cache. |
| Plays for everyone, not just you | Check you haven't left the guard lines commented out from testing. |
| 404 in network tab for `internal-analytics.js` | Only happens if you deployed to Vercel — the `.vercelignore` entry excludes it from production, which is correct. On localhost the file exists. |
| `firebase is not defined` error in console | You used an old snippet. Use the `import("/firebase/firebase.js")` one above. |
| I logged out and back in and nothing happens | Session flags reset on logout (`wireDevLogout` handles this). Should work. If not, `sessionStorage.clear()`. |
| I want to trigger the cinematic again mid-session | Devtools console: `sessionStorage.clear()` + `location.reload()`. |

---

## Why this is safe-ish, not truly private

- The `dashboard.js` file ships to every user's browser, so anyone can read the JavaScript and see there's a hash check.
- They can also see `DEV_UID_HASH_PREFIX = "8e1b59b572"`.
- **But** SHA-256 is a one-way function. Seeing the prefix doesn't reveal which UID produces it. You'd need to try ~4 billion signups to brute-force a 10-char hex match.
- A determined engineer could temporarily override the check in their browser devtools to play the cinematic once. They can't make it play for anyone else.
- Source code visibility: if you publish your GitHub repo publicly, anyone can see all of this. If that matters, keep the repo private, or put the ghost code on a separate branch that doesn't push to main.

For a college project / resume, this level of hiding is plenty. Casual reviewers never see any trace.

---

## Current state snapshot

- `DEV_UID_HASH_PREFIX` is set → cinematic is live for your account.
- Ghost files exist locally but are excluded from Vercel deploys.
- No other ghost references in the codebase.
