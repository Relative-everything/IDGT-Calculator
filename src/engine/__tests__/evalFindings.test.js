// Regression tests for the defects found by the eval suite (docs/changes/2026-09-27-math-evals/findings.md).
// Expected values are hand calculations written out in evals/scenarios/handcalc.js (HC09, HC11) and reproduced by the
// clean-room oracle in evals/oracle — independent of the code under test.
import { describe, it, expect } from 'vitest';
import { evaluateAsset } from '../idgtModel.js';
import { evaluateIng, simulateIng } from '../ingModel.js';
import { deriveGift } from '../fedTax.js';
import { rankAssets } from '../ranking.js';
import { deathbedNote } from '../../components/format.js';
import { BASE, expectMoney } from './fixtures.js';

describe('F1 — ING fee above the after-tax yield: the yield cash is spent once', () => {
  const inp = { ...BASE, deathYearOverride: 1, E0: 50_000_000, B0: 0, y: 0.005, yr: 0.005, ingAdminRate: 0.01 };
  it('HC09: V₁ = 1,070,000 − 7,040 ÷ (1 − 0.238)', () => {
    const r = simulateIng(inp, 1).rows[0];
    expectMoney(r.Vn, 1_070_000 - 7_040 / (1 - 0.238));
    expectMoney(r.gainL, 7_040 / (1 - 0.238));
    expectMoney(r.Bn, 0);
  });
  it('the trust value is continuous where the fee crosses the after-tax yield (was a jump of the whole yield)', () => {
    const threshold = 0.005 * (1 - 0.408); // fee = y (1 − τ^n_ord)
    const below = simulateIng({ ...inp, ingAdminRate: threshold * (1 - 1e-12) }, 1).rows[0].Vn;
    const above = simulateIng({ ...inp, ingAdminRate: threshold * (1 + 1e-12) }, 1).rows[0].Vn;
    expect(Math.abs(above - below)).toBeLessThan(0.01);
  });
  it('a higher fee never raises the ING NPV', () => {
    let prev = Infinity;
    for (let c = 0; c <= 0.02; c += 0.0005) {
      const x = { ...BASE, ingAdminRate: c };
      const npv = evaluateIng(x, evaluateAsset(x)).npv;
      expect(npv).toBeLessThanOrEqual(prev + 1e-6);
      prev = npv;
    }
  });
});

describe('F2 — §1015(d)(6) basis increase (Reg. §1.1015-5(c))', () => {
  it('HC11: net appreciation on the FMV of the gift, amount of the gift after annual exclusions', () => {
    const g = deriveGift({ FMV: 1_000_000, delta: 0, annualExclusions: 190_000, B0: 300_000, X0: 15_000_000, P: 15_000_000, XP: 15_000_000, tauE: 0.4 });
    expectMoney(g.Ug, 810_000);
    expectMoney(g.G, 324_000);
    expectMoney(g.BT0, 300_000 + 324_000 * 700_000 / 810_000); // 580,000
  });
  it('the increase never exceeds the gift tax paid', () => {
    const g = deriveGift({ FMV: 1_000_000, delta: 0, annualExclusions: 190_000, B0: 0, X0: 15_000_000, P: 15_000_000, XP: 15_000_000, tauE: 0.4 });
    expectMoney(g.BT0, g.G);
  });
  it('without annual exclusions the v1 fixtures are unchanged (Fixture E: 520,000; F: 716,800)', () => {
    expectMoney(deriveGift({ FMV: 1_000_000, B0: 200_000, X0: 15_000_000, P: 15_000_000, XP: 15_000_000, tauE: 0.4 }).BT0, 520_000);
    expectMoney(deriveGift({ FMV: 2_000_000, B0: 400_000, X0: 15_000_000, P: 13_990_000, XP: 13_990_000, tauE: 0.4 }).BT0, 716_800);
  });
});

describe('F3 — the deathbed-swap value is not an upper bound', () => {
  // A slow asset (1.4% total return) swapped early for cash compounding at r_E / (1 − τ_ord) gross moves more wealth out
  // of the estate than swapping it back at death.
  const inp = { ...BASE, deathYearOverride: 30, FMV: 1_000_000, B0: 1_200_000, g: 0.005, gr: 0.005, y: 0.009, yr: 0.009, E0: 15_500_000, rE: 0.023, tauOrd: 0.408, stateOrd: 0, niit: 0.038 };
  const res = evaluateAsset(inp);
  it('an early swap beats the deathbed swap here', () => {
    expect(res.npvCurve.slice(1).every((c) => c.feasible)).toBe(true);
    expect(res.npvPF).toBeLessThan(res.npvOpt);
  });
  it('the tile text states the comparison truthfully and never claims a bound', () => {
    const note = deathbedNote(res.npvPF >= res.npvOpt, true);
    expect(note).toMatch(/below the best fixed year/);
    expect(note).not.toMatch(/upper bound/i);
    expect(deathbedNote(true, true)).toMatch(/beats the best fixed year/);
  });
});

describe('F4 — proportionally identical assets tie on efficiency and rank by NPV', () => {
  it('the larger asset ranks first under both rank keys', () => {
    // ×3 is a pair whose no-swap efficiencies differ only in the 16th digit, the small one high (0.…044 vs 0.…043):
    // before the fix the small asset ranked first on that noise.
    const small = { ...BASE, deathYearOverride: 20 };
    const large = { ...small, FMV: 3_000_000, B0: 600_000 };
    const evaluated = [
      { id: 'small', name: 'small', result: evaluateAsset(small) },
      { id: 'large', name: 'large', result: evaluateAsset(large) },
    ];
    for (const key of ['opt', 'none']) {
      const eff = evaluated.map((e) => e.result.eff[key]);
      expect(Math.abs(eff[0] - eff[1])).toBeLessThan(1e-12 * Math.abs(eff[0]));
      expect(rankAssets(evaluated, { key })[0].id).toBe('large');
      expect(rankAssets([...evaluated].reverse(), { key })[0].id).toBe('large');
    }
  });
});
