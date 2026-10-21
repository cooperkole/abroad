# Cooper Abroad ✈️

My birthday + Christmas list for spring 2027: a family trip-fund site for my semester in Barcelona (CIEE, Jan 4 – Apr 24, 2027, plus about three weeks of travel after).

**Live:** https://cooperkole.github.io/abroad/

Family picks a weekend trip (or the general fund), taps **Chip in**, and their phone writes me a text. They send the money on Zelle. When it arrives I add the amount to one file and the progress bars update. There's no backend, database, login, or paid service. It's plain HTML/CSS/JS on GitHub Pages and costs $0.

---

## Log a Zelle in 60 seconds from your phone

1. Open **github.com/cooperkole/abroad** → `data/trips.json` → tap the **pencil** icon (✏️ "Edit this file").
2. Find the trip they picked and add the amount to its `"received"` number. If they picked the general fund, add it to `"generalFund"` at the very top instead.
   ```json
   "id": "greece",
   ...
   "received": 100,
   ```
   Use plain numbers: `100`, not `"$100"`. Don't add their name. The repo is public, so this file stores **amounts only**.
3. Tap **Commit changes** → **Commit changes**. The site updates in about a minute. A GitHub Action checks the file on every commit. If you break it (a stray comma, say), you'll get a "failed" email from GitHub with the exact problem. Fix it straight away, because the live site reads this same file.

Already 150 in there and someone sent 50? Change it to `200`. The general fund splits itself across trips automatically. If a trip ends up over budget, the extra flows to the others.

### Or tell Claude

From a Claude Code session in this repo:

> **log $100 to Greece**

Claude should then:
1. Open `data/trips.json` and add 100 to `received` on the trip with `"id": "greece"` (or to `generalFund` for "log $50 to the general fund").
2. Run `node scripts/validate-data.mjs` and `node --test tests/*.test.mjs`.
3. Commit with a message like `Log $100 to Greece` (no names) and push to `main`.

Trip ids: `madrid-1`, `seville`, `london-1`, `granada`, `north-spain`, `budapest`, `madrid-2`, `morocco`, `netherlands`, `portugal`, `italy`, `greece`, `london-2`.

---

## After each trip: post the postcard

1. Upload your photo as `assets/img/postcards/{id}.jpg` (see `PHOTOS_NEEDED.md` for sizes).
2. In `data/trips.json`, set that trip's `"status": "done"` and
   ```json
   "postcard": { "photo": "assets/img/postcards/greece.jpg", "note": "Made it to the top of the Acropolis before 8am. Worth it." }
   ```
3. Commit. It shows up under **Postcards home**. Then mail the real postcards!

---

## The passcode gate: light protection, not real security

Visitors have to type the family passcode before they can chip in. It hides my phone number from casual visitors, bots and scrapers. **It is not real security.** The passcode is short, everything runs in the browser, and anyone determined enough could brute-force it offline. Don't put anything behind it that would matter if it leaked.

How it works:
- My phone number and the passcode live only in `.env.local`, which is gitignored and never committed.
- `node scripts/encrypt-secrets.mjs` writes `js/secrets.js`, which holds a random salt, the PBKDF2 iteration count (250,000), a verifier hash, and the phone number encrypted with AES-256-GCM under a key derived from the passcode.
- In the browser, WebCrypto derives the key from what the visitor types. A wrong passcode fails the verifier check and gets a friendly error, and it couldn't decrypt the number anyway. A correct one stores the derived key (not the passcode) in `localStorage`, so family only types it once per device.
- The trip data and photos load before the gate. The chip-in flow and the phone number only exist after unlocking.
- The passcode isn't case-sensitive, and leading or trailing spaces are ignored.

**To change the passcode or phone number:** edit `.env.local`, run `node scripts/encrypt-secrets.mjs`, and commit `js/secrets.js`. Everyone will need the new passcode.

`.env.local` format:
```
PHONE_E164=+1XXXXXXXXXX
FAMILY_PASSCODE=your-passcode
```

**Leak guard:** a pre-commit hook (`.githooks/pre-commit`, enabled with `git config core.hooksPath .githooks`) runs `node scripts/check-secrets.mjs`. The check reads `.env.local` and blocks any commit that contains the raw phone number (in any common format) or the passcode. To scan the whole git history, run `node scripts/check-secrets.mjs --history`.

---

## Running it locally

```bash
python3 -m http.server 8080
```
Then open http://localhost:8080. Any static server works; there's no build step. Opening `index.html` directly from disk won't work, because browsers block `fetch()` and ES modules over `file://`.

```bash
node --test tests/*.test.mjs        # allocation math, SMS links, passcode crypto
node scripts/validate-data.mjs      # data file schema check (also runs in GitHub Actions)
node scripts/estimates.mjs          # rebuild budgets + ESTIMATES.md from the line items
```

Node 18+ is only needed for these scripts. The site itself has zero dependencies.

## How the money logic works (`js/allocation.js`)

1. Each trip shows `min(received, budget)` as direct money. Anything over budget overflows into the pool.
2. The pool is `generalFund` plus all overflow.
3. The pool is water-filled: it's split evenly across trips that aren't full. Each share is capped at that trip's remaining need, and the leftover is re-split until the pool is empty or every trip is full.
4. Bars are two-tone: solid navy for direct money and striped teal for general-fund money, each labelled in a text legend.

All math is done in whole cents, and every case is covered by tests.

## Files

| Path | What |
|---|---|
| `index.html`, `css/styles.css`, `js/app.js` | The site |
| `js/allocation.js` | Pure money logic (tested) |
| `js/sms.js` | SMS link + message builders (tested) |
| `js/crypto.js` | PBKDF2 + AES-GCM shared by browser and scripts (tested) |
| `js/secrets.js` | **Generated**, encrypted only |
| `data/trips.json` | All mutable state: budgets, amounts received, postcards |
| `scripts/estimates.mjs` | Every budget line item → `ESTIMATES.md` + budgets in `trips.json` |
| `scripts/validate-data.mjs` | Schema check, run in CI |
| `scripts/encrypt-secrets.mjs`, `scripts/check-secrets.mjs` | Secrets in, leak guard |
| `ESTIMATES.md` | Workings for every number |
| `DECISIONS.md` | Judgment calls made while building |
| `PHOTOS_NEEDED.md` | Shot list for my own photos |
| `assets/img/CREDITS.md` | Photo credits |

## Deploying

The site is served by GitHub Pages from the root of the `main` branch. It works under the `/abroad/` subpath because every path is relative. `.nojekyll` tells Pages to serve files as-is. Every push to `main` redeploys in about a minute, and `.github/workflows/validate.yml` runs the data check and tests on every push.
