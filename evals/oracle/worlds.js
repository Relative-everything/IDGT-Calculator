// CLEAN-ROOM ORACLE — cash-flow simulation of the three worlds (keep, gift to an IDGT, place in an ING).
//
// Structure is intentionally unlike src/engine/idgtModel.js: each world is a set of LOTS (value, basis, owner,
// return profile) plus the grantor's other estate E. Each year every lot earns growth and a cash yield; the
// OWNER of the lot decides who pays the income tax on that yield and how the cash is reinvested. Death is valued
// by the statute layer (./statute.js). Nothing here reads docs/changes/*/model.md formulas; where the calculator
// has a documented convention (C-1…C-9, N-1…N-8), the convention is implemented from its plain-English statement
// and named in a comment so the eval report can separate "convention" from "error".
//
// Ownership rules (tax law):
//   'grantor'  — the grantor owns the lot: pays all tax on its income and gains from E; §1014 step-up at death.
//   'idgt'     — grantor trust (§§671–677): the grantor is the taxpayer; with a reimbursement clause
//                (Rev. Rul. 2004-64) the trustee reimburses a share (1 − φ) from the trust's own cash;
//                no step-up at death (Rev. Rul. 2023-2): heirs inherit the trust's carryover basis.
//   'ing'      — non-grantor trust (§641): pays its own tax at the trust stack and its fee; included in the
//                estate and stepped up (§§2038, 1014(b)(9)). NY/CA: the grantor also pays home-state tax on
//                its income from E.

import { estateTax, giftTaxSequence, doneeBasis } from './statute.js';

const pos = (x) => Math.max(0, x);

/** Inputs with the calculator's documented defaults resolved (a null means "use the default"). */
export function resolve(inp) {
  const tauOrd = inp.tauOrd;
  const niit = inp.niit ?? 0;
  const ingFedOrd = inp.ingFedOrd ?? 0.37;
  const ingFedLtcg = inp.ingFedLtcg ?? 0.20;
  const ingStateRate = inp.ingStateRate ?? 0;
  const onGrantor = inp.ingStateTaxOnGrantor ?? false;
  return {
    ...inp,
    S: inp.S ?? 0,
    delta: inp.delta ?? 0,
    annualExclusions: inp.annualExclusions ?? 0,
    P: inp.P ?? 0,
    XP: inp.XP ?? inp.X0,
    k: inp.k ?? 1,
    gr: inp.gr ?? inp.g,
    yr: inp.yr ?? inp.y,
    discountAtDeath: inp.discountAtDeath ?? false,
    saleAppliesToBaseline: inp.saleAppliesToBaseline ?? true,
    // C-2: default consideration earns the other-estate rate after the grantor's tax — cash-like income when that
    // rate is positive, depreciation with no income when it is negative (no instrument yields a tax refund)
    bSw: inp.bSw ?? 1,
    gSw: inp.gSw ?? (inp.rE >= 0 ? 0 : inp.rE),
    ySw: inp.ySw ?? (inp.rE >= 0 ? inp.rE / (1 - tauOrd) : 0),
    tauSw: inp.tauSw ?? tauOrd,
    phi: inp.burnShare ?? 1,
    ingOrd: ingFedOrd + niit + ingStateRate,
    ingCg: ingFedLtcg + niit + ingStateRate,
    ingFee: inp.ingAdminRate ?? 0,
    grantorStateOrdOnIng: onGrantor ? (inp.stateOrd ?? 0) : 0,
    grantorStateCgOnIng: onGrantor ? (inp.stateCg ?? 0) : 0,
  };
}

/** Transfer-tax facts fixed at the gift date (t = 0). */
export function giftFacts(r) {
  const giftFmv = r.FMV * (1 - r.delta); // FMV of the gifted interest (valuation discount applies to the interest)
  const Ug = pos(giftFmv - r.annualExclusions); // §2503(b): excluded amounts are not "included in total gifts"
  const prior = r.P > 0 ? [{ amount: r.P, bea: r.XP }] : [];
  const seq = giftTaxSequence([...prior, { amount: Ug, bea: r.X0 }], r.tauE);
  const cur = seq[seq.length - 1];
  const priorUsed = prior.length ? seq[0].beaUsed : 0;
  const G = cur.tax;
  return {
    Ug,
    R: pos(r.X0 - priorUsed),
    Uc: cur.beaUsed,
    G,
    BT0: doneeBasis({ donorBasis: r.B0, giftFmv, amountOfGift: Ug, giftTaxPaid: G }),
    priorGifts: prior,
    allGifts: Ug > 0 ? [...prior, { amount: Ug, bea: r.X0 }] : prior,
  };
}

const assetRates = (r, t) => (r.S > 0 && t > r.S ? { g: r.gr, y: r.yr } : { g: r.g, y: r.y });

/**
 * One year of income on a lot owned by `owner`. Returns the tax the grantor pays from E this year.
 * Mutates the lot. The trust never needs to liquidate for its share of a grantor trust's tax (τ < 1);
 * the ING may, when its fee exceeds its after-tax yield.
 */
function earn(lot, g, y, r) {
  const open = lot.value;
  const cash = y * open; // yield received in cash at year-end
  const grown = open * (1 + g); // the holding itself, before the yield cash is reinvested
  if (lot.owner === 'grantor') {
    const tax = lot.tax * cash;
    lot.value = grown + cash; // C-1: gross yield reinvested; tax paid from E
    lot.basis += cash;
    return { fromE: tax };
  }
  if (lot.owner === 'idgt') {
    const tax = lot.tax * cash;
    const trustShare = (1 - r.phi) * tax; // reimbursed from the yield cash
    lot.value = grown + cash - trustShare;
    lot.basis += cash - trustShare;
    return { fromE: r.phi * tax };
  }
  // 'ing' — trust pays its own tax and fee (fee not deductible, N-3); NY/CA grantor pays home-state tax from E
  const trustTax = r.ingOrd * cash;
  const fee = r.ingFee * open;
  const need = trustTax + fee;
  let fromE = r.grantorStateOrdOnIng * cash;
  if (cash >= need) {
    lot.value = grown + (cash - need);
    lot.basis += cash - need;
    return { fromE, liquidated: false };
  } else {
    // All of the yield cash is spent; the shortfall is raised by selling a slice of the holding. The slice
    // bears its pro-rata basis (Reg. §1.61-6(a)) and its gain is taxed inside the trust, so the slice must be
    // grossed up to net the shortfall after that tax.
    const shortfall = need - cash;
    const gainShare = pos(1 - lot.basis / grown);
    const sold = shortfall / (1 - r.ingCg * gainShare);
    const gain = sold * gainShare;
    lot.basis *= 1 - sold / grown;
    lot.value = grown - sold;
    fromE += r.grantorStateCgOnIng * gain;
  }
  return { fromE, liquidated: true };
}

/** Scheduled sale of the asset lot at t = S. Returns the tax charged to E. */
function sell(lot, r) {
  const gain = pos(lot.value - lot.basis);
  let fromE = 0;
  if (lot.owner === 'grantor') {
    fromE = r.tauCg * gain; // grantor's own sale
  } else if (lot.owner === 'idgt') {
    const tax = r.tauCg * gain; // Rev. Rul. 85-13: grantor is the taxpayer on the trust's sale
    fromE = r.phi * tax;
    lot.value -= (1 - r.phi) * tax; // N-6: reimbursed share paid from the proceeds
  } else {
    lot.value -= r.ingCg * gain;
    fromE = r.grantorStateCgOnIng * gain;
  }
  lot.basis = lot.value;
  return fromE;
}

function valueAtDeath({ E, lots, t, r, lifetimeGifts, add2035 }) {
  const f = r.discountAtDeath ? 1 - r.delta : 1;
  const inclusion = (lot) => (lot.isAsset ? lot.value * f : lot.value);
  const inEstate = lots.filter((l) => l.owner === 'grantor' || l.owner === 'ing');
  const outside = lots.filter((l) => l.owner === 'idgt');
  const grossEstate = E + inEstate.reduce((a, l) => a + inclusion(l), 0) + add2035;
  const beaAtDeath = r.X0 * (1 + r.pi) ** (t - 1); // 2026 statutory; indexed from 2027 (C-7: no round-down)
  const ET = estateTax({ grossEstate, lifetimeGifts, beaAtDeath, topRate: r.tauE });
  const vk = (1 + r.d) ** -r.k; // heirs sell k years after death (C-8)
  const cgtStepped = inEstate.reduce((a, l) => a + r.tauBene * pos(l.value - inclusion(l)), 0) * vk; // §1014: basis = estate value
  const cgtCarry = outside.reduce((a, l) => a + r.tauBene * pos(l.value - l.basis), 0) * vk; // no step-up in the IDGT
  const wealth = E + lots.reduce((a, l) => a + l.value, 0);
  return { grossEstate, ET, CGT: cgtStepped + cgtCarry, H: wealth - ET - cgtStepped - cgtCarry, wealth, beaAtDeath };
}

/** HOLD: the grantor keeps the asset. Rows indexed by death year t = 1..N. */
export function worldHold(inp, N) {
  const r = resolve(inp);
  const facts = giftFacts(r);
  const asset = { owner: 'grantor', value: r.FMV, basis: r.B0, tax: r.tauOrd, isAsset: true };
  let E = r.E0;
  const rows = [];
  for (let t = 1; t <= N; t += 1) {
    const { g, y } = assetRates(r, t);
    const { fromE } = earn(asset, g, y, r);
    E = E * (1 + r.rE) - fromE;
    if (r.S > 0 && t === r.S && r.saleAppliesToBaseline) E -= sell(asset, r);
    const d = valueAtDeath({ E, lots: [asset], t, r, lifetimeGifts: facts.priorGifts, add2035: 0 });
    rows.push({ t, E, V: asset.value, B: asset.basis, ...d });
  }
  return { rows, facts };
}

/** GIFT[s]: gift to the IDGT at t = 0; swap at the end of year s (0 = never). */
export function worldGift(inp, N, s) {
  const r = resolve(inp);
  const facts = giftFacts(r);
  const asset = { owner: 'idgt', value: r.FMV, basis: facts.BT0, tax: r.tauOrd, isAsset: true };
  const lots = [asset];
  let E = r.E0 - facts.G; // C-5: gift tax paid at t = 0 (§2502(c): by the donor)
  let infeasible = null;
  const rows = [];
  for (let t = 1; t <= N; t += 1) {
    const { g, y } = assetRates(r, t);
    let fromE = 0;
    for (const lot of lots) {
      const rates = lot.isAsset ? { g, y } : { g: r.gSw, y: r.ySw };
      fromE += earn(lot, rates.g, rates.y, r).fromE;
    }
    E = E * (1 + r.rE) - fromE;
    if (r.S > 0 && t === r.S) E -= sell(asset, r);
    if (s === t) {
      const f = r.discountAtDeath ? 1 - r.delta : 1;
      const price = asset.value * f; // §675(4)(C): property of equivalent value
      if (r.S > 0 && t >= r.S) infeasible = 'post-sale';
      else if (E < price) infeasible = 'liquidity';
      else {
        E -= price;
        asset.owner = 'grantor'; // Rev. Rul. 85-13: no gain; grantor takes the trust's basis
        lots.push({ owner: 'idgt', value: price, basis: r.bSw * price, tax: r.tauSw, isAsset: false });
      }
    }
    const add2035 = t <= 3 ? facts.G : 0; // §2035(b); C-4: death at the end of year 3 is within 3 years
    const d = valueAtDeath({ E, lots, t, r, lifetimeGifts: facts.allGifts, add2035 });
    const trustLot = lots.length > 1 ? lots[1] : asset;
    rows.push({ t, E, Vs: asset.value, Bs: asset.basis, T: trustLot.value, swapped: asset.owner === 'grantor', add2035, ...d });
  }
  return { rows, facts, infeasible };
}

/** ING: incomplete gift to a non-grantor trust at t = 0. */
export function worldIng(inp, N) {
  const r = resolve(inp);
  const facts = giftFacts(r);
  const trust = { owner: 'ing', value: r.FMV, basis: r.B0, tax: r.ingOrd, isAsset: true };
  let E = r.E0;
  const rows = [];
  for (let t = 1; t <= N; t += 1) {
    const { g, y } = assetRates(r, t);
    const { fromE, liquidated } = earn(trust, g, y, r);
    E = E * (1 + r.rE) - fromE;
    if (r.S > 0 && t === r.S) E -= sell(trust, r);
    const d = valueAtDeath({ E, lots: [trust], t, r, lifetimeGifts: facts.priorGifts, add2035: 0 });
    rows.push({ t, E, Vn: trust.value, Bn: trust.basis, liquidated, ...d });
  }
  return { rows };
}
