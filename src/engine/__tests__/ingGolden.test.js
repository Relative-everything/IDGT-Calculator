// ING comparison golden values — REFERENCE-DERIVED; AWAITING BUILDER CONFIRMATION.
// Source: docs/changes/2026-09-27-ing-comparison/plan.md "Golden values" (hand-derived in plain English there)
// and reference/ing-ref.mjs → ing-ref.out (independent of the code under test). Rows marked "machine" in the
// plan are reference-computed only. Tolerances: 0.005 dollars on money, 1e-9 on ratios.
import { describe, it, expect } from 'vitest';
import { evaluateAsset, simulate } from '../idgtModel.js';
import { evaluateIng } from '../ingModel.js';
import { ING_FIXTURES, expectMoney, expectRatio } from './fixtures.js';

const run = (inp) => {
  const idgt = evaluateAsset(inp);
  return { idgt, ing: evaluateIng(inp, idgt) };
};
const curveNpv = (res, s) => res.npvCurve.find((c) => c.s === s).npv;

describe('Fixture I — ING, death at the end of year 3 (grantor state 5%, ING state 0%, no fee)', () => {
  const { idgt, ing } = run(ING_FIXTURES.I);
  it('NPV, components and NPV per dollar of FMV', () => {
    expectMoney(ing.npv, 1_076.010384);
    expectMoney(ing.components.locNet, -795.089858);
    expectMoney(ing.components.ssNet, 1_871.100242);
    expectMoney(ing.components.feeNet, 0);
    expectMoney(ing.components.stepUp, 0);
    expectRatio(ing.npvPerFMV, 0.001076010384);
    expectRatio(ing.derived.tauNo, 0.408);
    expectRatio(ing.derived.tauNc, 0.238);
  });
  it('year-3 ING ledger', () => {
    const r = ing.rows[2];
    expectMoney(r.Vn, 1_266_161.503574);
    expectMoney(r.Bn, 238_506.258582);
    expectMoney(r.En, 21_854_540);
    expectMoney(r.TEn, 23_120_701.503574);
    expectMoney(r.ETn, 3_005_880.601429);
    expectMoney(r.Hn, 20_114_820.902144);
    expectMoney(r.Vsame, 1_262_653.614737);
    expectMoney(r.loc, -1_490.613263);
    expectMoney(r.ss, 3_507.888837);
    expectMoney(r.dH, 1_210.365344);
  });
  it('year-2 ING ledger (plan.md derivation)', () => {
    const r = ing.rows[1];
    expectMoney(r.Vn, 1_170_377.7856);
    expectMoney(r.ss, 2_162.68);
    expectMoney(r.loc, -465.6944);
    expectMoney(r.dH, 1_018.19136);
  });
  it('against Fixture A: ING beats the IDGT without a swap, loses to the deathbed swap', () => {
    expectMoney(ing.vsIdgt.deltaNone, 116_162.304234);
    expectMoney(ing.vsIdgt.deltaOpt, -103_835.872297);
    expect(ing.vsIdgt.verdict).toBe('IDGT');
    expect(idgt.sStar).toBe(3);
  });
});

describe('Fixture J — IDGT, the grantor bears half the burn (φ = 0.5), death at the end of year 3', () => {
  const { idgt } = run(ING_FIXTURES.J);
  it('no-swap NPV and components', () => {
    expectMoney(idgt.npvNone, -121_047.460419);
    expectMoney(idgt.components.none.freeze, 93_399.242837);
    expectMoney(idgt.components.none.burn, 5_732.030901);
    expectMoney(idgt.components.none.giftTax, 0);
    expectMoney(idgt.components.none.resid, -398.113766);
    expectMoney(idgt.components.none.stepUp, -219_780.620391);
    expectRatio(idgt.eff.none, -0.121047460419);
  });
  it('year-3 ledger, s = none', () => {
    const r = idgt.rows.none[2];
    expectMoney(r.Vs, 1_278_773.002756);
    expectMoney(r.Bs, 250_324.042408);
    expectMoney(r.Es, 21_839_164.852172);
    expectMoney(r.ETs, 2_893_265.940869);
    expectMoney(r.SUs, 247_223.307776);
    expectMoney(r.Hs, 19_977_448.606283);
    expectMoney(r.dH, -136_161.930517);
    expectMoney(r.freeze, 105_061.445895);
    expectMoney(r.burnC, 6_447.755208);
    expectMoney(r.resid, -447.823843);
    // HOLD is untouched by φ
    expectMoney(r.V, 1_295_029);
    expectMoney(r.Hb, 20_113_610.5368);
  });
  it('year 1: the trustee reimburses half of the 9,160 tax', () => {
    const r = idgt.rows.none[0];
    expectMoney(r.Vs, 1_085_420);
    expectMoney(r.Es, 20_595_420);
    expectMoney(r.trustPaid, 4_580);
    expectMoney(r.grantorPaid, 4_580);
    expectMoney(r.burnC, 1_832);
  });
  it('swap years 1, 2, 3 and the optimum', () => {
    expectMoney(curveNpv(idgt, 1), 63_757.925604);
    expectMoney(curveNpv(idgt, 2), 80_825.529573);
    expectMoney(curveNpv(idgt, 3), 98_733.159973);
    expect(idgt.sStar).toBe(3);
  });
});

describe('φ = 0 — the trust pays all of its own tax', () => {
  const { idgt } = run(ING_FIXTURES.PHI0);
  it('burn component exactly zero, trust value equals the self-taxed counterfactual in every year', () => {
    expectMoney(idgt.npvNone, -126_959.538847);
    expect(idgt.components.none.burn).toBe(0);
    for (const r of idgt.rows.none) {
      expect(r.burnC).toBe(0);
      expect(r.T).toBe(r.Tself);
    }
  });
});

describe('machine rows (reference-computed; plan.md)', () => {
  it('I2 — ING with a sale in year 2', () => {
    const { ing } = run(ING_FIXTURES.I2);
    expectMoney(ing.npv, 27_001.861098);
    expectMoney(ing.components.ssNet, 27_156.258250);
    expectMoney(ing.components.locNet, -154.397152);
  });
  it('J2 — IDGT φ = 0.5 with the same sale', () => {
    const { idgt } = run(ING_FIXTURES.J2);
    expectMoney(idgt.npvNone, 19_263.263580);
    expectMoney(curveNpv(idgt, 1), 63_944.031426);
  });
  it('I3 — ING with a 0.5% fee', () => {
    const { ing } = run(ING_FIXTURES.I3);
    expectMoney(ing.npv, -8_244.931766);
    expectMoney(ing.components.feeNet, -9_320.942150);
  });
  it('I4 — ING in a non-taxable estate: heirs gain exactly the family-wealth difference', () => {
    const { ing } = run(ING_FIXTURES.I4);
    expectMoney(ing.npv, 1_793.350639);
    for (const r of ing.rows) expectMoney(r.dH, r.dTW);
  });
  it('I5 — fee beyond the after-tax yield: pro-rata liquidation, basis never negative', () => {
    const { ing } = run(ING_FIXTURES.I5);
    expectMoney(ing.npv, 22_528.617551);
    expectMoney(ing.components.ssNet, 33_141.120044);
    expectMoney(ing.components.feeNet, -10_524.235637);
    expectMoney(ing.components.locNet, -88.266856);
    for (const r of ing.rows) expect(r.Bn).toBeGreaterThanOrEqual(0);
    expect(ing.warnings.map((w) => w.code)).toContain('ING_FEE_EXCEEDS_YIELD');
  });
  it('I6 — the home state taxes the grantor on the ING (NY/CA): no rate saving, all location', () => {
    const { ing } = run(ING_FIXTURES.I6);
    expectMoney(ing.npv, -708.510938);
    for (const r of ing.rows) expectMoney(r.ssNet, 0);
    expect(ing.warnings.map((w) => w.code)).toContain('ING_NO_STATE_SAVING');
  });
  it('J3 — φ = 0, swap in year 1 with discount at death: burn exactly zero (v1 §7 b2 amendment)', () => {
    const sim = simulate(ING_FIXTURES.J3, 1, 3);
    for (const r of sim.rows) expect(r.burnC).toBe(0);
    expectMoney(sim.rows[2].resid, -139_497.901517);
  });
});
