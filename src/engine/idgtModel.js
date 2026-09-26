// IDGT gift model v1 — heir-wealth ledger (docs/changes/2026-09-26-idgt-rebuild/model.md).
// Pure functions, no React. Inputs are decimals; money is never rounded inside the engine.
//
// One simulator, two scenarios per possible death year t:
//   HOLD    — asset stays in the grantor's estate; §1014 step-up at death.
//   GIFT[s] — asset gifted to the IDGT at t = 0 (§§671–677 grantor pays the trust's income tax;
//             Rev. Rul. 2004-64), optional §675(4)(C) swap at end of year s (Rev. Rul. 85-13,
//             Rev. Rul. 2008-22); no §1014 in trust (Rev. Rul. 2023-2); §1015 carryover basis.
// NPV(s) = Σ_t q_t · DF_t · (H^gift_t − H^hold_t). Components (freeze / burn / gift tax / residual /
// step-up) are derived from the ledger by telescoping on counterfactual tax bases and sum exactly.
// Return-neutral convention (model.md §0.2): gross yield is reinvested in the holding and the income
// tax is paid from the other estate in BOTH scenarios.

import { deriveGift, makeBases, taxFromBase } from './fedTax.js';
import { deathProbabilities, expectedDeathYear } from './mortality.js';
import { validateInputs } from './validate.js';
import { SECTION_2035_WINDOW_YEARS, SWAP_TIE_TOLERANCE } from './constants.js';

export const SWAP_INFEASIBLE_POST_SALE = 'post-sale swap not modelled in v1';
export const SWAP_INFEASIBLE_LIQUIDITY = 'other estate cannot fund the swap consideration';

/**
 * Consideration profile for the swap. Defaults are cash-like and return-neutral (model.md C-2):
 * basis 100%, no appreciation, gross yield r_E/(1 − τ_ord) taxed to the grantor at τ_ord, so the
 * consideration compounds at r_E after tax exactly like the other estate.
 */
export function resolveSwapProfile(inp) {
  const tauSw = inp.tauSw ?? inp.tauOrd;
  return {
    bSw: inp.bSw ?? 1,
    gSw: inp.gSw ?? 0,
    ySw: inp.ySw ?? inp.rE / (1 - inp.tauOrd),
    tauSw,
  };
}

/**
 * Run the year-by-year ledger for HOLD and GIFT[swapYear] over N years.
 *
 * @param {object} inp - flat engine inputs (see validate.js)
 * @param {number} swapYear - 0 = no swap, otherwise the end-of-year swap year
 * @param {number} N - horizon (years); death at the end of each year t ≤ N is valued
 * @returns {{ derived:object, rows:object[], infeasible:string|null, swapYear:number }}
 */
export function simulate(inp, swapYear, N) {
  const {
    FMV, B0, g, y, S = 0, delta = 0, annualExclusions = 0,
    tauOrd, tauCg, tauBene, tauE, d, rE, pi, X0, P = 0, E0, k = 1,
    discountAtDeath = false, saleAppliesToBaseline = true,
  } = inp;
  const XP = inp.XP ?? X0;
  const gr = inp.gr ?? g;
  const yr = inp.yr ?? y;
  const { bSw, gSw, ySw, tauSw } = resolveSwapProfile(inp);
  const v = 1 / (1 + d);
  const vk = Math.pow(v, k);

  const gift = deriveGift({ FMV, delta, annualExclusions, B0, X0, P, XP, tauE });
  const { Ug, R, Uc, G, BT0 } = gift;
  const bases = makeBases({ X0, pi, P, XP, Ug, R, Uc });
  const pos = (x) => Math.max(0, x);

  // State (end of year 0)
  let V = FMV; // holding value (same path in both scenarios)
  let Bb = B0; // HOLD basis
  let Bs = BT0; // GIFT basis (trust; §1015(d)(6) bump when gift tax paid)
  let Eb = E0; // other estate, HOLD
  let Es = E0 - G; // other estate, GIFT (gift tax paid at t = 0, convention C-5)
  let W = 0; // swapped-in consideration value (trust)
  let WB = 0; // its basis
  let swapped = false;
  let Tself = FMV; // display-only counterfactual: trust that paid its own income tax
  let Bself = BT0;
  let infeasible = null;

  const rows = [];
  for (let t = 1; t <= N; t += 1) {
    const afterSale = S > 0 && t > S;
    const gt = afterSale ? gr : g;
    const yt = afterSale ? yr : y;

    // 1. growth and gross yield reinvested (both scenarios)
    const Vprev = V;
    const Y = yt * Vprev;
    V = Vprev * (1 + gt) + Y;
    const burn = tauOrd * Y; // income tax on the yield, paid from E in both scenarios (§671 in GIFT)
    Bb += Y;
    Bs += Y;

    // consideration held by the trust (only after a swap)
    let burnSw = 0;
    if (swapped) {
      const YW = ySw * W;
      W = W * (1 + gSw) + YW;
      WB += YW;
      burnSw = tauSw * YW;
      Tself *= 1 + gSw + (1 - tauSw) * ySw;
    } else {
      const yAfterTax = yt * (1 - tauOrd) * Tself;
      Bself += yAfterTax;
      Tself = Tself * (1 + gt) + yAfterTax;
    }

    // 2. other estate rolls forward and pays the burn
    Eb = Eb * (1 + rE) - burn;
    Es = Es * (1 + rE) - burn - burnSw;

    // 3. scheduled sale of the holding (t = S): gain on carryover basis, grantor pays (Rev. Rul. 85-13)
    let CGb = 0;
    let CGs = 0;
    if (S > 0 && t === S) {
      CGs = tauCg * pos(V - Bs);
      Bs = V;
      Es -= CGs;
      if (saleAppliesToBaseline) {
        CGb = tauCg * pos(V - Bb);
        Bb = V;
        Eb -= CGb;
      }
      if (!swapped) {
        const cgSelf = tauCg * pos(Tself - Bself);
        Tself -= cgSelf;
        Bself = Tself;
      }
    }

    // 4. swap (t = s): grantor substitutes consideration of equivalent value (§675(4)(C))
    const inclFactor = discountAtDeath ? 1 - delta : 1;
    let swapEvent = null;
    if (swapYear === t) {
      const consideration = V * inclFactor;
      if (S > 0 && t >= S) infeasible = SWAP_INFEASIBLE_POST_SALE;
      else if (Es < consideration) infeasible = SWAP_INFEASIBLE_LIQUIDITY;
      else {
        W = consideration;
        WB = bSw * consideration;
        Es -= consideration;
        swapped = true;
        swapEvent = { consideration, basis: WB };
      }
    }

    // 5. death at end of year t
    const incl = V * inclFactor; // estate-tax inclusion value of the interest
    const Xt = bases.exclusionAt(t);

    // HOLD
    const TEb = Eb + incl;
    const baseB = bases.baseHold(TEb, t);
    const ETb = taxFromBase(tauE, baseB);
    const SUb = tauBene * (V - incl) * vk; // heirs' basis steps only to the included value
    const Hb = Eb + V - ETb - SUb;

    // GIFT
    const T = swapped ? W : V; // trust holding
    const TB = swapped ? WB : Bs; // trust basis
    const add2035 = t <= SECTION_2035_WINDOW_YEARS ? G : 0; // §2035(b) gross-up of gift tax paid
    const TEs = Es + (swapped ? incl : 0) + add2035;
    const baseS = bases.baseGift(TEs, t);
    const ETs = taxFromBase(tauE, baseS);
    const BIG = pos(T - TB); // built-in gain in trust, no §1014
    const SUs = tauBene * BIG * vk + (swapped ? tauBene * (V - incl) * vk : 0);
    const Hs = Es + (swapped ? V : 0) + T - ETs - SUs;

    const dH = Hs - Hb;

    // Level A identity
    const TWb = Eb + V;
    const TWs = Es + (swapped ? V : 0) + T;
    const dTW = TWs - TWb;
    const dTWgt = -G * Math.pow(1 + rE, t); // gift-tax drag on pre-tax wealth
    const dTWsw = dTW - dTWgt; // non-neutral swap / sale differential
    const dET = ETb - ETs;
    const dSU = SUb - SUs;

    // Level B attribution on counterfactual bases (model.md §7)
    const b0 = baseB;
    const b4 = baseS;
    const b1 = b0 - (Tself - Ug);
    const b2 = b1 - (T - Tself);
    const b3 = b2 - G / tauE + dTWgt + add2035;
    const freeze = tauE * (pos(b0) - pos(b1));
    const burnC = tauE * (pos(b1) - pos(b2));
    const giftTaxC = tauE * (pos(b2) - pos(b3)) + dTWgt;
    const resid = tauE * (pos(b3) - pos(b4)) + dTWsw;
    const stepUp = dSU;

    const DF = Math.pow(v, t);
    rows.push({
      t, age: inp.age + t, Xt, Y, V, burn, burnSw, CGb, CGs, Bb, Bs, Eb, Es, W, WB, Tself, swapped, swapEvent, incl,
      TEb, baseB, ETb, SUb, Hb, T, TB, add2035, TEs, baseS, ETs, BIG, SUs, Hs,
      dH, dTW, dTWgt, dTWsw, dET, dSU, freeze, burnC, giftTaxC, resid, stepUp,
      DF, PV: dH * DF,
    });
  }

  return {
    derived: { ...gift, swapProfile: { bSw, gSw, ySw, tauSw } },
    rows,
    infeasible,
    swapYear,
  };
}

const COMPONENT_KEYS = ['freeze', 'burnC', 'giftTaxC', 'resid', 'stepUp'];

/** Probability-weighted NPV and component NPVs of a ledger. */
export function aggregate(rows, q) {
  let npv = 0;
  const components = { freeze: 0, burn: 0, giftTax: 0, resid: 0, stepUp: 0 };
  const names = ['freeze', 'burn', 'giftTax', 'resid', 'stepUp'];
  rows.forEach((row, i) => {
    const w = q[i] * row.DF;
    npv += q[i] * row.PV;
    COMPONENT_KEYS.forEach((key, j) => { components[names[j]] += w * row[key]; });
  });
  return { npv, components };
}

/**
 * Full evaluation of one asset: no-swap NPV, NPV curve over every feasible swap year, optimum,
 * deathbed-swap bound, efficiency ratios, components, warnings. Throws on invalid inputs.
 */
export function evaluateAsset(inp) {
  const { errors, warnings } = validateInputs(inp);
  if (errors.length) {
    const e = new Error(`Invalid inputs: ${errors.map((x) => `${x.field}: ${x.message}`).join(' ')}`);
    e.errors = errors;
    throw e;
  }
  const mort = deathProbabilities({ lx: inp.lx, age: inp.age, deathYearOverride: inp.deathYearOverride ?? null });
  const { q, N, omega } = mort;
  const allWarnings = [...warnings];
  mort.warnings.forEach((code) => allWarnings.push({ code, data: {} }));

  const none = simulate(inp, 0, N);
  const noneAgg = aggregate(none.rows, q);
  const tol = (ref) => SWAP_TIE_TOLERANCE * Math.max(1, Math.abs(ref));
  const curve = [{ s: 0, npv: noneAgg.npv, feasible: true, reason: null }];
  const diagPV = new Array(N);
  let best = { s: 0, npv: noneAgg.npv, sim: none, agg: noneAgg };
  for (let s = 1; s <= N; s += 1) {
    const sim = simulate(inp, s, N);
    if (sim.infeasible) {
      curve.push({ s, npv: null, feasible: false, reason: sim.infeasible });
      diagPV[s - 1] = none.rows[s - 1].PV;
      continue;
    }
    const agg = aggregate(sim.rows, q);
    curve.push({ s, npv: agg.npv, feasible: true, reason: null });
    diagPV[s - 1] = sim.rows[s - 1].PV;
    if (agg.npv > best.npv + tol(best.npv)) best = { s, npv: agg.npv, sim, agg };
  }
  const npvPF = diagPV.reduce((acc, pv, i) => acc + q[i] * pv, 0);

  const { Ug, G } = none.derived;
  const eff = (npv) => (Ug > 0 ? npv / Ug : null);
  const effGT = (npv) => (G > 0 ? npv / G : null);
  if (!(Ug > 0)) allWarnings.push({ code: 'ZERO_TAXABLE_GIFT', data: {} });
  if (inp.S > N) allWarnings.push({ code: 'SALE_BEYOND_HORIZON', data: { S: inp.S, N } });
  // Liquidity: report the first year the other estate is exhausted and how likely the grantor is to reach it.
  const firstNegative = (rows) => rows.find((r) => r.Es < 0);
  const negNone = firstNegative(none.rows);
  const negOpt = best.s > 0 ? firstNegative(best.sim.rows) : null;
  const neg = negNone && negOpt ? (negOpt.t <= negNone.t ? negOpt : negNone) : (negNone ?? negOpt);
  if (neg) {
    const survival = q.slice(neg.t - 1).reduce((a, b) => a + b, 0);
    const inSwapScenario = neg === negOpt && negOpt !== negNone;
    allWarnings.push({
      code: 'GRANTOR_ILLIQUID',
      data: { year: neg.t, age: inp.age + neg.t, survival, swapYear: inSwapScenario ? best.s : 0, giftTaxPaid: G > 0 },
    });
  }

  const attach = (sim) => sim.rows.map((r, i) => ({ ...r, q: q[i], wPV: q[i] * r.PV }));
  const rowsOpt = attach(best.sim);
  let shareBeyondDisplay = null;
  if (Number.isInteger(inp.NDisp) && inp.NDisp > 0) {
    const total = rowsOpt.reduce((a, r) => a + Math.abs(r.wPV), 0);
    const beyond = rowsOpt.filter((r) => r.t > inp.NDisp).reduce((a, r) => a + Math.abs(r.wPV), 0);
    shareBeyondDisplay = total > 0 ? beyond / total : 0;
  }

  return {
    derived: { ...none.derived, N, omega, expectedDeathYear: expectedDeathYear(q) },
    q,
    rows: { none: attach(none), opt: rowsOpt },
    npvCurve: curve,
    npvNone: noneAgg.npv,
    npvOpt: best.npv,
    sStar: best.s,
    npvPF,
    eff: { none: eff(noneAgg.npv), opt: eff(best.npv) },
    effPerGiftTax: { none: effGT(noneAgg.npv), opt: effGT(best.npv) },
    effPerFMV: { none: noneAgg.npv / inp.FMV, opt: best.npv / inp.FMV },
    components: { none: noneAgg.components, opt: best.agg.components },
    shareBeyondDisplay,
    warnings: allWarnings,
  };
}
