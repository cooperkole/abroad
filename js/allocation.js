// Pure money logic: how received money (direct + general fund) maps onto trips.
// Works in whole cents internally; returns dollars (cents / 100) for display.

const toCents = (usd) => Math.round((Number(usd) || 0) * 100);
const toDollars = (cents) => cents / 100;

/**
 * @param {{id:string,budget:number,received:number}[]} trips
 * @param {number} generalFund
 * @returns {{
 *   trips: Record<string,{direct:number,fromGeneral:number,total:number,pct:number,funded:boolean,directPct:number,generalPct:number}>,
 *   totalBudget:number, totalReceived:number, unallocatedSurplus:number, generalFund:number
 * }}
 */
export function allocate(trips, generalFund = 0) {
  const rows = trips.map((t) => {
    const budget = Math.max(0, toCents(t.budget));
    const received = Math.max(0, toCents(t.received));
    const direct = Math.min(received, budget);
    return { id: t.id, budget, direct, overflow: received - direct, fromGeneral: 0 };
  });

  const generalCents = Math.max(0, toCents(generalFund));
  let pool = generalCents + rows.reduce((s, r) => s + r.overflow, 0);
  const need = (r) => r.budget - r.direct - r.fromGeneral;

  // Water-fill: split evenly across unfilled trips, cap at each trip's need,
  // and keep redistributing the leftover until the pool or the needs run out.
  let open = rows.filter((r) => need(r) > 0);
  while (pool > 0 && open.length > 0) {
    const share = Math.floor(pool / open.length);
    if (share === 0) {
      // Fewer cents left than open trips: hand out one cent each, in trip order.
      for (const r of open) {
        if (pool === 0) break;
        r.fromGeneral += 1;
        pool -= 1;
      }
    } else {
      for (const r of open) {
        const give = Math.min(share, need(r));
        r.fromGeneral += give;
        pool -= give;
      }
    }
    open = open.filter((r) => need(r) > 0);
  }

  const out = {};
  let totalBudget = 0;
  for (const r of rows) {
    const total = r.direct + r.fromGeneral;
    totalBudget += r.budget;
    out[r.id] = {
      direct: toDollars(r.direct),
      fromGeneral: toDollars(r.fromGeneral),
      total: toDollars(total),
      pct: r.budget > 0 ? (total / r.budget) * 100 : 100,
      directPct: r.budget > 0 ? (r.direct / r.budget) * 100 : 0,
      generalPct: r.budget > 0 ? (r.fromGeneral / r.budget) * 100 : 0,
      funded: total >= r.budget,
    };
  }

  const totalReceived = generalCents + rows.reduce((s, r) => s + r.direct + r.overflow, 0);
  return {
    trips: out,
    totalBudget: toDollars(totalBudget),
    totalReceived: toDollars(totalReceived),
    unallocatedSurplus: toDollars(pool),
    generalFund: toDollars(generalCents),
  };
}
