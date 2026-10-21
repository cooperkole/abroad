import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, buildSmsLink, buildMessage, formatAmount, parseAmount, formatPhone } from '../js/sms.js';

const PHONE = '+15550001111'; // dummy

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipados: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};

test('platform detection', () => {
  assert.equal(detectPlatform(UA.iphone, 5), 'ios');
  assert.equal(detectPlatform(UA.ipados, 5), 'ios');
  assert.equal(detectPlatform(UA.android, 5), 'android');
  assert.equal(detectPlatform(UA.mac, 0), 'desktop');
  assert.equal(detectPlatform(UA.windows, 0), 'desktop');
});

test('iOS link uses &body=, Android uses ?body=', () => {
  const body = "Hi Cooper! It's Gran. $50 toward Rome + Florence 🎉";
  const ios = buildSmsLink('ios', PHONE, body);
  const android = buildSmsLink('android', PHONE, body);
  assert.ok(ios.startsWith(`sms:${PHONE}&body=`));
  assert.ok(android.startsWith(`sms:${PHONE}?body=`));
  // Body survives a round trip, including +, &, apostrophes and emoji.
  assert.equal(decodeURIComponent(ios.split('&body=')[1]), body);
  assert.equal(decodeURIComponent(android.split('?body=')[1]), body);
  assert.ok(!ios.split('&body=')[1].includes('+'), 'plus signs must be percent-encoded');
});

test('message text matches the template', () => {
  assert.equal(
    buildMessage({ name: ' Aunt Sue ', amount: 100, tripName: 'Athens + Naxos' }),
    "Hi Cooper! It's Aunt Sue. For your birthday + Christmas I'd like to put $100 toward Athens + Naxos. Sending it on Zelle now 🎉",
  );
  assert.equal(
    buildMessage({ name: 'Grandpa', amount: 37.5, tripName: null }),
    "Hi Cooper! It's Grandpa. For your birthday + Christmas I'd like to put $37.50 toward the general fund. Sending it on Zelle now 🎉",
  );
});

test('amount parsing and formatting', () => {
  assert.equal(parseAmount('75'), 75);
  assert.equal(parseAmount('$1,000'), 1000);
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('12.345'), null);
  assert.equal(formatAmount(1000), '$1,000');
  assert.equal(formatAmount(12.5), '$12.50');
});

test('US phone formatting', () => {
  assert.equal(formatPhone('+15550001111'), '(555) 000-1111');
  assert.equal(formatPhone('+34600000000'), '+34600000000');
});
