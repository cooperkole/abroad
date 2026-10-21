#!/usr/bin/env node
// Validates data/trips.json. Runs in CI on every push (and in the pre-commit hook).
// Usage: node scripts/validate-data.mjs [path/to/trips.json]

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, BUFFER, ROUND_TO } from './budget-rules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const path = process.argv[2] || `${root}data/trips.json`;
const errors = [];
const err = (msg) => errors.push(msg);

let data;
try {
  data = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`✖ ${path} is not valid JSON: ${e.message}`);
  console.error('  Tip: check for a missing comma or an extra comma after the last item.');
  process.exit(1);
}

const isMoney = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && Math.round(n * 100) === n * 100;
const isInt = (n) => Number.isInteger(n) && n >= 0;
const TRIP_KEYS = ['id', 'name', 'country', 'flag', 'region', 'tentativeDate', 'sortDate', 'nights', 'budget', 'breakdown',
  'received', 'status', 'blurb', 'image', 'imageAlt', 'postcard'];
// Privacy: amounts only. Anything that looks like a contributor's identity is rejected.
const FORBIDDEN = /^(names?|from|donors?|contributors?|givers?|who|by|sender|people|gifts?|contributions?|log|history|phone|email)$/i;

function scanForNames(obj, where) {
  if (Array.isArray(obj)) return obj.forEach((v, i) => scanForNames(v, `${where}[${i}]`));
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const isTripName = k === 'name' && /^root\.trips\[\d+\]$/.test(where); // the trip's own name is fine
      if (FORBIDDEN.test(k) && !isTripName) err(`${where}.${k}: contributor details aren't allowed in this public file — amounts only.`);
      scanForNames(v, `${where}.${k}`);
    }
  }
}

if (!data || typeof data !== 'object') err('Top level must be an object.');
if (!isMoney(data.generalFund)) err(`generalFund must be a non-negative number of dollars (got ${JSON.stringify(data.generalFund)}).`);
if (!Array.isArray(data.trips) || data.trips.length === 0) err('trips must be a non-empty array.');
for (const k of Object.keys(data)) if (!['generalFund', 'trips'].includes(k)) err(`Unexpected top-level field "${k}".`);
scanForNames(data, 'root');

const ids = new Set();
for (const [i, t] of (data.trips || []).entries()) {
  const at = `trips[${i}]${t?.id ? ` (${t.id})` : ''}`;
  for (const k of TRIP_KEYS) if (!(k in t)) err(`${at}: missing "${k}".`);
  for (const k of Object.keys(t)) if (!TRIP_KEYS.includes(k)) err(`${at}: unexpected field "${k}".`);

  if (typeof t.id !== 'string' || !/^[a-z0-9-]+$/.test(t.id)) err(`${at}: id must be lowercase letters, digits and dashes.`);
  else if (ids.has(t.id)) err(`${at}: duplicate id "${t.id}".`);
  else ids.add(t.id);

  for (const k of ['name', 'country', 'flag', 'tentativeDate', 'blurb', 'image', 'imageAlt']) {
    if (typeof t[k] !== 'string' || !t[k].trim()) err(`${at}: "${k}" must be a non-empty string.`);
  }
  if (!['spain', 'beyond'].includes(t.region)) err(`${at}: region must be "spain" or "beyond".`);
  if (typeof t.sortDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.sortDate) || Number.isNaN(Date.parse(t.sortDate))) err(`${at}: sortDate must be YYYY-MM-DD.`);
  if (!isInt(t.nights) || t.nights < 1) err(`${at}: nights must be a whole number ≥ 1.`);
  if (!isInt(t.budget) || t.budget <= 0) err(`${at}: budget must be a whole number of dollars > 0.`);
  if (!isMoney(t.received)) err(`${at}: received must be a non-negative number of dollars (got ${JSON.stringify(t.received)}). Use 100, not "$100".`);
  if (!['upcoming', 'done'].includes(t.status)) err(`${at}: status must be "upcoming" or "done".`);

  if (!t.breakdown || typeof t.breakdown !== 'object') err(`${at}: breakdown must be an object.`);
  else {
    for (const c of CATEGORIES) if (!isInt(t.breakdown[c])) err(`${at}: breakdown.${c} must be a whole number of dollars.`);
    for (const k of Object.keys(t.breakdown)) if (!CATEGORIES.includes(k)) err(`${at}: unexpected breakdown field "${k}".`);
    const sum = CATEGORIES.reduce((s, c) => s + (t.breakdown[c] || 0), 0);
    const expected = sum * (1 + BUFFER);
    if (isInt(t.budget) && Math.abs(t.budget - expected) > ROUND_TO / 2) {
      err(`${at}: budget $${t.budget} should be breakdown $${sum} + ${BUFFER * 100}% ≈ $${expected.toFixed(0)} (rounded to $${ROUND_TO}). Re-run node scripts/estimates.mjs.`);
    }
  }

  const fileOk = (rel) => existsSync(`${root}${rel}`);
  if (typeof t.image === 'string' && !fileOk(t.image)) err(`${at}: image "${t.image}" doesn't exist.`);
  if (typeof t.image === 'string' && !fileOk(t.image.replace(/\.jpg$/, '-800.jpg'))) err(`${at}: small image "${t.image.replace(/\.jpg$/, '-800.jpg')}" doesn't exist.`);

  if (t.postcard !== null && t.postcard !== undefined) {
    if (typeof t.postcard !== 'object' || typeof t.postcard.photo !== 'string' || typeof t.postcard.note !== 'string') {
      err(`${at}: postcard must be null or { "photo": "assets/img/postcards/${t.id}.jpg", "note": "…" }.`);
    } else {
      if (!fileOk(t.postcard.photo)) err(`${at}: postcard photo "${t.postcard.photo}" doesn't exist yet.`);
      if (t.postcard.note.length > 200) err(`${at}: postcard note is over 200 characters — keep it to a line or two.`);
      for (const k of Object.keys(t.postcard)) if (!['photo', 'note'].includes(k)) err(`${at}: unexpected postcard field "${k}".`);
    }
  }
}

if (errors.length) {
  console.error(`✖ ${errors.length} problem(s) in ${path}:\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
const total = data.trips.reduce((s, t) => s + t.received, 0) + data.generalFund;
console.log(`✔ ${path.replace(root, '')} looks good: ${data.trips.length} trips, $${total.toLocaleString('en-US')} received in total.`);
