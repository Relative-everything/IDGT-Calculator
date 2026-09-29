// CLEAN-ROOM ORACLE — transfer-tax statute layer.
//
// Written from the Internal Revenue Code and regulations, NOT from docs/changes/*/model.md and NOT from
// src/engine. It deliberately does not use the engine's "taxable base" shortcut (flat τ_e above the
// exclusion, constants cancelled algebraically). Every tax here is computed the long way:
//   §2001(c)  tentative tax from the full bracket schedule (restated below from the statute text)
//   §2502(a)  gift tax = tentative tax on cumulative gifts − tentative tax on prior cumulative gifts
//   §2505     unified credit for the year of the gift, less credits allowable in preceding periods
//   §2001(b)  estate tax = tentative tax(taxable estate + adjusted taxable gifts)
//                          − gift tax payable on post-1976 gifts (rates at death, §2001(g)(1))
//                          − §2010 applicable credit (anti-clawback, Reg. §20.2010-1(c))
//   §1015(d)(6) basis increase for gift tax on net appreciation, capped at the tax paid.
// If the engine's algebra is right, the two agree to floating-point precision on every input.

// IRC §2001(c) (as amended by ATRA 2012): rate schedule on the cumulative taxable amount.
// [threshold over which, marginal rate]
const SCHEDULE_2001C = [
  [0, 0.18], [10_000, 0.20], [20_000, 0.22], [40_000, 0.24], [60_000, 0.26], [80_000, 0.28],
  [100_000, 0.30], [150_000, 0.32], [250_000, 0.34], [500_000, 0.37], [750_000, 0.39], [1_000_000, 0.40],
];

/**
 * §2001(c) tentative tax. `topRate` replaces the 40% top bracket for legislative scenarios in which the
 * user edits the transfer-tax rate (the calculator's τ_e input); at 0.40 this is the statute exactly.
 */
export function tentativeTax(amount, topRate = 0.40) {
  if (!(amount > 0)) return 0;
  let tax = 0;
  for (let i = 0; i < SCHEDULE_2001C.length; i += 1) {
    const [lo, rate] = SCHEDULE_2001C[i];
    const hi = i + 1 < SCHEDULE_2001C.length ? SCHEDULE_2001C[i + 1][0] : Infinity;
    if (amount <= lo) break;
    const r = i === SCHEDULE_2001C.length - 1 ? topRate : rate;
    tax += (Math.min(amount, hi) - lo) * r;
  }
  return tax;
}

/**
 * Gift tax on a sequence of calendar-period gifts, each with the basic exclusion amount (BEA) of its year.
 * §2502(a): tax for the period = TT(cumulative incl. this period) − TT(cumulative before it).
 * §2505(a): credit = credit on the BEA of that year − sum of credits allowable for preceding periods;
 * §2505(c): the credit cannot exceed the tax.
 * Also tracks the BEA actually used by each period (Reg. §20.2010-1(c)(2): the portion of the gift sheltered
 * by the exclusion), needed for the anti-clawback rule at death.
 *
 * @param {{amount:number, bea:number}[]} periods  taxable gifts (after annual exclusions) in time order
 * @param {number} topRate
 * @returns {{tax:number, credit:number, beaUsed:number}[]}
 */
export function giftTaxSequence(periods, topRate) {
  let cumulative = 0;
  let creditsBefore = 0;
  let beaUsedBefore = 0;
  return periods.map(({ amount, bea }) => {
    const tentative = tentativeTax(cumulative + amount, topRate) - tentativeTax(cumulative, topRate);
    const available = Math.max(0, tentativeTax(bea, topRate) - creditsBefore);
    const credit = Math.min(tentative, available);
    const tax = tentative - credit;
    const beaUsed = Math.min(amount, Math.max(0, bea - beaUsedBefore));
    cumulative += amount;
    creditsBefore += credit;
    beaUsedBefore += beaUsed;
    return { tax, credit, beaUsed };
  });
}

/**
 * §2001(b) federal estate tax.
 * @param {object} p
 * @param {number} p.grossEstate         taxable estate (gross estate less any deduction, e.g. the marital deduction)
 * @param {{amount:number, bea:number}[]} p.lifetimeGifts  post-1976 taxable gifts not included in the gross estate
 * @param {number} p.beaAtDeath          §2010(c)(3) basic exclusion amount for the year of death
 * @param {number} p.topRate
 * @param {number} [p.dsue]              deceased spousal unused exclusion ported to this decedent (§2010(c)(2)(B))
 */
export function estateTax({ grossEstate, lifetimeGifts, beaAtDeath, topRate, dsue = 0 }) {
  const adjustedTaxableGifts = lifetimeGifts.reduce((a, g) => a + g.amount, 0);
  const tentative = tentativeTax(grossEstate + adjustedTaxableGifts, topRate);
  // §2001(b)(2), (g)(1): gift tax that would have been payable on those gifts at the date-of-death rates.
  const seq = giftTaxSequence(lifetimeGifts, topRate);
  const giftTaxPayable = seq.reduce((a, g) => a + g.tax, 0);
  // §2010(c) applicable exclusion = BEA + DSUE; Reg. §20.2010-1(c) anti-clawback raises the BEA part to the BEA
  // allowable on the lifetime gifts when that is greater. The credit is the tentative tax on the applicable exclusion.
  const beaUsedByGifts = seq.reduce((a, g) => a + g.beaUsed, 0);
  const credit = tentativeTax(Math.max(beaAtDeath, beaUsedByGifts) + dsue, topRate);
  return Math.max(0, tentative - giftTaxPayable - credit);
}

/**
 * Reg. §20.2010-2(c): the DSUE a decedent leaves the surviving spouse (portability, §2010(c)(4)) is the lesser of
 * (i) the BEA in effect in the year of death and (ii) the decedent's applicable exclusion amount less the sum of the
 * taxable estate and the adjusted taxable gifts — the latter reduced, for this purpose only, by the amounts on which
 * gift tax was paid ((c)(2)), i.e. counting only the part of each gift the exclusion sheltered.
 */
export function dsueLeft({ taxableEstate, lifetimeGifts, beaAtDeath, topRate }) {
  const seq = giftTaxSequence(lifetimeGifts, topRate);
  const sheltered = seq.reduce((a, g) => a + g.beaUsed, 0);
  const applicable = Math.max(beaAtDeath, sheltered);
  return Math.max(0, Math.min(beaAtDeath, applicable - (taxableEstate + sheltered)));
}

/**
 * First death with everything passing to the surviving spouse (§2056(a)). Items that cannot pass to the spouse (the
 * §2035(b) gift-tax add-back) stay taxable, and the estate tax is paid out of the property that would otherwise pass,
 * so the marital deduction is the value passing NET of that tax (§2056(b)(4)(A)). Solved by fixed-point iteration on
 * taxable estate = non-marital items + tax (converges geometrically at rate τ_e).
 * @returns {{ tax:number, taxableEstate:number }}
 */
export function firstDeathWithMaritalDeduction({ nonMaritalItems, lifetimeGifts, beaAtDeath, topRate }) {
  let tax = 0;
  for (let k = 0; k < 200; k += 1) {
    const next = estateTax({ grossEstate: nonMaritalItems + tax, lifetimeGifts, beaAtDeath, topRate });
    if (Math.abs(next - tax) <= 1e-9) { tax = next; break; }
    tax = next;
  }
  return { tax, taxableEstate: nonMaritalItems + tax };
}

/**
 * §1015(a), (d)(6): donee basis = donor basis + gift tax × net appreciation / amount of the gift, where net
 * appreciation = FMV of the gifted interest − donor basis (Reg. §1.1015-5(c)(2)) and the amount of the gift is
 * the amount after the §2503(b) annual exclusion (Reg. §1.1015-5(c)(3)); the increase may not exceed the tax paid.
 */
export function doneeBasis({ donorBasis, giftFmv, amountOfGift, giftTaxPaid }) {
  if (!(giftTaxPaid > 0) || !(amountOfGift > 0)) return donorBasis;
  const netAppreciation = Math.max(0, giftFmv - donorBasis);
  return donorBasis + Math.min(giftTaxPaid, giftTaxPaid * (netAppreciation / amountOfGift));
}
