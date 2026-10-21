# Photos needed

A shot list for swapping the stock photos for my own. JPG is best. Any phone photo works, and the site crops to fit.

## (a) Now: a hero photo of me

| What | Filename | Shape | Size |
|---|---|---|---|
| Me, outdoors or traveling, smiling, face clearly visible (no sunglasses ideally) | `assets/img/hero/cooper.jpg` | **Portrait** (taller than wide), about 4:5 | 1200 × 1500 px, under 250 KB |

**How to use it:** the hero is a postcard with the photo on the left and my note on the right. To swap the Barcelona skyline for my photo:
1. Save the photo as `assets/img/hero/cooper.jpg`, plus a smaller copy `assets/img/hero/cooper-800.jpg` (800 px wide).
2. In `index.html`, find the `<img>` inside `<figure class="hero-photo">` and the `<link rel="preload" as="image" …>` near the top. Change `barcelona` → `cooper` in all the paths.
3. Update `width="1200" height="1500"` and change the `alt` text to something like "Cooper grinning on a mountain trail".
4. Optional: add `object-position: center 30%;` to `.hero-photo img` in `css/styles.css` if the crop cuts off my head.
5. Remove the Barcelona row from `assets/img/CREDITS.md`.

Or just tell Claude: "use assets/img/hero/cooper.jpg as the hero photo."

## (b) After each trip: one photo of me at the landmark

**Landscape** (wider than tall), **4:3**, **1200 × 900 px**, under 250 KB, saved as `assets/img/postcards/{id}.jpg`:

| Trip | Filename | The shot |
|---|---|---|
| Madrid I | `assets/img/postcards/madrid-1.jpg` | Me in front of the Palacio Real, or at the Metrópolis building on Gran Vía |
| Seville | `assets/img/postcards/seville.jpg` | Me on a bridge at Plaza de España |
| London I | `assets/img/postcards/london-1.jpg` | Me with Tower Bridge behind |
| Granada | `assets/img/postcards/granada.jpg` | Me at the Mirador de San Nicolás with the Alhambra behind |
| San Sebastián + Bilbao | `assets/img/postcards/north-spain.jpg` | Me with Puppy at the Guggenheim, or on La Concha beach |
| Budapest | `assets/img/postcards/budapest.jpg` | Me in the Széchenyi Baths outdoor pool, or with the Parliament across the Danube |
| Madrid II + Toledo | `assets/img/postcards/madrid-2.jpg` | Me at the Mirador del Valle with Toledo behind |
| Morocco | `assets/img/postcards/morocco.jpg` | Me in Jardin Majorelle (blue walls) or above Jemaa el-Fnaa |
| Amsterdam | `assets/img/postcards/netherlands.jpg` | Me on a canal bridge (bike optional) |
| Lisbon + Porto | `assets/img/postcards/portugal.jpg` | Me next to Tram 28, or on the Dom Luís I bridge in Porto |
| Rome + Florence | `assets/img/postcards/italy.jpg` | Me at the Colosseum, or at Piazzale Michelangelo over Florence |
| Athens + Naxos | `assets/img/postcards/greece.jpg` | Me at the Acropolis, or at the Portara on Naxos at sunset |
| London II | `assets/img/postcards/london-2.jpg` | Me on the Prime Meridian line in Greenwich |

Then set the trip's `status` to `"done"` and add the `postcard` object. The README has the exact steps.

## Replacing a trip's *stock* image with my own

Want my own photo on the trip card too, not just in Postcards home?
1. Make a **landscape 3:2** version: `assets/img/trips/{id}.jpg` at **1200 × 800**, plus `assets/img/trips/{id}-800.jpg` at **800 × 533**. Both are required, and the data check fails if either is missing.
2. Overwrite the existing files with the same names. No code changes are needed.
3. Update that trip's `imageAlt` in `data/trips.json` (e.g. "Cooper at the Colosseum") and delete its row from `assets/img/CREDITS.md`.

**Resizing on a Mac:** open the photo in Preview → Tools → Adjust Size → width 1200 → File → Export as JPEG at about 75% quality. Or just ask Claude to resize it.
