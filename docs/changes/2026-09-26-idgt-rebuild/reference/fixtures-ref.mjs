// Reference computation for the CORRECTED spec (judge spec + tax-law/edge corrections).
// Scratchpad only. Not the code under test. Produces candidate golden values for builder confirmation.
//
// Corrections folded in vs. judge's final_spec_ref.mjs:
//  C1  X_t = X0*(1+pi)^(t-1)  (2026 fixed at statutory amount; indexing from 2027)
//  C2  prior gifts measured against their own year's BEA (XP): R = max(0, X0 - min(P,XP));
//      gift tax payable on prior gifts = tauE*max(0, P - XP); anti-clawback floor = min(P,XP)(+Uc in GIFT)
//  C3  Level B relabel: b1 = b0 - (Tself - Ug); b3 = b2 - G/tauE + dTWgt + add2035
//  C4  swap consideration = inclusion value (V or V(1-delta) when discountAtDeath)
//  C5  default swapped-in profile = cash: gSw=0, ySw=rE/(1-tauOrd), tauSw=tauOrd, bSw=1  (neutral, BIG=0)
//  C6  infeasible swap years are NOT executed
//  C7  efficiency denominator = Ug (exemption-equivalent consumed); NPV/G shown when G>0
//  C8  deterministic mode: N := tD

export function simulate(inp, swapYear /* 0 = none */) {
  const {
    FMV, B0, g, y, S = 0, gr = g, yr = y, delta = 0,
    tauOrd, tauCg, tauBene, tauE, d, rE, pi, X0, P = 0, XP = X0, E0, k = 1,
    bSw = 1, discountAtDeath = false, saleAppliesToBaseline = true, N,
    annualExclusions = 0,
  } = inp;
  const gSw = inp.gSw ?? (rE >= 0 ? 0 : rE);
  const ySw = inp.ySw ?? (rE >= 0 ? rE / (1 - tauOrd) : 0); // C-2; r_E < 0: depreciation, no income (math-evals F7)
  const tauSw = inp.tauSw ?? tauOrd;
  const v = 1 / (1 + d);
  const Ug = Math.max(0, FMV * (1 - delta) - annualExclusions); // annual exclusions cannot exceed the gift
  const usedPrior = Math.min(P, XP);
  const R = Math.max(0, X0 - usedPrior);
  const Uc = Math.min(Ug, R);
  const G = tauE * Math.max(0, Ug - R);
  const GTPprior = tauE * Math.max(0, P - XP);
  const BT0 = B0 + (G > 0 && Ug > 0 ? Math.min(G, G * Math.max(0, FMV * (1 - delta) - B0) / Ug) : 0); // §1015(d)(6), Reg. §1.1015-5(c) (corrected 2026-09-27, math-evals F2)
  const Xt = (t) => X0 * Math.pow(1 + pi, t - 1);
  // bases are in taxable-base dollars: subtract gift-tax-payable / tauE, i.e. the taxable gift amounts
  const baseB = (TE, t) => TE + P - Math.max(0, P - XP) - Math.max(Xt(t), usedPrior);
  const baseS = (TE, t) => TE + P + Ug - Math.max(0, P - XP) - Math.max(0, Ug - R) - Math.max(Xt(t), usedPrior + Uc);
  const pos = (x) => Math.max(0, x);

  let V = FMV, Bb = B0, Bs = BT0, Eb = E0, Es = E0 - G;
  let W = 0, WB = 0, swapped = false, Tself = FMV, Bself = BT0;
  const rows = [];
  let infeasible = null;
  for (let t = 1; t <= N; t++) {
    const gt = (S > 0 && t > S) ? gr : g;
    const yt = (S > 0 && t > S) ? yr : y;
    const Vprev = V;
    const Y = yt * Vprev;
    V = Vprev * (1 + gt) + Y;
    const burn = tauOrd * Y;
    Bb += Y; Bs += Y;
    let burnSw = 0;
    if (swapped) {
      const YW = ySw * W;
      W = W * (1 + gSw) + YW;
      WB += YW;
      burnSw = tauSw * YW;
      Tself = Tself * (1 + gSw + ySw * (1 - tauSw));
    } else {
      const ys = yt * (1 - tauOrd) * Tself;
      Bself += ys;
      Tself = Tself * (1 + gt) + ys;
    }
    Eb = Eb * (1 + rE) - burn;
    Es = Es * (1 + rE) - burn - burnSw;
    if (S > 0 && t === S) {
      const CGs = tauCg * Math.max(0, V - Bs); Bs = V; Es -= CGs;
      if (saleAppliesToBaseline) { const CGb = tauCg * Math.max(0, V - Bb); Bb = V; Eb -= CGb; }
      if (!swapped) { const cgSelf = tauCg * Math.max(0, Tself - Bself); Tself -= cgSelf; Bself = Tself; }
    }
    const inclFactor = discountAtDeath ? (1 - delta) : 1;
    if (swapYear === t) {
      const cons = V * inclFactor;
      if (S > 0 && t >= S) infeasible = 'post-sale swap not modelled';
      else if (Es < cons) infeasible = 'insufficient other estate to fund consideration';
      else { W = cons; WB = bSw * cons; Es -= cons; swapped = true; }
    }
    // death at end of year t
    const incl = V * inclFactor;
    const TEb = Eb + incl;
    const b0 = baseB(TEb, t);
    const ETb = tauE * pos(b0);
    const SUb = tauBene * (V - incl) * Math.pow(v, k);
    const Hb = Eb + V - ETb - SUb;
    const T = swapped ? W : V;
    const TB = swapped ? WB : Bs;
    const add2035 = (t <= 3) ? G : 0;
    const TEs = Es + (swapped ? incl : 0) + add2035;
    const b4 = baseS(TEs, t);
    const ETs = tauE * pos(b4);
    const BIG = Math.max(0, T - TB);
    const SUs = tauBene * BIG * Math.pow(v, k) + (swapped ? tauBene * (V - incl) * Math.pow(v, k) : 0);
    const Hs = Es + (swapped ? V : 0) + T - ETs - SUs;
    const dH = Hs - Hb;
    const TWb = Eb + V, TWs = Es + (swapped ? V : 0) + T;
    const dTW = TWs - TWb;
    const dTWgt = -G * Math.pow(1 + rE, t);
    const dTWsw = dTW - dTWgt;
    const dET = ETb - ETs;
    const dSU = SUb - SUs;
    const b1 = b0 - (Tself - Ug);
    const b2 = b1 - (T - Tself);
    const b3 = b2 - (tauE > 0 ? G / tauE : 0) + dTWgt + add2035;
    const freeze = tauE * (pos(b0) - pos(b1));
    const burnC = tauE * (pos(b1) - pos(b2));
    const giftTaxC = tauE * (pos(b2) - pos(b3)) + dTWgt;
    const resid = tauE * (pos(b3) - pos(b4)) + dTWsw;
    const stepUp = dSU;
    const DF = Math.pow(v, t);
    rows.push({ t, Y, V, burn, burnSw, Bb, Bs, Eb, Es, W, WB, Tself, swapped, Xt: Xt(t),
      TEb, b0, ETb, SUb, Hb, T, TB, add2035, TEs, b4, ETs, BIG, SUs, Hs, dH, dTW, dET, dSU,
      b1, b2, b3, freeze, burnC, giftTaxC, resid, stepUp, sum: freeze + burnC + giftTaxC + resid + stepUp, DF, PV: dH * DF });
  }
  return { Ug, R, Uc, G, BT0, GTPprior, rows, infeasible, gSw, ySw, tauSw };
}

export function npv(inp, q, swapYear) {
  const r = simulate(inp, swapYear);
  if (r.infeasible) return { ...r, npv: null, comps: null };
  let total = 0; const comps = { freeze: 0, burn: 0, giftTax: 0, resid: 0, stepUp: 0 };
  r.rows.forEach((row, i) => {
    total += q[i] * row.PV;
    comps.freeze += q[i] * row.DF * row.freeze;
    comps.burn += q[i] * row.DF * row.burnC;
    comps.giftTax += q[i] * row.DF * row.giftTaxC;
    comps.resid += q[i] * row.DF * row.resid;
    comps.stepUp += q[i] * row.DF * row.stepUp;
  });
  return { ...r, npv: total, comps };
}

const f6 = (x) => (x == null ? 'n/a' : x.toFixed(6));
const f2 = (x) => (x == null ? 'n/a' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export const baseInp = {
  FMV: 1_000_000, B0: 200_000, g: 0.07, y: 0.02, S: 0, delta: 0,
  tauOrd: 0.458, tauCg: 0.288, tauBene: 0.25, tauE: 0.40, d: 0.04, rE: 0.03, pi: 0.02,
  X0: 15_000_000, P: 0, E0: 20_000_000, k: 1, N: 3,
};

function report(label, inp, q, swapYears, verbose = true) {
  console.log(`\n==== ${label} ====`);
  const results = {};
  for (const s of swapYears) {
    const r = npv(inp, q, s);
    results[s] = r;
    console.log(`-- s=${s === 0 ? 'none' : s}: Ug=${r.Ug} R=${r.R} Uc=${r.Uc} G=${r.G} BT0=${r.BT0} ySw=${f6(r.ySw)} ${r.infeasible ? 'INFEASIBLE: ' + r.infeasible : ''}`);
    if (r.infeasible) continue;
    if (verbose) for (const row of r.rows) {
      console.log(`   t=${row.t} X_t=${f2(row.Xt)} V=${f2(row.V)} Y=${f2(row.Y)} burn=${f6(row.burn)} burnSw=${f6(row.burnSw)} Eb=${f6(row.Eb)} Es=${f6(row.Es)} W=${f6(row.W)} WB=${f6(row.WB)} Tself=${f6(row.Tself)}`);
      console.log(`        HOLD: TEb=${f6(row.TEb)} b0=${f6(row.b0)} ETb=${f6(row.ETb)} SUb=${f6(row.SUb)} Hb=${f6(row.Hb)}`);
      console.log(`        GIFT: T=${f6(row.T)} TB=${f6(row.TB)} add2035=${f6(row.add2035)} TEs=${f6(row.TEs)} b4=${f6(row.b4)} ETs=${f6(row.ETs)} BIG=${f6(row.BIG)} SUs=${f6(row.SUs)} Hs=${f6(row.Hs)}`);
      console.log(`        dH=${f6(row.dH)} dTW=${f6(row.dTW)} dET=${f6(row.dET)} dSU=${f6(row.dSU)} | freeze=${f6(row.freeze)} burn=${f6(row.burnC)} giftTax=${f6(row.giftTaxC)} resid=${f6(row.resid)} stepUp=${f6(row.stepUp)} sum=${f6(row.sum)} DF=${f6(row.DF)} PV=${f6(row.PV)}`);
    }
    console.log(`   NPV(s=${s === 0 ? 'none' : s}) = ${f6(r.npv)}   comps: freeze=${f6(r.comps.freeze)} burn=${f6(r.comps.burn)} giftTax=${f6(r.comps.giftTax)} resid=${f6(r.comps.resid)} stepUp=${f6(r.comps.stepUp)} sum=${f6(Object.values(r.comps).reduce((a, b) => a + b, 0))}`);
    console.log(`   Eff_Ug = ${(r.npv / r.Ug).toFixed(12)}${r.G > 0 ? '  Eff_G = ' + (r.npv / r.G).toFixed(12) : ''}`);
  }
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('fixtures-ref.mjs')) {
  report('FIXTURE A: death end of year 3 certain (q=[0,0,1])', baseInp, [0, 0, 1], [0, 1, 2, 3]);
  report('FIXTURE B: 2-year synthetic table l=[1000,700,0] q=[0.3,0.7]', { ...baseInp, N: 2 }, [0.3, 0.7], [0, 1, 2]);
  report('FIXTURE C: E0=10,000,000 below exemption', { ...baseInp, E0: 10_000_000 }, [0, 0, 1], [0, 3], false);
  report('FIXTURE D: delta=0.30', { ...baseInp, delta: 0.30 }, [0, 0, 1], [0], false);
  report('FIXTURE E: P=X0=15,000,000 (exhausted in 2026 dollars, XP=X0)', { ...baseInp, P: 15_000_000 }, [0, 0, 1], [0], false);
  report('FIXTURE E2: same, death year 4', { ...baseInp, P: 15_000_000, N: 4 }, [0, 0, 0, 1], [0], false);
  report('FIXTURE F: prior gifts P=13,990,000 made in 2025 (XP=13,990,000), FMV=2,000,000 B0=400,000', { ...baseInp, FMV: 2_000_000, B0: 400_000, P: 13_990_000, XP: 13_990_000 }, [0, 0, 1], [0], true);
  report('FIXTURE G: as A with tauBene=0.288', { ...baseInp, tauBene: 0.288 }, [0, 0, 1], [0, 3], false);
  report('FIXTURE H: sale in trust S=2 (gr=0.03, yr=0), death yr 3', { ...baseInp, S: 2, gr: 0.03, yr: 0 }, [0, 0, 1], [0, 1, 2], true);
}
