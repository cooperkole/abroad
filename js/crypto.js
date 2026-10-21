// Passcode crypto shared by the browser and scripts/encrypt-secrets.mjs.
// PBKDF2-SHA256 stretches the passcode into 64 bytes:
//   bytes  0–31 → AES-256-GCM key that decrypts the phone number
//   bytes 32–63 → hashed with SHA-256 to make the public "verifier"
// A wrong passcode produces a different verifier (friendly error) and could not
// decrypt the phone number anyway (GCM authentication fails).

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const normalizePasscode = (s) => String(s ?? '').trim().toLowerCase();

export const toB64 = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
export const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function deriveMaterial(passcode, saltB64, iterations) {
  const base = await subtle.importKey('raw', enc.encode(normalizePasscode(passcode)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    512,
  );
  const all = new Uint8Array(bits);
  const keyBytes = all.slice(0, 32);
  const verifier = toB64(await subtle.digest('SHA-256', all.slice(32)));
  return { keyB64: toB64(keyBytes), verifier };
}

export async function encryptText(keyB64, plaintext) {
  const key = await subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptText(keyB64, { iv, ciphertext }) {
  const key = await subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
  return dec.decode(pt);
}

/** Try a passcode against the published secrets. Returns { keyB64, phone } or null. */
export async function unlockWithPasscode(passcode, secrets) {
  const { keyB64, verifier } = await deriveMaterial(passcode, secrets.salt, secrets.iterations);
  if (verifier !== secrets.verifier) return null;
  return unlockWithKey(keyB64, secrets);
}

/** Re-open with a key remembered from a previous visit. Returns { keyB64, phone } or null. */
export async function unlockWithKey(keyB64, secrets) {
  try {
    const phone = await decryptText(keyB64, secrets.phone);
    return { keyB64, phone };
  } catch {
    return null;
  }
}
