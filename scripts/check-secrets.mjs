#!/usr/bin/env node
// Fails if the raw phone number or passcode from .env.local appears in any
// tracked or staged file, or (with --history) anywhere in git history.
// Runs automatically as a pre-commit hook (see .githooks/pre-commit).
//
// Usage: node scripts/check-secrets.mjs [--history]

import { execFileSync } from 'node:child_process';
import { readEnv } from './encrypt-secrets.mjs';

let env;
try {
  env = readEnv();
} catch {
  console.log('check-secrets: no .env.local here (e.g. CI) — nothing to check against.');
  process.exit(0);
}

const digits = (env.PHONE_E164 || '').replace(/\D/g, '');
const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
const patterns = [];
if (national.length >= 7) {
  const a = national.slice(0, 3), b = national.slice(3, 6), c = national.slice(6);
  // Catches 5551234567, 555-123-4567, (555) 123-4567, 555.123.4567, 555 123 4567 …
  patterns.push(`${a}[^0-9a-z]{0,2}${b}[^0-9a-z]{0,2}${c}`);
  patterns.push(`${b}[-. ]${c}`);
}
if (env.FAMILY_PASSCODE) patterns.push(env.FAMILY_PASSCODE.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const run = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return e.stdout || ''; // git grep exits 1 when nothing matches
  }
};

let leaks = '';
for (const p of patterns) {
  leaks += run(['grep', '--cached', '-I', '-n', '-i', '-E', p]);
  leaks += run(['grep', '--untracked', '-I', '-n', '-i', '-E', p]);
  if (process.argv.includes('--history')) {
    const revs = run(['rev-list', '--all']).split('\n').filter(Boolean);
    for (const rev of revs) leaks += run(['grep', '-I', '-n', '-i', '-E', p, rev]);
    leaks += run(['log', '--all', '--format=%H %B', '-i', '-E', `--grep=${p}`]);
  }
}

if (leaks.trim()) {
  // Print file:line locations only — never the matched secret itself.
  const where = [...new Set(leaks.trim().split('\n').map((l) => l.split(':').slice(0, 2).join(':')))];
  console.error('✖ check-secrets: raw phone number or passcode found in:\n  ' + where.join('\n  '));
  process.exit(1);
}
console.log(`✔ check-secrets: no raw phone number or passcode in tracked files${process.argv.includes('--history') ? ' or git history' : ''}.`);
