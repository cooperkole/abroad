#!/usr/bin/env node
// Estimate helper. Holds every line item behind every trip budget, then:
//   1. writes ESTIMATES.md (the full workings), and
//   2. updates `budget` and `breakdown` in data/trips.json (nothing else is touched).
//
// Usage: node scripts/estimates.mjs
// To change an estimate, edit the line items below and re-run.

import { readFileSync, writeFileSync } from 'node:fs';
import { RATES, BUFFER, CATEGORIES, budgetFromBreakdown } from './budget-rules.mjs';

const ESTIMATE_DATE = '2026-10-20';

// Sources checked on the estimate date. Keys are referenced from line items as [S:key].
const SOURCES = {
  fx: 'EUR/USD ≈ 1.147 on 2026-09-16 (longforecast.com); USD/MAD ≈ 9.33 on 2026-09-01 (poundsterlinglive.com/history/USD-MAD-2026); GBP/USD ≈ 1.33 (derived from GBP/MAD ÷ USD/MAD, late Jul–Sep 2026)',
  ouigo: 'Ouigo Madrid–Barcelona from €9, with a reported Sept 2026 minimum-fare rise to €19 (ouigo.com/es/en/barcelona-madrid-train; nomadlawyer.org); Iryo from ~£34 on Omio',
  rak: 'Ryanair BCN–RAK one-way fares €17–32 on sample dates (ryanair.com route page); avg ~€36 one-way (liligo.fr)',
  alhambra: 'Alhambra general admission €21 + €1.27 online fee = €22.27 (lovegranada.com/alhambra/prices, 2026)',
  colosseum: 'Colosseum standard ticket €18 + €2 booking fee (untoldItaly / romewise, 2026)',
  uffizi: 'Uffizi €29 booked in advance, €25 on the day (uffizi.it official fares)',
  acropolis: 'Acropolis full-price ticket €30 (multiple 2026 guides; protothema.gr)',
  naxos: 'Blue Star Piraeus–Naxos from €52.50 (ferryscanner.com, updated 2026-06-20)',
  guggenheim: 'Guggenheim Bilbao adult €15, students 18–26 €7.50 (artvisitguide.com, 2026)',
  hostels: 'Dorm beds: Lisbon €18–25 low season; Amsterdam $25–45; London £25–45; Budapest €8–30; W/S Europe capitals €18–40 (hostelz.com, eurovistatrips.com, 2026). Feb is the cheapest month (hostelz.com)',
  typical: 'Typical 2026 figure, not individually spot-checked — labelled as an estimate',
};

// [label, amount, currency, sourceKey, note]
const ESTIMATES = {
  'madrid-1': {
    gettingThere: [
      ['Ouigo/Iryo train BCN ⇄ Madrid, round trip booked ~3 weeks out', 60, 'EUR', 'ouigo', '~€30 each way'],
      ['Metro 10-trip card', 12, 'EUR', 'typical'],
    ],
    staying: [['Hostel dorm, 2 nights × €30 (Sol/La Latina)', 60, 'EUR', 'hostels']],
    eating: [['3 days × €32 (bakery breakfast, menú del día, tapas)', 96, 'EUR', 'typical']],
    doing: [
      ['Santiago Bernabéu stadium tour', 28, 'EUR', 'typical'],
      ['Royal Palace', 14, 'EUR', 'typical', 'Prado & Reina Sofía are free for students under 25'],
    ],
  },
  seville: {
    gettingThere: [
      ['Vueling BCN ⇄ SVQ incl. cabin bag', 90, 'EUR', 'typical'],
      ['Airport bus (EA), both ways', 10, 'EUR', 'typical'],
    ],
    staying: [['Hostel dorm, 2 nights × €26', 52, 'EUR', 'hostels', 'January is low season']],
    eating: [['3 days × €28', 84, 'EUR', 'typical']],
    doing: [
      ['Real Alcázar', 16, 'EUR', 'typical'],
      ['Flamenco show in Triana', 25, 'EUR', 'typical'],
    ],
  },
  'london-1': {
    gettingThere: [
      ['easyJet/Ryanair BCN ⇄ London incl. cabin bag', 100, 'EUR', 'typical'],
      ['UK Electronic Travel Authorisation (ETA), valid 2 years', 16, 'GBP', 'typical', 'covers London II too'],
      ['Airport train (Gatwick/Stansted) both ways', 24, 'GBP', 'typical'],
      ['Tube/bus on contactless, 4 days at the daily cap', 32, 'GBP', 'typical'],
    ],
    staying: [['Hostel dorm, 3 nights × £32 (Zones 1–2)', 96, 'GBP', 'hostels']],
    eating: [['4 days × £28 (meal deals, markets, one pub roast)', 112, 'GBP', 'typical']],
    doing: [
      ['Tower of London (Crown Jewels)', 36, 'GBP', 'typical'],
      ['Day-seat / TodayTix West End ticket', 30, 'GBP', 'typical', 'big museums are free'],
    ],
  },
  granada: {
    gettingThere: [
      ['Vueling BCN ⇄ GRX incl. cabin bag', 100, 'EUR', 'typical'],
      ['Airport bus, both ways', 7, 'EUR', 'typical'],
    ],
    staying: [['Hostel dorm, 2 nights × €24 (Albaicín/centre)', 48, 'EUR', 'hostels']],
    eating: [['3 days × €26 (free tapas with drinks helps)', 78, 'EUR', 'typical']],
    doing: [
      ['Alhambra general admission (Nasrid Palaces + Generalife)', 22.27, 'EUR', 'alhambra'],
      ['Sacromonte/Albaicín walking tour (tip)', 10, 'EUR', 'typical'],
    ],
  },
  'north-spain': {
    gettingThere: [
      ['Vueling BCN ⇄ Bilbao incl. cabin bag', 110, 'EUR', 'typical'],
      ['Bus Bilbao ⇄ San Sebastián, both ways', 28, 'EUR', 'typical'],
      ['Airport bus + local transit', 10, 'EUR', 'typical'],
    ],
    staying: [
      ['Hostel dorm San Sebastián, 2 nights × €40', 80, 'EUR', 'hostels', 'SS is pricier'],
      ['Hostel dorm Bilbao, 1 night × €30', 30, 'EUR', 'hostels'],
    ],
    eating: [['4 days × €38 (pintxos add up fast)', 152, 'EUR', 'typical']],
    doing: [
      ['Guggenheim Bilbao (adult price)', 15, 'EUR', 'guggenheim', 'student price €7.50 if accepted'],
      ['Monte Igueldo funicular', 5, 'EUR', 'typical'],
    ],
  },
  budapest: {
    gettingThere: [
      ['Wizz/Ryanair BCN ⇄ BUD incl. cabin bag', 110, 'EUR', 'typical'],
      ['100E airport bus both ways + 72-hour transit pass', 31, 'EUR', 'typical', 'HUF converted to EUR'],
    ],
    staying: [['Hostel dorm, 3 nights × €20', 60, 'EUR', 'hostels']],
    eating: [['4 days × €22', 88, 'EUR', 'typical']],
    doing: [
      ['Hungarian Parliament tour (non-EU price)', 33, 'EUR', 'typical'],
      ['Széchenyi Baths (weekend ticket)', 38, 'EUR', 'typical'],
    ],
  },
  'madrid-2': {
    gettingThere: [
      ['Ouigo/Iryo train BCN ⇄ Madrid, round trip', 60, 'EUR', 'ouigo'],
      ['Avant/Renfe train Madrid ⇄ Toledo day trip', 28, 'EUR', 'typical'],
      ['Metro 10-trip card', 12, 'EUR', 'typical'],
    ],
    staying: [['Hostel dorm, 2 nights × €30', 60, 'EUR', 'hostels']],
    eating: [['3 days × €32', 96, 'EUR', 'typical']],
    doing: [
      ['Toledo Cathedral', 12, 'EUR', 'typical'],
      ['Retiro rowboat', 6, 'EUR', 'typical'],
    ],
  },
  morocco: {
    gettingThere: [
      ['Ryanair BCN ⇄ RAK incl. cabin bag', 110, 'EUR', 'rak', 'fares €17–36 + bag'],
      ['Airport bus 19 both ways', 60, 'MAD', 'typical'],
      ['Petit taxis around town', 150, 'MAD', 'typical'],
    ],
    staying: [['Riad-hostel dorm in the medina, 4 nights × 150 MAD', 600, 'MAD', 'typical', 'Fes add-on not included']],
    eating: [['5 days × 200 MAD (food stalls, tagines, mint tea)', 1000, 'MAD', 'typical']],
    doing: [
      ['Jardin Majorelle', 170, 'MAD', 'typical'],
      ['Bahia Palace', 100, 'MAD', 'typical'],
      ['Local hammam + scrub', 150, 'MAD', 'typical'],
    ],
  },
  netherlands: {
    gettingThere: [
      ['Vueling/Transavia BCN ⇄ AMS incl. cabin bag', 130, 'EUR', 'typical'],
      ['Train Schiphol ⇄ Centraal', 12, 'EUR', 'typical'],
      ['GVB 72-hour transit ticket', 28, 'EUR', 'typical'],
    ],
    staying: [['Hostel dorm, 3 nights × €45 incl. city tax', 135, 'EUR', 'hostels', 'Amsterdam is the priciest stop']],
    eating: [['4 days × €35', 140, 'EUR', 'typical']],
    doing: [
      ['Rijksmuseum', 25, 'EUR', 'typical'],
      ['Anne Frank House', 17, 'EUR', 'typical'],
    ],
  },
  portugal: {
    gettingThere: [
      ['Flight BCN → Lisbon (one way) incl. cabin bag', 55, 'EUR', 'typical'],
      ['Flight Porto → BCN (one way) incl. cabin bag', 55, 'EUR', 'typical'],
      ['Train Lisbon → Porto (Intercidades)', 25, 'EUR', 'typical'],
      ['Metro/tram passes in both cities', 28, 'EUR', 'typical'],
    ],
    staying: [
      ['Hostel dorm Lisbon, 2 nights × €28', 56, 'EUR', 'hostels'],
      ['Hostel dorm Porto, 2 nights × €24', 48, 'EUR', 'hostels'],
    ],
    eating: [['5 days × €28', 140, 'EUR', 'typical']],
    doing: [
      ['Jerónimos Monastery', 18, 'EUR', 'typical'],
      ['Port cellar tour + tasting in Gaia', 20, 'EUR', 'typical'],
    ],
  },
  italy: {
    gettingThere: [
      ['Flight BCN → Rome (one way) incl. cabin bag', 60, 'EUR', 'typical'],
      ['Flight Pisa/Florence → BCN (one way) incl. cabin bag', 60, 'EUR', 'typical'],
      ['Italo/Frecciarossa Rome → Florence, booked ahead', 30, 'EUR', 'typical'],
      ['Airport buses + Rome metro 48h', 25, 'EUR', 'typical'],
    ],
    staying: [['Hostel dorm, 4 nights × €35 + city tax', 160, 'EUR', 'hostels', '€140 beds + ~€20 tourist tax']],
    eating: [['5 days × €32 (pizza al taglio, trattorie, gelato)', 160, 'EUR', 'typical']],
    doing: [
      ['Colosseum + Forum + Palatine', 20, 'EUR', 'colosseum'],
      ['Uffizi Galleries (advance)', 29, 'EUR', 'uffizi'],
    ],
  },
  greece: {
    gettingThere: [
      ['Vueling/Aegean BCN ⇄ ATH incl. cabin bag (May)', 140, 'EUR', 'typical'],
      ['Blue Star ferry Piraeus ⇄ Naxos', 105, 'EUR', 'naxos', '€52.50 each way'],
      ['Airport metro + Piraeus metro', 23, 'EUR', 'typical'],
    ],
    staying: [
      ['Hostel dorm Athens, 2 nights × €30', 60, 'EUR', 'hostels'],
      ['Hostel/budget room Naxos, 2 nights × €30', 60, 'EUR', 'typical'],
    ],
    eating: [['5 days × €30 (gyros, souvlaki, a taverna splurge)', 150, 'EUR', 'typical']],
    doing: [
      ['Acropolis', 30, 'EUR', 'acropolis'],
      ['Scooter rental for a Naxos beach day', 30, 'EUR', 'typical'],
    ],
  },
  'london-2': {
    gettingThere: [
      ['easyJet/Ryanair BCN ⇄ London incl. cabin bag', 100, 'EUR', 'typical', 'ETA already paid on London I'],
      ['Airport train both ways', 24, 'GBP', 'typical'],
      ['Tube/bus, 3 days at the daily cap', 24, 'GBP', 'typical'],
    ],
    staying: [['Hostel dorm, 2 nights × £32', 64, 'GBP', 'hostels']],
    eating: [['3 days × £28 (Borough Market counts)', 84, 'GBP', 'typical']],
    doing: [
      ['Westminster Abbey', 30, 'GBP', 'typical'],
      ['Thames Clipper to Greenwich', 10, 'GBP', 'typical'],
    ],
  },
};

const CAT_LABEL = { gettingThere: 'Getting there', staying: 'Staying', eating: 'Eating', doing: 'Doing' };
const usd = (amt, cur) => amt * RATES[cur];
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fmtLocal = (amt, cur) => (cur === 'MAD' ? `${amt} MAD` : cur === 'GBP' ? `£${amt}` : cur === 'USD' ? `$${amt}` : `€${amt}`);

const dataPath = new URL('../data/trips.json', import.meta.url);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

let md = `# Trip budget estimates

_Estimated on ${ESTIMATE_DATE}. Every number on the site comes from this file, generated by \`node scripts/estimates.mjs\`._

## Method

- **Style:** budget airlines (Vueling, Ryanair, easyJet, Wizz) booked a few weeks out with a personal item + cabin bag; well-rated hostel dorm beds in good locations (not the cheapest); cheap restaurants and street food; public transport; one or two paid headline activities per trip.
- **Categories:** Getting there (incl. airport transfers and local transit), Staying, Eating, Doing.
- **Exchange rates (USD per unit):** €1 = $${RATES.EUR.toFixed(2)}, £1 = $${RATES.GBP.toFixed(2)}, 1 MAD = $${RATES.MAD.toFixed(4)} (9.30 MAD per $1).
  The brief suggested €1 = $1.08, but current data says otherwise: ${SOURCES.fx}.
- **Per category:** line items converted to USD and rounded to whole dollars.
- **Trip total:** sum of the four categories + ${BUFFER * 100}% buffer, rounded to the nearest $25.
- Items marked _estimate_ are typical 2026–27 figures that weren't individually spot-checked. Items marked with a source were spot-checked on the estimate date.

## Sources

${Object.entries(SOURCES).filter(([k]) => k !== 'typical').map(([k, v]) => `- **${k}**: ${v}`).join('\n')}

`;

let grand = 0;
const summary = [];
for (const trip of data.trips) {
  const est = ESTIMATES[trip.id];
  if (!est) throw new Error(`No estimate for ${trip.id}`);
  const breakdown = {};
  md += `## ${trip.name} (${trip.id}) — ${trip.tentativeDate}, ${trip.nights} nights\n\n| Category | Item | Local | USD | Source / assumption |\n|---|---|---|---|---|\n`;
  for (const cat of CATEGORIES) {
    let catTotal = 0;
    for (const [label, amt, cur, src, note] of est[cat]) {
      const u = usd(amt, cur);
      catTotal += u;
      const srcText = src === 'typical' ? '_estimate_' : `spot-checked: ${src}`;
      md += `| ${CAT_LABEL[cat]} | ${label} | ${fmtLocal(amt, cur)} | ${fmt(u)} | ${srcText}${note ? ` — ${note}` : ''} |\n`;
    }
    breakdown[cat] = Math.round(catTotal);
  }
  const subtotal = CATEGORIES.reduce((s, k) => s + breakdown[k], 0);
  const budget = budgetFromBreakdown(breakdown);
  md += `\n${CATEGORIES.map((c) => `${CAT_LABEL[c]} **${fmt(breakdown[c])}**`).join(' · ')}  \nSubtotal ${fmt(subtotal)} + 10% buffer = ${fmt(subtotal * 1.1)} → **${fmt(budget)}**\n\n`;
  trip.breakdown = breakdown;
  trip.budget = budget;
  grand += budget;
  summary.push(`| ${trip.name} | ${trip.tentativeDate} | ${fmt(budget)} |`);
}

md += `## Summary\n\n| Trip | Tentative dates (2027) | Budget |\n|---|---|---|\n${summary.join('\n')}\n| **Total** | | **${fmt(grand)}** |\n`;

writeFileSync(new URL('../ESTIMATES.md', import.meta.url), md);
writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
console.log(`Updated ${data.trips.length} trips. Total budget ${fmt(grand)}.`);
