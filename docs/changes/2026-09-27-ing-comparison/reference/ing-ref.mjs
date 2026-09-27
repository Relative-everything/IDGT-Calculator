// Reference computation for the ING-comparison module (docs/changes/2026-09-27-ing-comparison/model.md).
// Written from the contract text BEFORE the engine change and kept independent of src/engine — it is
// NOT the code under test. Produces candidate golden values for builder confirmation (plan.md).
//
// Implements: v1 ledger (docs/changes/2026-09-26-idgt-rebuild/reference/fixtures-ref.mjs, ported) with the
// partial-burn share φ of model.md §2, the ING scenario of §3, and the ING decomposition of §4.
// Run: node ing-ref.mjs > ing-ref.out

const pos = (x) => Math.max(0, x);

/** v1 IDGT ledger with the burn share φ (model.md §2). swapYear 0 = none. */
export function simulateIdgt(inp, swapYear) {
  const {
    FMV, B0, g, y, S = 0, gr = g, yr = y, delta = 0,
    tauOrd, tauCg, tauBene, tauE, d, rE, pi, X0, P = 0, XP = X0, E0, k = 1,
    bSw = 1, discountAtDeath = false, saleAppliesToBaseline = true, N,
    annualExclusions = 0, burnShare = 1,
  } = inp;
  const phi = burnShare;
  const gSw = inp.gSw ?? 0;
  const ySw = inp.ySw ?? rE / (1 - tauOrd);
  const tauSw = inp.tauSw ?? tauOrd;
  const v = 1 / (1 + d);
  const vk = Math.pow(v, k);
  const Ug = Math.max(0, FMV * (1 - delta) - annualExclusions);
  const usedPrior = Math.min(P, XP);
  const R = Math.max(0, X0 - usedPrior);
  const Uc = Math.min(Ug, R);
  const G = tauE * Math.max(0, Ug - R);
  const BT0 = B0 + (G > 0 && Ug > 0 ? G * Math.max(0, Ug - B0) / Ug : 0);
  const Xt = (t) => X0 * Math.pow(1 + pi, t - 1);
  const baseB = (TE, t) => TE + P - Math.max(0, P - XP) - Math.max(Xt(t), usedPrior);
  const baseS = (TE, t) => TE + P + Ug - Math.max(0, P - XP) - Math.max(0, Ug - R) - Math.max(Xt(t), usedPrior + Uc);
  const f = discountAtDeath ? 1 - delta : 1;

  let Vb = FMV, Bb = B0, Eb = E0;            // HOLD
  let Vs = FMV, Bs = BT0, Es = E0 - G;       // GIFT: the trust's (then the grantor's, after a swap) asset
  let W = 0, WB = 0, swapped = false;
  let Tself = FMV, Bself = BT0;
  const rows = [];
  let infeasible = null;
  for (let t = 1; t <= N; t += 1) {
    const gt = (S > 0 && t > S) ? gr : g;
    const yt = (S > 0 && t > S) ? yr : y;
    // 1. growth and yield
    const Yb = yt * Vb;
    Vb = Vb * (1 + gt) + Yb;
    Bb += Yb;
    const burnB = tauOrd * Yb;
    const Ys = yt * Vs;
    const burnS = tauOrd * Ys;
    let burnSw = 0;
    let trustPaid = 0;   // paid by the trust from its own assets this year
    let grantorPaid = 0; // paid by the grantor from E^s this year
    if (!swapped) {
      trustPaid += (1 - phi) * burnS;
      grantorPaid += phi * burnS;
      Vs = Vs * (1 + gt) + Ys - (1 - phi) * burnS;
      Bs += Ys - (1 - phi) * burnS;
      const yAfter = (1 - tauOrd) * yt * Tself;
      Bself += yAfter;
      Tself = Tself * (1 + gt) + yAfter;
    } else {
      grantorPaid += burnS; // grantor owns the asset
      Vs = Vs * (1 + gt) + Ys;
      Bs += Ys;
      const YW = ySw * W;
      burnSw = tauSw * YW;
      W = W * (1 + gSw) + YW - (1 - phi) * burnSw;
      WB += YW - (1 - phi) * burnSw;
      grantorPaid += phi * burnSw;
      trustPaid += (1 - phi) * burnSw;
      Tself *= 1 + gSw + (1 - tauSw) * ySw;
    }
    // 2. other estate
    Eb = Eb * (1 + rE) - burnB;
    Es = Es * (1 + rE) - grantorPaid;
    // 3. scheduled sale
    let CGb = 0, CGs = 0;
    if (S > 0 && t === S) {
      CGs = tauCg * pos(Vs - Bs);
      if (!swapped) { Es -= phi * CGs; Vs -= (1 - phi) * CGs; } else { Es -= CGs; }
      Bs = Vs;
      if (saleAppliesToBaseline) { CGb = tauCg * pos(Vb - Bb); Bb = Vb; Eb -= CGb; }
      if (!swapped) { const cgSelf = tauCg * pos(Tself - Bself); Tself -= cgSelf; Bself = Tself; }
    }
    // 4. swap
    if (swapYear === t) {
      const cons = Vs * f;
      if (S > 0 && t >= S) infeasible = 'post-sale swap not modelled';
      else if (Es < cons) infeasible = 'insufficient other estate to fund consideration';
      else { W = cons; WB = bSw * cons; Es -= cons; swapped = true; }
    }
    // 5. death
    const inclB = Vb * f;
    const TEb = Eb + inclB;
    const b0 = baseB(TEb, t);
    const ETb = tauE * pos(b0);
    const SUb = tauBene * (Vb - inclB) * vk;
    const Hb = Eb + Vb - ETb - SUb;
    const inclS = Vs * f;
    const T = swapped ? W : Vs;
    const TB = swapped ? WB : Bs;
    const add2035 = t <= 3 ? G : 0;
    const TEs = Es + (swapped ? inclS : 0) + add2035;
    const b4 = baseS(TEs, t);
    const ETs = tauE * pos(b4);
    const BIG = pos(T - TB);
    const SUs = tauBene * BIG * vk + (swapped ? tauBene * (Vs - inclS) * vk : 0);
    const Hs = Es + (swapped ? Vs : 0) + T - ETs - SUs;
    const dH = Hs - Hb;
    const TWb = Eb + Vb, TWs = Es + (swapped ? Vs : 0) + T;
    const dTW = TWs - TWb;
    const dTWgt = -G * Math.pow(1 + rE, t);
    const dTWsw = dTW - dTWgt;
    const dET = ETb - ETs;
    const dSU = SUb - SUs;
    const b1 = b0 - (Tself - Ug);
    const fSw = swapped ? f : 1; // model.md §2 amendment to v1 §7: discount haircut on the consideration goes to Resid
    const b2 = b1 - (T - fSw * Tself);
    const b3 = b2 - (tauE > 0 ? G / tauE : 0) + dTWgt + add2035;
    const freeze = tauE * (pos(b0) - pos(b1));
    const burnC = tauE * (pos(b1) - pos(b2));
    const giftTaxC = tauE * (pos(b2) - pos(b3)) + dTWgt;
    const resid = tauE * (pos(b3) - pos(b4)) + dTWsw;
    const stepUp = dSU;
    const DF = Math.pow(v, t);
    rows.push({ t, Xt: Xt(t), Vb, Bb, Eb, Vs, Bs, Es, Ys, burnS, trustPaid, grantorPaid, burnSw, W, WB, Tself, swapped, CGb, CGs,
      TEb, b0, ETb, SUb, Hb, T, TB, add2035, TEs, b4, ETs, BIG, SUs, Hs, dH, dTW, dTWgt, dTWsw, dET, dSU,
      b1, b2, b3, freeze, burnC, giftTaxC, resid, stepUp, sum: freeze + burnC + giftTaxC + resid + stepUp, DF, PV: dH * DF });
  }
  return { Ug, R, Uc, G, BT0, rows, infeasible };
}

/** One self-taxed trust path (model.md §3 recursion) with rates (tauO, tauC) and fee c.
 *  A fee beyond the after-tax yield liquidates a slice with pro-rata basis (Reg. §1.61-6(a)) and a taxable gain. */
function trustPath(inp, tauO, tauC, c) {
  const { FMV, B0, g, y, S = 0, gr = g, yr = y, N } = inp;
  let V = FMV, B = B0;
  const out = [];
  for (let t = 1; t <= N; t += 1) {
    const gt = (S > 0 && t > S) ? gr : g;
    const yt = (S > 0 && t > S) ? yr : y;
    const Y = yt * V;
    const tax = tauO * Y;
    const fee = c * V;
    const Vpre = V * (1 + gt) + Y;
    const D = Y - tax - fee;
    let gainL = 0, CGL = 0;
    if (D >= 0) { V = Vpre - tax - fee; B += D; }
    else {
      const L = -D;
      gainL = L * Math.max(0, 1 - B / Vpre);
      CGL = tauC * gainL;
      B = B * (1 - L / Vpre);
      V = Vpre + D - CGL;
    }
    let gainS = 0, CG = 0;
    if (S > 0 && t === S) { gainS = pos(V - B); CG = tauC * gainS; V -= CG; B = V; }
    out.push({ t, V, B, Y, tax, fee, gainL, CGL, gainS, CG });
  }
  return out;
}

/** ING scenario and decomposition (model.md §3–§4). Uses the HOLD side from simulateIdgt(inp, 0). */
export function simulateIng(inp) {
  const { tauOrd, tauCg, tauBene, tauE, d, rE, E0, k = 1, delta = 0, discountAtDeath = false, N,
    ingFedOrd, ingFedLtcg, ingStateRate, ingAdminRate = 0, niit, stateOrd = 0, stateCg = 0, ingStateTaxOnGrantor = false } = inp;
  const tauNo = ingFedOrd + niit + ingStateRate;
  const tauNc = ingFedLtcg + niit + ingStateRate;
  const sgOrd = ingStateTaxOnGrantor ? stateOrd : 0; // grantor-level home-state tax on the ING (NY §612(b)(41); CA §17082)
  const sgCg = ingStateTaxOnGrantor ? stateCg : 0;
  const v = 1 / (1 + d);
  const vk = Math.pow(v, k);
  const f = discountAtDeath ? 1 - delta : 1;
  const hold = simulateIdgt({ ...inp, burnShare: 1 }, 0);
  const same = trustPath(inp, tauOrd - sgOrd, tauCg - sgCg, 0);
  const rate = trustPath(inp, tauNo, tauNc, 0);
  const ing = trustPath(inp, tauNo, tauNc, ingAdminRate);
  const usedPrior = Math.min(inp.P ?? 0, inp.XP ?? inp.X0);
  const baseB = (TE, t) => TE + (inp.P ?? 0) - Math.max(0, (inp.P ?? 0) - (inp.XP ?? inp.X0)) - Math.max(inp.X0 * Math.pow(1 + inp.pi, t - 1), usedPrior);
  const rows = [];
  let En = E0;
  for (let t = 1; t <= N; t += 1) {
    const h = hold.rows[t - 1];
    const r = ing[t - 1];
    En = En * (1 + rE) - sgOrd * r.Y - sgCg * (r.gainS + r.gainL);
    const Vn = r.V, Bn = r.B;
    const Vsame = same[t - 1].V, Vrate = rate[t - 1].V;
    const inclN = Vn * f;
    const TEn = En + inclN;
    const baseN = baseB(TEn, t);
    const ETn = tauE * pos(baseN);
    const SUn = tauBene * (Vn - inclN) * vk;
    const Hn = En + Vn - ETn - SUn;
    const dH = Hn - h.Hb;
    const dTW = (En + Vn) - (h.Eb + h.Vb);
    const dET = h.ETb - ETn;
    const dSU = h.SUb - SUn;
    const loc = (En - h.Eb) + (Vsame - h.Vb);
    const ss = Vrate - Vsame;
    const fee = Vn - Vrate;
    const c0 = h.b0;
    const c1 = c0 + (En - h.Eb) + (Vsame - h.Vb) * f;
    const c2 = c1 + ss * f;
    const c3 = c2 + fee * f;
    const locNet = loc - tauE * (pos(c1) - pos(c0));
    const ssNet = ss - tauE * (pos(c2) - pos(c1));
    const feeNet = fee - tauE * (pos(c3) - pos(c2));
    const stepUp = dSU;
    const DF = Math.pow(v, t);
    rows.push({ t, Xt: h.Xt, Vb: h.Vb, Eb: h.Eb, Hb: h.Hb, ETb: h.ETb, Yn: r.Y, taxN: r.tax, feeN: r.fee, gainL: r.gainL, CGL: r.CGL, CGn: r.CG,
      Vn, Bn, Vsame, Vrate, En, inclN, TEn, baseN, c3check: c3 - baseN, ETn, SUn, Hn, dH, dTW, dET, dSU, loc, ss, fee, locNet, ssNet, feeNet, stepUp,
      sum: locNet + ssNet + feeNet + stepUp, DF, PV: dH * DF });
  }
  return { rows, tauNo, tauNc };
}

export function npvIdgt(inp, q, s) {
  const r = simulateIdgt(inp, s);
  if (r.infeasible) return { ...r, npv: null, comps: null };
  let total = 0; const comps = { freeze: 0, burn: 0, giftTax: 0, resid: 0, stepUp: 0 };
  r.rows.forEach((row, i) => {
    total += q[i] * row.PV;
    comps.freeze += q[i] * row.DF * row.freeze; comps.burn += q[i] * row.DF * row.burnC; comps.giftTax += q[i] * row.DF * row.giftTaxC;
    comps.resid += q[i] * row.DF * row.resid; comps.stepUp += q[i] * row.DF * row.stepUp;
  });
  return { ...r, npv: total, comps };
}

export function npvIng(inp, q) {
  const r = simulateIng(inp);
  let total = 0; const comps = { locNet: 0, ssNet: 0, feeNet: 0, stepUp: 0 };
  r.rows.forEach((row, i) => {
    total += q[i] * row.PV;
    comps.locNet += q[i] * row.DF * row.locNet; comps.ssNet += q[i] * row.DF * row.ssNet;
    comps.feeNet += q[i] * row.DF * row.feeNet; comps.stepUp += q[i] * row.DF * row.stepUp;
  });
  return { ...r, npv: total, comps };
}

const f6 = (x) => (x == null ? 'n/a' : x.toFixed(6));
const f2 = (x) => (x == null ? 'n/a' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Fixture A base (v1) + the new fields at their defaults.
export const baseInp = {
  FMV: 1_000_000, B0: 200_000, g: 0.07, y: 0.02, S: 0, delta: 0,
  tauOrd: 0.458, tauCg: 0.288, tauBene: 0.25, tauE: 0.40, d: 0.04, rE: 0.03, pi: 0.02,
  X0: 15_000_000, P: 0, E0: 20_000_000, k: 1, N: 3,
  stateOrd: 0.05, stateCg: 0.05, niit: 0.038,
  ingFedOrd: 0.37, ingFedLtcg: 0.20, ingStateRate: 0, ingAdminRate: 0, ingStateTaxOnGrantor: false, burnShare: 1,
};

function reportIdgt(label, inp, q, swapYears, verbose = true) {
  console.log(`\n==== ${label} ====`);
  const out = {};
  for (const s of swapYears) {
    const r = npvIdgt(inp, q, s);
    out[s] = r;
    console.log(`-- s=${s === 0 ? 'none' : s}: Ug=${r.Ug} R=${r.R} Uc=${r.Uc} G=${r.G} BT0=${r.BT0} phi=${inp.burnShare} ${r.infeasible ? 'INFEASIBLE: ' + r.infeasible : ''}`);
    if (r.infeasible) continue;
    if (verbose) for (const row of r.rows) {
      console.log(`   t=${row.t} X_t=${f2(row.Xt)} Vb=${f6(row.Vb)} Eb=${f6(row.Eb)} | Vs=${f6(row.Vs)} Bs=${f6(row.Bs)} Es=${f6(row.Es)} Ys=${f6(row.Ys)} burnS=${f6(row.burnS)} trustPaid=${f6(row.trustPaid)} grantorPaid=${f6(row.grantorPaid)} burnSw=${f6(row.burnSw)} W=${f6(row.W)} WB=${f6(row.WB)} Tself=${f6(row.Tself)} CGs=${f6(row.CGs)}`);
      console.log(`        HOLD: TEb=${f6(row.TEb)} b0=${f6(row.b0)} ETb=${f6(row.ETb)} SUb=${f6(row.SUb)} Hb=${f6(row.Hb)}`);
      console.log(`        GIFT: T=${f6(row.T)} TB=${f6(row.TB)} add2035=${f6(row.add2035)} TEs=${f6(row.TEs)} b4=${f6(row.b4)} ETs=${f6(row.ETs)} BIG=${f6(row.BIG)} SUs=${f6(row.SUs)} Hs=${f6(row.Hs)}`);
      console.log(`        dH=${f6(row.dH)} dTW=${f6(row.dTW)} dET=${f6(row.dET)} dSU=${f6(row.dSU)} | b1=${f6(row.b1)} b2=${f6(row.b2)} b3=${f6(row.b3)} freeze=${f6(row.freeze)} burn=${f6(row.burnC)} giftTax=${f6(row.giftTaxC)} resid=${f6(row.resid)} stepUp=${f6(row.stepUp)} sum=${f6(row.sum)} DF=${f6(row.DF)} PV=${f6(row.PV)}`);
    }
    console.log(`   NPV(s=${s === 0 ? 'none' : s}) = ${f6(r.npv)}   comps: freeze=${f6(r.comps.freeze)} burn=${f6(r.comps.burn)} giftTax=${f6(r.comps.giftTax)} resid=${f6(r.comps.resid)} stepUp=${f6(r.comps.stepUp)} sum=${f6(Object.values(r.comps).reduce((a, b) => a + b, 0))}`);
    if (r.Ug > 0) console.log(`   Eff_Ug = ${(r.npv / r.Ug).toFixed(12)}`);
  }
  return out;
}

function reportIng(label, inp, q, verbose = true) {
  console.log(`\n==== ${label} ====`);
  const r = npvIng(inp, q);
  console.log(`-- ING rates: tau_n_ord=${f6(r.tauNo)} tau_n_cg=${f6(r.tauNc)} fee=${inp.ingAdminRate}`);
  if (verbose) for (const row of r.rows) {
    console.log(`   t=${row.t} X_t=${f2(row.Xt)} Vb=${f6(row.Vb)} Eb=${f6(row.Eb)} | Yn=${f6(row.Yn)} taxN=${f6(row.taxN)} feeN=${f6(row.feeN)} gainL=${f6(row.gainL)} CGL=${f6(row.CGL)} CGn=${f6(row.CGn)} Vn=${f6(row.Vn)} Bn=${f6(row.Bn)} Vsame=${f6(row.Vsame)} Vrate=${f6(row.Vrate)} En=${f6(row.En)}`);
    console.log(`        ING: inclN=${f6(row.inclN)} TEn=${f6(row.TEn)} baseN=${f6(row.baseN)} (c3-baseN=${row.c3check.toExponential(2)}) ETn=${f6(row.ETn)} SUn=${f6(row.SUn)} Hn=${f6(row.Hn)}  HOLD: ETb=${f6(row.ETb)} Hb=${f6(row.Hb)}`);
    console.log(`        dH=${f6(row.dH)} dTW=${f6(row.dTW)} dET=${f6(row.dET)} dSU=${f6(row.dSU)} | loc=${f6(row.loc)} ss=${f6(row.ss)} fee=${f6(row.fee)} -> locNet=${f6(row.locNet)} ssNet=${f6(row.ssNet)} feeNet=${f6(row.feeNet)} stepUp=${f6(row.stepUp)} sum=${f6(row.sum)} DF=${f6(row.DF)} PV=${f6(row.PV)}`);
  }
  console.log(`   NPV_ING = ${f6(r.npv)}   comps: locNet=${f6(r.comps.locNet)} ssNet=${f6(r.comps.ssNet)} feeNet=${f6(r.comps.feeNet)} stepUp=${f6(r.comps.stepUp)} sum=${f6(Object.values(r.comps).reduce((a, b) => a + b, 0))}`);
  console.log(`   NPV_ING / FMV = ${(r.npv / inp.FMV).toFixed(12)}`);
  return r;
}

if (process.argv[1] && process.argv[1].endsWith('ing-ref.mjs')) {
  const q3 = [0, 0, 1];
  // Fixture I: ING on the Fixture A base; grantor state 5% on both stacks; ING state 0; no fee; death end of year 3.
  const I = reportIng('FIXTURE I: ING, death end of year 3 certain (grantor state 5%/5%, ING state 0%, fee 0)', baseInp, q3);
  const A = reportIdgt('FIXTURE A (v1, phi=1) for the comparison: IDGT s=none and s=3', baseInp, q3, [0, 3], false);
  console.log(`   Delta_none = NPV_ING - NPV(none) = ${f6(I.npv - A[0].npv)} ; Delta_opt(s=3) = ${f6(I.npv - A[3].npv)}`);
  // Fixture J: IDGT with phi = 0.5 on the Fixture A base; s = none, 1, 2, 3.
  reportIdgt('FIXTURE J: IDGT with burn share phi=0.5, death end of year 3 certain', { ...baseInp, burnShare: 0.5 }, q3, [0, 1, 2, 3], true);
  // Machine-only companions (not hand-derived): sale in year 2 for both structures; phi = 0 identity check; fee.
  reportIng('FIXTURE I2 (machine): ING with a sale in year 2 (gr 3%, yr 0)', { ...baseInp, S: 2, gr: 0.03, yr: 0 }, q3);
  reportIdgt('FIXTURE J2 (machine): IDGT phi=0.5 with a sale in year 2 (gr 3%, yr 0)', { ...baseInp, burnShare: 0.5, S: 2, gr: 0.03, yr: 0 }, q3, [0, 1], true);
  const J0 = reportIdgt('CHECK: phi=0 (trust pays all) -> burn component must be exactly 0; T must equal Tself', { ...baseInp, burnShare: 0 }, q3, [0], true);
  console.log(`   max |T - Tself| over years = ${Math.max(...J0[0].rows.map((r) => Math.abs(r.T - r.Tself))).toExponential(3)}`);
  reportIng('FIXTURE I3 (machine): ING with a 0.5% administration fee', { ...baseInp, ingAdminRate: 0.005 }, q3);
  reportIng('FIXTURE I4 (machine): ING, estate below the exclusion (E0 = 10,000,000): dH must equal dTW', { ...baseInp, E0: 10_000_000 }, q3);
  reportIng('FIXTURE I5 (machine): ING, fee 1% beyond the after-tax yield (y 0.5%, basis 0), sale in year 3 — pro-rata basis, liquidation gain', { ...baseInp, B0: 0, y: 0.005, ingAdminRate: 0.01, S: 3, gr: 0.03, yr: 0 }, q3);
  const I6 = reportIng('FIXTURE I6 (machine): ING with the home state taxing the grantor (NY/CA flag): ssNet must be 0, E^n carries the state burn', { ...baseInp, ingStateTaxOnGrantor: true }, q3);
  console.log(`   max |ssNet| = ${Math.max(...I6.rows.map((r) => Math.abs(r.ssNet))).toExponential(3)}`);
  const J3 = reportIdgt('CHECK J3: phi=0, swap s=1, delta 30% with discountAtDeath -> burn must be exactly 0 (v1 §7 b2 amendment)', { ...baseInp, burnShare: 0, delta: 0.30, discountAtDeath: true, N: 3 }, q3, [1], false);
  console.log(`   max |burn_t| = ${Math.max(...J3[1].rows.map((r) => Math.abs(r.burnC))).toExponential(3)}; resid_3 = ${f6(J3[1].rows[2].resid)}; sum check = ${Math.max(...J3[1].rows.map((r) => Math.abs(r.sum - r.dH))).toExponential(3)}`);
}
