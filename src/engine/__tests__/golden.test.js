// Golden fixtures A–H — expected values confirmed by the builder on 2026-09-26 (plan.md, Gate 2).
// Tolerances: 0.005 dollars on money, 1e-9 on ratios. No intermediate rounding in the engine.
import { describe, it, expect } from 'vitest';
import { evaluateAsset } from '../idgtModel.js';
import { FIXTURES, expectMoney, expectRatio } from './fixtures.js';

const curveNpv = (res, s) => res.npvCurve.find((c) => c.s === s);

describe('Fixture A — death end of year 3 certain', () => {
  const res = evaluateAsset(FIXTURES.A);
  it('no-swap NPV, ΔH_3 and components', () => {
    expectMoney(res.npvNone, -115086.293851);
    expectMoney(res.rows.none[2].dH, -129456.428846);
    expectMoney(res.components.none.freeze, 93399.242837);
    expectMoney(res.components.none.burn, 11512.639844);
    expectMoney(res.components.none.stepUp, -219998.176532);
    expectMoney(res.components.none.giftTax, 0);
    expectMoney(res.components.none.resid, 0);
    expectRatio(res.eff.none, -0.115086293851);
  });
  it('year-3 ledger values (HOLD and GIFT)', () => {
    const r = res.rows.none[2];
    expectMoney(r.V, 1_295_029);
    expectMoney(r.Eb, 21_823_655.228);
    expectMoney(r.Xt, 15_606_000);
    expectMoney(r.ETb, 3_005_073.6912);
    expectMoney(r.Hb, 20_113_610.5368);
    expectMoney(r.ETs, 2_887_062.0912);
    expectMoney(r.SUs, 247_468.028846);
    expectMoney(r.Hs, 19_984_154.107954);
    expectMoney(r.Tself, 1_262_653.614737);
    // Attribution pins (plan.md derivation): freeze = 40% × (self-taxed trust − taxable gift), burn = 40% × (trust − self-taxed trust)
    expectMoney(r.freeze, 105_061.445895);
    expectMoney(r.burnC, 12_950.154105);
  });
  it('swap years 1, 2, 3 and the optimum', () => {
    expectMoney(curveNpv(res, 1).npv, 76099.376264);
    expectMoney(curveNpv(res, 2).npv, 90272.954818);
    expectMoney(curveNpv(res, 3).npv, 104911.882681);
    expect(res.sStar).toBe(3);
    expectMoney(res.npvOpt, 104911.882681);
    expectRatio(res.eff.opt, 0.104911882681);
    expectMoney(res.npvPF, 104911.882681);
  });
});

describe('Fixture B — two-year synthetic table q = [0.3, 0.7]', () => {
  const res = evaluateAsset(FIXTURES.B);
  it('probabilities and horizon', () => {
    expect(res.q).toEqual([0.3, 0.7]);
    expect(res.derived.N).toBe(2);
    expect(res.derived.omega).toBe(2);
    expectRatio(res.derived.expectedDeathYear, 1.7);
  });
  it('NPVs and optimum', () => {
    expectMoney(res.npvNone, -148468.170374);
    expectMoney(curveNpv(res, 1).npv, 49301.949824);
    expectMoney(curveNpv(res, 2).npv, -1248.150888);
    expect(res.sStar).toBe(1);
    expectMoney(res.components.none.freeze, 52874.502189);
    expectMoney(res.components.none.burn, 6204.639822);
    expectMoney(res.components.none.stepUp, -207547.312386);
    expectRatio(res.eff.opt, 0.049301949824);
  });
});

describe('Fixture C — estate below the exclusion', () => {
  const res = evaluateAsset(FIXTURES.C);
  it('only the step-up component is non-zero; deathbed swap recovers it exactly', () => {
    expectMoney(res.npvNone, -219998.176532);
    expectMoney(res.components.none.freeze, 0);
    expectMoney(res.components.none.burn, 0);
    expectMoney(res.components.none.stepUp, -219998.176532);
    expectMoney(curveNpv(res, 3).npv, 0);
    // Not a golden row: with a cash-like, basis-adding consideration (convention C-2) every swap
    // year recovers the step-up exactly in a non-taxable estate, so NPV(1) = NPV(2) = NPV(3) = 0
    // and the tie rule (model.md §8: prefer the smaller s) selects s* = 1.
    expectMoney(curveNpv(res, 1).npv, 0);
    expectMoney(curveNpv(res, 2).npv, 0);
    expect(res.sStar).toBe(1);
  });
});

describe('Fixture D — 30% valuation discount', () => {
  const res = evaluateAsset(FIXTURES.D);
  it('taxable gift 700,000; NPV and efficiency', () => {
    expectMoney(res.derived.Ug, 700_000);
    expectMoney(res.derived.Uc, 700_000);
    expectMoney(res.npvNone, -8406.730810);
    expectMoney(res.components.none.freeze, 200078.805878);
    expectRatio(res.eff.none, -0.012009615443);
    expectRatio(res.effPerFMV.none, -0.008406730810);
  });
});

describe('Fixture E — exclusion exhausted (gift tax, §2035(b), §1015(d)(6))', () => {
  const res = evaluateAsset(FIXTURES.E);
  it('derived constants', () => {
    expectMoney(res.derived.R, 0);
    expectMoney(res.derived.Uc, 0);
    expectMoney(res.derived.G, 400_000);
    expectMoney(res.derived.BT0, 520_000);
  });
  it('NPV inside the 3-year window and components', () => {
    expectMoney(res.npvNone, -66486.110253);
    expectMoney(res.components.none.freeze, 93399.242837);
    expectMoney(res.components.none.burn, 11512.639844);
    expectMoney(res.components.none.giftTax, -19784.151684);
    expectMoney(res.components.none.resid, 0);
    expectMoney(res.components.none.stepUp, -151613.841249);
    expectRatio(res.effPerGiftTax.none, -0.166215275631);
    expectMoney(res.rows.none[2].add2035, 400_000);
  });
});

describe('Fixture E2 — as E, death in year 4 (outside §2035(b))', () => {
  const res = evaluateAsset(FIXTURES.E2);
  it('NPV turns positive; gift-tax component shows the tax-exclusive advantage', () => {
    expectMoney(res.npvNone, 87338.955157);
    expectMoney(res.components.none.giftTax, 111020.160933);
    // reference-derived (fixtures-ref.out), not in the builder-confirmed table:
    expectMoney(res.components.none.freeze, 124707.907579);
    expectMoney(res.components.none.burn, 16020.766493);
    expectMoney(res.components.none.stepUp, -164409.879848);
    expectRatio(res.effPerGiftTax.none, 0.218347387892);
    expectMoney(res.rows.none[3].add2035, 0);
  });
});

describe('Fixture F — prior gifts measured against the 2025 exclusion; partial coverage', () => {
  const res = evaluateAsset(FIXTURES.F);
  it('derived constants and NPV', () => {
    expectMoney(res.derived.Ug, 2_000_000);
    expectMoney(res.derived.R, 1_010_000);
    expectMoney(res.derived.Uc, 1_010_000);
    expectMoney(res.derived.G, 396_000);
    expectMoney(res.derived.BT0, 716_800);
    expectMoney(res.npvNone, -182058.405939);
    expectRatio(res.eff.none, -0.091029202970);
    // reference-derived (fixtures-ref.out), not in the builder-confirmed table:
    expectMoney(res.components.none.freeze, 186798.485674);
    expectMoney(res.components.none.burn, 23025.279688);
    expectMoney(res.components.none.giftTax, -19586.310167);
    expectMoney(res.components.none.stepUp, -372295.861134);
    expectRatio(res.effPerGiftTax.none, -0.459743449342);
  });
});

describe('Fixture G — beneficiary rate includes NIIT (28.8%)', () => {
  const res = evaluateAsset(FIXTURES.G);
  it('step-up cost grows; deathbed swap unchanged', () => {
    expectMoney(res.npvNone, -148526.016684);
    expectMoney(res.components.none.stepUp, -253437.899365); // reference-derived, not in the confirmed table
    expectMoney(curveNpv(res, 3).npv, 104911.882681);
  });
});

describe('Fixture H — sale inside the trust in year 2', () => {
  const res = evaluateAsset(FIXTURES.H);
  it('no-swap NPV and components; post-sale swap excluded; swap in year 1 equals Fixture A', () => {
    expectMoney(res.npvNone, 71945.738466);
    expectMoney(res.components.none.freeze, -27473.069692);
    expectMoney(res.components.none.burn, 107035.754603);
    expectMoney(res.components.none.stepUp, -7616.946445);
    expectMoney(curveNpv(res, 1).npv, 76099.376264);
    expect(curveNpv(res, 2).feasible).toBe(false);
    expect(curveNpv(res, 3).feasible).toBe(false);
    expect(res.sStar).toBe(1);
    const r2 = res.rows.none[1];
    expectMoney(r2.CGs, 0.288 * (1_188_100 - 241_800));
    expectMoney(r2.Bs, 1_188_100);
  });
});
