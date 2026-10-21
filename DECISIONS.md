# Decisions

Judgment calls made while building, so future me knows why things are the way they are. Built 2026-10-20.

## Money and budgets
- **Exchange rate: €1 = $1.15, not $1.08.** The brief said to use $1.08 unless current data disagreed, and it did: EUR/USD was about 1.147 in mid-Sept 2026. £1 = $1.33 and $1 = 9.30 MAD. Sources are in `ESTIMATES.md`.
- **"Getting there" includes getting around** (airport buses, metro passes, the UK ETA), so each trip has exactly the four categories the brief asked for.
- **The 10% buffer appears as its own "Just-in-case (10%)" line** on each card back, and it absorbs the $25 rounding. That way the visible lines always add up to the total.
- **The UK ETA (£16, valid two years) is counted once**, on London I.
- **Morocco's base budget is Marrakech only.** Adding Fes would mean roughly +$150 (train, extra nights). It's mentioned in the estimates, not in the total.
- **Prices are adult rates**, even where the Guggenheim and some museums give student discounts. The Prado and Reina Sofía are free for students under 25 and are left out entirely. Any discount just becomes extra buffer.
- **"Done" trips stay in the general-fund split.** Topping one up after the fact still covers real costs, and it keeps the math simple.
- **Pool money beyond every budget** shows as a "bonus trip" line in the general-fund card (`unallocatedSurplus`).

## Dates (all tentative)
- Spain trips are spread Jan–Mar: Madrid I (Jan 15–17), Seville (Jan 29–31), Granada (Feb 26–28), San Sebastián + Bilbao (Mar 4–7), Madrid II + Toledo (Mar 19–21).
- Morocco falls in **Holy Week / spring break, Mar 23–27**, since Easter 2027 is Mar 28 and Barcelona programs usually break then.
- Portugal (Apr 25–29), Italy (May 1–5), Greece (May 7–11), and London II (May 13–15, the natural last stop before flying home) are in the **post-program weeks**. Greece is in May for island season, as the brief asked.
- London I (Feb), Budapest (Mar 11–14), and Amsterdam (Apr 8–11) fill normal weekends during the semester.
- I added `sortDate` (ISO) and `nights` fields to each trip, alongside the human-friendly `tentativeDate`. They're used for chronological sorting and the card meta line. I also added `flag`, `region` ("spain"/"beyond", which drives the filter chips) and `imageAlt`.

## Images
- **Wikimedia Commons instead of Unsplash/Pexels.** Unsplash's search needs an API key (the brief allows none), while the Commons API is keyless and returns license and author metadata, which made the credits exact. All photos are CC BY or CC BY-SA 2.0–4.0, with credits in `assets/img/CREDITS.md`, linked from the footer. They're cropped to 3:2 and exported at 1200px and 800px. Phones get the 800px version through `srcset`, which took Lighthouse from 77 to 98.
- Every image loaded fine, so the illustrated-SVG fallback wasn't needed.

## Passcode gate
- **The gate can't be dismissed**, even with Esc. Trip cards render behind a blurred backdrop, as the brief allows.
- **Passcodes aren't case-sensitive and ignore surrounding spaces.** Phones auto-capitalize the first letter, and grandparents shouldn't get stuck on that.
- **What's remembered is the derived AES key**, not the passcode. The key decrypts only the phone number.
- **PBKDF2 runs 250,000 iterations** (the brief asked for at least 150k), and one derivation yields both the key and a separate verifier. With a verifier, a wrong code fails fast with a friendly message, without relying on a GCM error.
- Added a **pre-commit hook plus `scripts/check-secrets.mjs`** that block the raw phone number (any common format) or passcode from ever being committed.

## Contribution flow
- **Phone detection:** iPhone/iPad (including iPadOS's "Macintosh + touch" disguise) → `sms:{phone}&body=`. Android → `sms:{phone}?body=`. Everything else gets the desktop copy-the-message fallback.
- **After sending, the thank-you screen has a "Texts didn't open? Try again" link** (a real `sms:` anchor) and a "Copy number" button for Zelle.
- **The trip picker in the modal can be changed**, so you can switch from Seville to the general fund without closing it. Funded trips are labelled "(already funded!)".
- **Amounts:** chips for $25/$50/$100/$250, or a custom $1–$10,000 with up to two decimals.
- **Name** is saved in `localStorage` only. It's never sent anywhere except inside the text the person sends themselves.

## Design and accessibility
- **Cards flip on hover (after a 180ms delay), tap, or keyboard.** With a mouse, hovering flips the card. On touch, tapping the card toggles it. Keyboard users get explicit "Budget breakdown ↻" / "Flip back" buttons. The hidden face is `inert`, so it's never tabbable or read out. The delay stops cards flipping as the cursor passes over.
- **Each card's progress bar is a `role="img"` with a full text label** ("$216 of $350 raised, 61 percent: $100 chipped in directly and $116 from the general fund"). The legend uses solid vs. striped swatches as well as text, so it doesn't rely on color.
- **Modals use native `<dialog>.showModal()`**, which makes the page inert, with a Tab-wrap fallback trap on top.
- **Google Fonts load without render-blocking** (`media="print"` swap trick, plus a `noscript` fallback). The page also sets `robots: noindex`, since it's a private family page. That's why Lighthouse SEO scores low on purpose.
- **Dark mode** ("night train" navy paper) follows `prefers-color-scheme`.

## Deployment
- **GitHub Pages serves from `main` / root** via `gh api`, as the brief specified. Because of that, CI validation can't block a bad deploy. It emails on failure instead, and the README says so.
- The site lives at its own repo path (`~/Documents/Projects/abroad`), not inside the KG Industries repo the session started in.
