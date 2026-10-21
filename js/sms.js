// Pure helpers for the "text Cooper" flow. No DOM access, so they're unit-tested.

/** 'ios' | 'android' | 'desktop' */
export function detectPlatform(ua = '', maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** iOS wants `sms:{phone}&body=`; Android and others want `sms:{phone}?body=`. */
export function buildSmsLink(platform, phone, body) {
  const sep = platform === 'ios' ? '&' : '?';
  return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
}

/** Whole dollars when whole, otherwise two decimals: 50 → "$50", 37.5 → "$37.50". */
export function formatAmount(amount) {
  const n = Number(amount);
  return '$' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** Parse a typed amount like "75", "$75.5", "1,000". Returns a number rounded to cents, or null. */
export function parseAmount(raw) {
  const s = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n >= 1 && n <= 10000 ? n : null;
}

export function buildMessage({ name, amount, tripName }) {
  const toward = tripName ? tripName : 'the general fund';
  return `Hi Cooper! It's ${name.trim()}. For your birthday + Christmas I'd like to put ${formatAmount(amount)} toward ${toward}. Sending it on Zelle now 🎉`;
}

/** "+15551234567" → "(555) 123-4567"; other countries are returned as-is. */
export function formatPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
