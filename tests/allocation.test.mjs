import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocate } from '../js/allocation.js';

const cents = (n) => Math.round(n * 100);

/** Sum of all trip totals + surplus must equal everything received, to the cent. */
function assertConserved(trips, generalFund, result) {
  const received = cents(generalFund) + trips.reduce((s, t) => s + cents(t.received), 0);
  const allocated = Object.values(result.trips).reduce((s, r) => s + cents(r.total), 0);
  assert.equal(allocated + cents(result.unallocatedSurplus), received);
  assert.equal(cents(result.totalReceived), received);
}

const three = (received = [0, 0, 0]) => [
  { id: 'a', budget: 300, received: received[0] },
  { id: 'b', budget: 500, received: received[1] },
  { id: 'c', budget: 700, received: received[2] },
];

test('zero money', () => {
  const trips = three();
  const r = allocate(trips, 0);
  for (const t of Object.values(r.trips)) {
    assert.deepEqual([t.direct, t.fromGeneral, t.total, t.pct, t.funded], [0, 0, 0, 0, false]);
  }
  assert.equal(r.totalBudget, 1500);
  assert.equal(r.totalReceived, 0);
  assert.equal(r.unallocatedSurplus, 0);
  assertConserved(trips, 0, r);
});

test('general fund only splits evenly', () => {
  const trips = three();
  const r = allocate(trips, 300);
  assert.equal(r.trips.a.fromGeneral, 100);
  assert.equal(r.trips.b.fromGeneral, 100);
  assert.equal(r.trips.c.fromGeneral, 100);
  assert.equal(r.trips.a.direct, 0);
  assert.equal(r.unallocatedSurplus, 0);
  assertConserved(trips, 300, r);
});

test('one trip overfunded directly: overflow joins the pool', () => {
  const trips = three([450, 0, 0]); // a is 150 over
  const r = allocate(trips, 0);
  assert.equal(r.trips.a.direct, 300);
  assert.equal(r.trips.a.fromGeneral, 0);
  assert.equal(r.trips.a.funded, true);
  assert.equal(r.trips.a.pct, 100);
  assert.equal(r.trips.b.fromGeneral, 75);
  assert.equal(r.trips.c.fromGeneral, 75);
  assertConserved(trips, 0, r);
});

test('pool larger than total remaining need leaves a surplus', () => {
  const trips = three([100, 0, 0]);
  const r = allocate(trips, 2000); // need is 1400
  for (const id of ['a', 'b', 'c']) assert.equal(r.trips[id].funded, true);
  assert.equal(r.trips.a.fromGeneral, 200);
  assert.equal(r.unallocatedSurplus, 600);
  assertConserved(trips, 2000, r);
});

test('uneven caps force several redistribution rounds', () => {
  const trips = [
    { id: 'tiny', budget: 50, received: 0 },
    { id: 'small', budget: 120, received: 0 },
    { id: 'mid', budget: 400, received: 0 },
    { id: 'big', budget: 1000, received: 0 },
  ];
  // Round 1: 800/4 = 200 → tiny capped at 50, small capped at 120 → leftover 230.
  // Round 2: 230/2 = 115 → mid 315, big 315. Pool exhausted.
  const r = allocate(trips, 800);
  assert.equal(r.trips.tiny.fromGeneral, 50);
  assert.equal(r.trips.small.fromGeneral, 120);
  assert.equal(r.trips.mid.fromGeneral, 315);
  assert.equal(r.trips.big.fromGeneral, 315);
  assert.equal(r.unallocatedSurplus, 0);
  assertConserved(trips, 800, r);

  // Three rounds: mid also fills on the second pass.
  const r2 = allocate(trips, 1300);
  assert.equal(r2.trips.mid.fromGeneral, 400);
  assert.equal(r2.trips.big.fromGeneral, 730);
  assertConserved(trips, 1300, r2);
});

test('direct money and general fund combine without exceeding budget', () => {
  const trips = three([250, 0, 0]);
  const r = allocate(trips, 300);
  assert.equal(r.trips.a.direct, 250);
  assert.equal(r.trips.a.fromGeneral, 50); // capped by need
  assert.equal(r.trips.b.fromGeneral, 125);
  assert.equal(r.trips.c.fromGeneral, 125);
  assertConserved(trips, 300, r);
});

test('odd cents never drift', () => {
  const trips = three();
  const r = allocate(trips, 100.01);
  const shares = ['a', 'b', 'c'].map((id) => cents(r.trips[id].fromGeneral)).sort();
  assert.deepEqual(shares, [3333, 3334, 3334]);
  assertConserved(trips, 100.01, r);
});

test('conservation holds across many random scenarios', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 500; i++) {
    const n = 1 + Math.floor(rand() * 13);
    const trips = Array.from({ length: n }, (_, j) => ({
      id: `t${j}`,
      budget: 25 * Math.floor(rand() * 40),
      received: rand() < 0.5 ? 0 : Math.round(rand() * 80000) / 100,
    }));
    const gf = Math.round(rand() * 500000) / 100;
    const r = allocate(trips, gf);
    assertConserved(trips, gf, r);
    for (const t of trips) {
      const a = r.trips[t.id];
      assert.ok(cents(a.total) <= cents(t.budget), 'never exceeds budget');
    }
    if (r.unallocatedSurplus > 0) {
      assert.ok(Object.values(r.trips).every((a) => a.funded), 'surplus only when everything is full');
    }
  }
});

test('the real data file allocates cleanly', () => {
  const data = JSON.parse(readFileSync(new URL('../data/trips.json', import.meta.url), 'utf8'));
  const r = allocate(data.trips, data.generalFund);
  assertConserved(data.trips, data.generalFund, r);
  assert.equal(Object.keys(r.trips).length, data.trips.length);
});
