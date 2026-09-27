// ING (incomplete non-grantor trust — NING/DING/WING) versus IDGT: scenario n of
// docs/changes/2026-09-27-ing-comparison/model.md §3–§5 and §9. Pure functions, no React; decimals in,
// numbers out; money is never rounded.
//
// The ING is funded at t = 0 with the asset. It is an incomplete gift (Reg. §25.2511-2(b): retained testamentary
// limited power of appointment; (c): retained non-fiduciary lifetime power over beneficial enjoyment), so
// U_g = U_c = G = 0. It is a non-grantor trust (§641; §674(a) and §677(a) avoided by the §672(a) adverse-party
// committee, the grantor's HEMS power by §674(b)(5)(A), and §675 by omitting administrative powers — no
// §675(4)(C) swap), so it pays its own income tax at τ^n_ord / τ^n_cg and its administration cost from its
// assets. The entire trust, accumulated income included, is in the gross estate at death (§2038(a)(1),
// §2036(a)(2); Commissioner v. Estate of O'Malley, 383 U.S. 627 (1966)) and is stepped up (§1014(b)(9)).
// No distributions (accumulation trust, N-2), no gift tax, no §2035(b) add-back. When the home state taxes
// the grantor on the ING's income as if it were a grantor trust (N.Y. Tax Law §612(b)(41); Cal. R&TC §17082)
// the grantor pays that state tax from the other estate (σ^g, model.md §1).
//
// HOLD is taken from the v1 simulator (simulate(inp, 0, N)) and never re-implemented here.

import { simulate, evaluateAsset } from './idgtModel.js';
import { makeBases, taxFromBase } from './fedTax.js';
import { validateInputs, validateIngInputs, resolveIngInputs } from './validate.js';
import { SWAP_TIE_TOLERANCE } from './constants.js';

const pos = (x) => Math.max(0, x);

/** Order of the IDGT's components (v1 §7) and the ING's (model.md §4) in the bridge from one NPV to the other. */
export const IDGT_BRIDGE_KEYS = Object.freeze(['freeze', 'burn', 'giftTax', 'resid', 'stepUp']);
export const ING_COMPONENT_KEYS = Object.freeze(['locNet', 'ssNet', 'feeNet', 'stepUp']);

/**
 * One year of a self-taxing accumulation trust (model.md §3). Gross yield, income tax at `tauO` on the yield
 * and the fee `c` on the opening value (not deducted for income tax, N-3) are settled inside the trust.
 *   Y = y V_{t−1} ; Tax = τ Y ; Fee = c V_{t−1} ; V^pre = V_{t−1}(1+g) + Y ; D = Y − Tax − Fee
 *   D ≥ 0: V = V^pre − Tax − Fee ; B += D                      (net cash reinvested adds basis, N-4)
 *   D < 0: the fee beyond the after-tax yield is funded by liquidating L = −D of the holding with pro-rata basis
 *          (Reg. §1.61-6(a)): gain = L·max(0, 1 − B/V^pre), CGL = τ_cg·gain, B ·= (1 − L/V^pre), V = V^pre + D − CGL
 * B never goes negative. Mutates `state` ({V, B}); returns the year's flows.
 */
function stepTrust(state, gt, yt, tauO, tauC, c) {
  const Vprev = state.V;
  const Y = yt * Vprev;
  const tax = tauO * Y;
  const fee = c * Vprev;
  const Vpre = Vprev * (1 + gt) + Y;
  const D = Y - tax - fee;
  let gainL = 0;
  let CGL = 0;
  if (D >= 0) {
    state.V = Vpre - tax - fee;
    state.B += D;
  } else {
    const L = -D;
    gainL = L * pos(1 - state.B / Vpre);
    CGL = tauC * gainL;
    state.B *= 1 - L / Vpre;
    state.V = Vpre + D - CGL;
  }
  return { Y, tax, fee, gainL, CGL };
}

/** Sale at t = S (model.md §3): gain on the trust's basis, tax paid from the trust, basis reset to the proceeds. */
function sellTrust(state, tauC) {
  const gain = pos(state.V - state.B);
  const CG = tauC * gain;
  state.V -= CG;
  state.B = state.V;
  return { gain, CG };
}

/**
 * Year-by-year ING ledger against HOLD over N years with the exact decomposition of model.md §4.
 *
 * Three counterfactual trust paths start at (FMV, B_0) — never at the IDGT ledger's T^self, which carries the
 * §1015(d)(6) basis of a gift the ING never makes — and follow the same recursion and sale rule:
 *   V^same — the grantor's own rates less any grantor-level state tax (τ_ord − σ^g_ord, τ_cg − σ^g_cg), no fee
 *   V^rate — the trust's rates (τ^n_ord, τ^n_cg), no fee
 *   V^n    — the trust's rates and the fee c (the ING itself)
 * Level A: ΔTW + ΔET + ΔSU = ΔH. Wealth split Loc = (E^n − E^b) + (V^same − V^b), SS = V^rate − V^same,
 * Fee = V^n − V^rate. Estate tax is attributed on counterfactual bases (base^b is affine in TE with slope 1,
 * fedTax.js): c0 = base^b(TE^b), c1 = c0 + (E^n − E^b) + (V^same − V^b)·f, c2 = c1 + SS·f, c3 = c2 + Fee·f
 * (= base^b(TE^n)); LocNet + SSNet + FeeNet + StepUp = ΔH exactly.
 *
 * @param {object} inp - flat engine inputs (validated by the caller)
 * @param {number} N - horizon (years)
 */
export function simulateIng(inp, N) {
  const {
    FMV, B0, g, y, S = 0, delta = 0,
    tauOrd, tauCg, tauBene, tauE, rE, pi, X0, P = 0, E0, k = 1, d,
    discountAtDeath = false,
  } = inp;
  const XP = inp.XP ?? X0;
  const gr = inp.gr ?? g;
  const yr = inp.yr ?? y;
  const r = resolveIngInputs(inp);
  const { tauNo, tauNc, sgOrd, sgCg, ingAdminRate: c } = r;
  const vk = Math.pow(1 / (1 + d), k);
  const f = discountAtDeath ? 1 - delta : 1; // inclusion factor at death, as in HOLD (v1 §5)

  const hold = simulate(inp, 0, N); // HOLD side (v1 §4–§5)
  const { Ug, R, Uc } = hold.derived;
  const bases = makeBases({ X0, pi, P, XP, Ug, R, Uc }); // baseHold carries no adjusted taxable gift (§2001(b))

  const same = { V: FMV, B: B0 };
  const rate = { V: FMV, B: B0 };
  const n = { V: FMV, B: B0 };
  let En = E0;

  const rows = [];
  for (let t = 1; t <= N; t += 1) {
    const afterSale = S > 0 && t > S;
    const gt = afterSale ? gr : g;
    const yt = afterSale ? yr : y;

    // 1. growth, yield, tax and fee inside each path (liquidation only when the fee exceeds the after-tax yield)
    stepTrust(same, gt, yt, tauOrd - sgOrd, tauCg - sgCg, 0);
    stepTrust(rate, gt, yt, tauNo, tauNc, 0);
    const { Y: Yn, tax: taxN, fee: feeN, gainL, CGL } = stepTrust(n, gt, yt, tauNo, tauNc, c);

    // 2. scheduled sale (t = S), each path at its own capital-gain rate
    let gainS = 0;
    let CGn = 0;
    if (S > 0 && t === S) {
      sellTrust(same, tauCg - sgCg);
      sellTrust(rate, tauNc);
      ({ gain: gainS, CG: CGn } = sellTrust(n, tauNc));
    }

    // 3. other estate: untouched, except the home-state tax a NY/CA grantor owes on the ING's income and gains
    const grantorStateTax = sgOrd * Yn + sgCg * (gainS + gainL);
    En = En * (1 + rE) - grantorStateTax;

    // 4. death at end of year t (§3)
    const h = hold.rows[t - 1];
    const Vn = n.V;
    const inclN = Vn * f; // the whole trust is in the gross estate at its included value
    const TEn = En + inclN;
    const baseN = bases.baseHold(TEn, t);
    const ETn = taxFromBase(tauE, baseN);
    const SUn = tauBene * (Vn - inclN) * vk; // §1014(b)(9): basis steps to the included value; 0 unless discountAtDeath
    const Hn = En + Vn - ETn - SUn;

    // Level A (§4)
    const dH = Hn - h.Hb;
    const dTW = (En + Vn) - (h.Eb + h.V);
    const dET = h.ETb - ETn;
    const dSU = h.SUb - SUn;

    // Wealth split and estate-tax attribution on counterfactual bases (§4)
    const loc = (En - h.Eb) + (same.V - h.V);
    const ss = rate.V - same.V;
    const fee = Vn - rate.V;
    const c0 = h.baseB;
    const c1 = c0 + (En - h.Eb) + (same.V - h.V) * f;
    const c2 = c1 + ss * f;
    const c3 = c2 + fee * f;
    const locNet = loc - tauE * (pos(c1) - pos(c0));
    const ssNet = ss - tauE * (pos(c2) - pos(c1));
    const feeNet = fee - tauE * (pos(c3) - pos(c2));
    const stepUp = dSU;

    rows.push({
      t, age: inp.age + t, Xt: h.Xt,
      Vn, Bn: n.B, Yn, taxN, feeN, gainL, CGL, gainS, CGn, grantorStateTax, Vsame: same.V, Vrate: rate.V,
      En, inclN, TEn, baseN, ETn, SUn, Hn,
      V: h.V, Eb: h.Eb, ETb: h.ETb, SUb: h.SUb, Hb: h.Hb, // HOLD echoes
      dH, dTW, dET, dSU, loc, ss, fee, locNet, ssNet, feeNet, stepUp,
      DF: h.DF, PV: dH * h.DF,
      // aliases so the ING ledger renders through the v1 LedgerTable column keys
      T: Vn, ETs: ETn, SUs: SUn, Hs: Hn,
    });
  }

  return { rows, derived: { tauNo, tauNc, sgOrd, sgCg, feeRate: c, stateTaxOnGrantor: r.ingStateTaxOnGrantor } };
}

/**
 * The bridge from the IDGT's NPV at its optimal swap year to the ING's NPV (model.md §9): the IDGT's five
 * components are removed one by one (reaching zero), then the ING's four are added. Cumulative positions are
 * computed here so the chart only draws. The last `to` equals NPV^n up to floating-point summation error.
 */
function bridgeSteps(idgt, ingComponents, npvIng) {
  const steps = [];
  let level = idgt.npvOpt;
  for (const key of IDGT_BRIDGE_KEYS) {
    const value = -idgt.components.opt[key];
    steps.push({ key, side: 'IDGT', value, from: level, to: level + value });
    level += value;
  }
  for (const key of ING_COMPONENT_KEYS) {
    const value = ingComponents[key];
    steps.push({ key, side: 'ING', value, from: level, to: level + value });
    level += value;
  }
  return { start: idgt.npvOpt, sStar: idgt.sStar, steps, end: npvIng };
}

/**
 * Full ING evaluation against an IDGT result (model.md §5, §9): NPV^n = Σ q_t DF_t ΔH^n_t, component NPVs
 * under the same operator, the comparison with the IDGT at its optimal fixed swap year and with no swap, the
 * per-year crossover (ΔH^n_t against ΔH^{s*}_t), the bridge and the module's own warnings. Throws on invalid
 * inputs, like evaluateAsset.
 *
 * @param {object} inp - flat engine inputs
 * @param {object} [idgtResult] - evaluateAsset(inp); evaluated here when omitted
 */
export function evaluateIng(inp, idgtResult) {
  const errors = [...validateInputs(inp).errors, ...validateIngInputs(inp)];
  if (errors.length) {
    const e = new Error(`Invalid inputs: ${errors.map((x) => `${x.field}: ${x.message}`).join(' ')}`);
    e.errors = errors;
    throw e;
  }
  const idgt = idgtResult ?? evaluateAsset(inp);
  const { q } = idgt;
  const N = idgt.derived.N;
  const sim = simulateIng(inp, N);
  const optRows = idgt.rows.opt;

  let npv = 0;
  const components = { locNet: 0, ssNet: 0, feeNet: 0, stepUp: 0 };
  const rows = sim.rows.map((r, i) => {
    const w = q[i] * r.DF;
    npv += q[i] * r.PV;
    ING_COMPONENT_KEYS.forEach((key) => { components[key] += w * r[key]; });
    return { ...r, q: q[i], wPV: q[i] * r.PV, dHIdgt: optRows[i].dH };
  });

  // Verdict with the v1 tie tolerance (v1 model.md §8): |Δ| ≤ 1e-6 · max(1, |NPV(s*)|) is a tie.
  const deltaOpt = npv - idgt.npvOpt;
  const deltaNone = npv - idgt.npvNone;
  const tol = SWAP_TIE_TOLERANCE * Math.max(1, Math.abs(idgt.npvOpt));
  let verdict = 'tie';
  if (deltaOpt > tol) verdict = 'ING';
  else if (deltaOpt < -tol) verdict = 'IDGT';
  const ingLeadsYears = rows
    .filter((r) => r.dH > r.dHIdgt + SWAP_TIE_TOLERANCE * Math.max(1, Math.abs(r.dHIdgt)))
    .map((r) => r.t);

  // The ING's own warnings (model.md §8); BURN_REIMBURSED belongs to the IDGT result (validate.js).
  const warnings = [];
  const { tauNo, sgOrd, feeRate } = sim.derived;
  const ingOrdTotal = tauNo + sgOrd; // everything the family pays on a dollar of ING income
  if (ingOrdTotal >= inp.tauOrd - 1e-12) {
    warnings.push({ code: 'ING_NO_STATE_SAVING', data: { ingRate: ingOrdTotal, grantorRate: inp.tauOrd, onGrantor: sim.derived.stateTaxOnGrantor } });
  }
  const netYield = inp.y * (1 - tauNo);
  const postSale = inp.S > 0 && inp.S < N;
  const netYieldPost = postSale ? (inp.yr ?? inp.y) * (1 - tauNo) : Infinity;
  if (feeRate > Math.min(netYield, netYieldPost)) {
    warnings.push({ code: 'ING_FEE_EXCEEDS_YIELD', data: { fee: feeRate, netYield: Math.min(netYield, netYieldPost) } });
  }

  return {
    npv,
    npvPerFMV: npv / inp.FMV, // the ING consumes no exclusion, so NPV per taxable-gift dollar is undefined (§5)
    components,
    rows,
    vsIdgt: {
      deltaOpt, deltaNone, verdict, ingLeadsYears, firstIngYear: ingLeadsYears.length ? ingLeadsYears[0] : null,
      bridge: bridgeSteps(idgt, components, npv),
    },
    derived: {
      ...sim.derived,
      // 0% is right only for intangibles in a no-tax situs (model.md §1); the card states the assumption.
      zeroStateRateAssumption: resolveIngInputs(inp).ingStateRate === 0 && !sim.derived.stateTaxOnGrantor,
    },
    warnings,
  };
}
