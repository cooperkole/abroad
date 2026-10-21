import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMaterial, encryptText, unlockWithPasscode, unlockWithKey, toB64 } from '../js/crypto.js';

// Dummy values only — the real ones live in the gitignored .env.local.
const PASS = 'example-pass';
const PHONE = '+15550000000';

async function makeSecrets() {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const iterations = 1000; // fast for tests; production uses 250k
  const { keyB64, verifier } = await deriveMaterial(PASS, salt, iterations);
  return { salt, iterations, verifier, phone: await encryptText(keyB64, PHONE) };
}

test('right passcode decrypts the phone number', async () => {
  const s = await makeSecrets();
  const r = await unlockWithPasscode(PASS, s);
  assert.equal(r.phone, PHONE);
});

test('passcode is forgiving about case and spaces', async () => {
  const s = await makeSecrets();
  const r = await unlockWithPasscode('  Example-PASS ', s);
  assert.equal(r?.phone, PHONE);
});

test('wrong passcode fails gracefully', async () => {
  const s = await makeSecrets();
  assert.equal(await unlockWithPasscode('nope', s), null);
});

test('remembered key reopens; a bad key returns null', async () => {
  const s = await makeSecrets();
  const { keyB64 } = await unlockWithPasscode(PASS, s);
  assert.equal((await unlockWithKey(keyB64, s)).phone, PHONE);
  assert.equal(await unlockWithKey(toB64(new Uint8Array(32)), s), null);
});
