// Married couples — estate tax at the second death (docs/changes/2026-09-27-life-tables/model.md).
// Golden values are hand calculations (closed forms below, worked in evals/scenarios/handcalc.js HC-M1…M10) and are
// reproduced by the clean-room oracle in evals/. HAND-DERIVED; AWAITING BUILDER CONFIRMATION.
import { describe, it, expect } from 'vitest';
import { evaluateAsset } from '../idgtModel.js';
import { evaluateIng } from '../ingModel.js';
import { expectMoney } from './fixtures.js';

// $1M asset, basis $200k, 10% growth, no yield; $50M other estate at 3%; X₀ $15M indexed 2%; τ_e 40%; heirs 25%; d 4%.
// Assumed deaths: grantor end of year 1, spouse end of year 2 (grantor first).
const BASE = Object.freeze({
  age: 60, lx: null, deathYearOverride: 1, FMV: 1_000_000, B0: 200_000, g: 0.10, y: 0, S: 0, gr: 0.10, yr: 0,
  delta: 0, annualExclusions: 0, tauOrd: 0.458, tauCg: 0.288, tauBene: 0.25, tauE: 0.40, d: 0.04, rE: 0.03, pi: 0.02,
  X0: 15_000_000, P: 0, XP: 15_000_000, E0: 50_000_000, k: 1, bSw: null, gSw: null, ySw: null, tauSw: null,
  discountAtDeath: false, saleAppliesToBaseline: true, stateOrd: 0.05, stateCg: 0.05, niit: 0.038, ingFedOrd: 0.37, ingFedLtcg: 0.20,
  ingStateRate: 0, ingAdminRate: 0, ingStateTaxOnGrantor: false, burnShare: 1,
  married: true, ageSpouse: 58, lxSpouse: null, deathYearOverrideSpouse: 2, portability: true, PS: 0, XPS: 15_000_000,
});
const v2 = 1 / 1.04 ** 2;
const heirsCgt = (gain) => 0.25 * gain / 1.04;

describe('hand-calculated married cases (second death at the end of year 2)', () => {
  it('HC-M1 grantor first, taxable estate, no yield: ΔH = 40% × (V₂ − U_g) − heirs\' CGT on carryover basis', () => {
    const r = evaluateAsset(BASE);
    const row = r.rows.none[1];
    expectMoney(row.dsueHold, 15_000_000); // X₁ − 0
    expectMoney(row.dsueGift, 14_000_000); // the gift used $1M of the grantor's exclusion
    expectMoney(row.ETb, 0.4 * (53_045_000 + 1_210_000 - 15_300_000 - 15_000_000));
    expectMoney(row.ETs, 0.4 * (53_045_000 - 15_300_000 - 14_000_000));
    const dH = 0.4 * 210_000 - heirsCgt(1_010_000);
    expectMoney(row.dH, dH);
    expectMoney(r.npvNone, dH * v2);
  });
  it('HC-M2 with a 2% yield: the burn stops at the grantor\'s death — the trust pays year 2\'s tax itself', () => {
    const r = evaluateAsset({ ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02 });
    const Vs2 = 1_090_000 * 1.07 + 21_800 * (1 - 0.458); // V₁ = 1,090,000; year 2 net of the trust's own tax = 1,178,115.6
    const Bs2 = 220_000 + 21_800 * (1 - 0.458);
    const dH = 0.4 * (Vs2 - 1_000_000) - heirsCgt(Vs2 - Bs2);
    expectMoney(r.rows.none[1].Vs, Vs2);
    expectMoney(r.rows.none[1].dH, dH);
    expectMoney(r.npvNone, dH * v2);
  });
  it('HC-M3 spouse first (year 1), grantor year 2: the grantor keeps paying the burn; DSUE = X₁', () => {
    const r = evaluateAsset({ ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02, deathYearOverride: 2, deathYearOverrideSpouse: 1 });
    const V2 = 1_188_100;
    const dH = 0.4 * (V2 - 1_000_000) - heirsCgt(V2 - 241_800);
    expectMoney(r.rows.none[1].dsueHold, 15_000_000);
    expectMoney(r.rows.none[1].dH, dH);
    expectMoney(r.npvNone, dH * v2);
  });
  it('HC-M4 $20M estate: the couple\'s two exclusions shelter it, so the gift only costs the step-up', () => {
    const r = evaluateAsset({ ...BASE, E0: 20_000_000 });
    expectMoney(r.rows.none[1].ETb, 0);
    expectMoney(r.npvNone, -heirsCgt(1_010_000) * v2);
  });
  it('HC-M5 portability off: the grantor\'s unused exclusion is lost at the first death, so the gift uses it for free', () => {
    const r = evaluateAsset({ ...BASE, E0: 20_000_000, portability: false });
    expectMoney(r.rows.none[1].ETb, 0.4 * (21_218_000 + 1_210_000 - 15_300_000));
    expectMoney(r.rows.none[1].ETs, 0.4 * (21_218_000 - 15_300_000));
    expectMoney(r.npvNone, (0.4 * 1_210_000 - heirsCgt(1_010_000)) * v2);
    expect(r.warnings.map((w) => w.code)).toContain('PORTABILITY_OFF');
  });
  it('HC-M6 exclusion exhausted, grantor dies in year 1: §2035(b) add-back taxed at the first death, tax-inclusive', () => {
    const r = evaluateAsset({ ...BASE, P: 15_000_000, XP: 15_000_000 });
    const ET1 = 0.4 * 400_000 / 0.6; // §2056(b)(4)(A): the tax comes out of the marital share
    const Es2 = (49_600_000 * 1.03 - ET1) * 1.03;
    const Hs = Es2 + 1_210_000 - 0.4 * (Es2 - 15_300_000) - heirsCgt(1_210_000 - 520_000);
    const Hb = 54_255_000 - 0.4 * (54_255_000 - 15_300_000);
    expectMoney(r.rows.none[1].ET1, ET1);
    expectMoney(r.rows.none[1].dsueGift, 0);
    expectMoney(r.npvNone, (Hs - Hb) * v2);
    expect(r.warnings.map((w) => w.code)).toContain('FIRST_DEATH_TAX');
  });
});

describe('more hand-calculated married cases (evals/scenarios/handcalc.js HC-M7…M10)', () => {
  const Y = { g: 0.07, gr: 0.07, y: 0.02, yr: 0.02 };
  it("HC-M7 the spouse's own sheltered gifts shrink the DSUE the spouse leaves; with both worlds taxable ΔH is unchanged", () => {
    const r = evaluateAsset({ ...BASE, ...Y, deathYearOverride: 2, deathYearOverrideSpouse: 1, PS: 10_000_000, XPS: 13_990_000 });
    const E2 = (50_000_000 * 1.03 - 0.458 * 20_000) * 1.03 - 0.458 * 21_800;
    expectMoney(r.rows.none[1].dsueHold, 5_000_000);
    expectMoney(r.rows.none[1].ETb, 0.4 * (E2 + 1_188_100 - 15_300_000 - 5_000_000));
    expectMoney(r.rows.none[1].dH, 0.4 * 188_100 - heirsCgt(1_188_100 - 241_800));
  });
  it('HC-M8 a swapped-back asset is stepped up at the grantor\'s death: the spouse\'s later sale taxes only the post-death gain', () => {
    const r = evaluateAsset({ ...BASE, S: 2, gr: 0.10, yr: 0, deathYearOverrideSpouse: 3 });
    const X3 = 15_000_000 * 1.02 ** 2;
    const Eg3 = ((50_000_000 * 1.03 - 1_100_000) * 1.03 - 0.288 * 110_000) * 1.03;
    const Ek3 = (50_000_000 * 1.03 ** 2 - 0.288 * 110_000) * 1.03;
    const Hs = Eg3 + 1_331_000 + 1_100_000 * 1.03 ** 2 - 0.4 * (Eg3 + 1_331_000 - X3 - 14_000_000);
    const Hb = Ek3 + 1_331_000 - 0.4 * (Ek3 + 1_331_000 - X3 - 15_000_000);
    expectMoney(Hs - Hb, 66_796);
    expectMoney(r.npvCurve[1].npv, (Hs - Hb) / 1.04 ** 3);
    const Vn3 = (1_210_000 - 0.288 * 1_010_000) * 1.1; // no swap: the (now non-grantor) trust sells and pays the tax itself
    const En3 = 50_000_000 * 1.03 ** 3;
    const Hn = En3 + Vn3 - 0.4 * (En3 - X3 - 14_000_000) - heirsCgt(Vn3 - (1_210_000 - 0.288 * 1_010_000));
    expectMoney(r.npvNone, (Hn - Hb) / 1.04 ** 3);
  });
  it('HC-M9 the ING passes to the spouse at the grantor\'s death, stepped up; the spouse pays year 2\'s tax at the grantor\'s rate', () => {
    const inp = { ...BASE, ...Y };
    const ing = evaluateIng(inp, evaluateAsset(inp));
    const Vi1 = 1_070_000 + 20_000 * (1 - 0.408);
    const Yi2 = 0.02 * Vi1;
    const dW = (51_500_000 * 1.03 - 0.458 * Yi2 + Vi1 * 1.07 + Yi2) - ((50_000_000 * 1.03 - 9_160) * 1.03 - 9_984.4 + 1_188_100);
    expectMoney(dW, 615.1456);
    expectMoney(ing.npv, 0.6 * dW * v2);
  });
  it('HC-M10 same-year deaths: the grantor is taken to die first (J-3); both worlds taxable ⇒ the single-life HC01 result', () => {
    const r = evaluateAsset({ ...BASE, deathYearOverrideSpouse: 1 });
    expect(r.rows.none[0].grantorFirst).toBe(1);
    const dH = 0.4 * 100_000 - heirsCgt(900_000);
    expectMoney(r.rows.none[0].dH, dH);
    expectMoney(r.npvNone, dH / 1.04);
  });
});

describe('married-mode warnings', () => {
  it('FIRST_DEATH_TAX only when the grantor can die FIRST inside the §2035(b) window (spouse certain to die in year 1: no)', () => {
    const exhausted = { ...BASE, P: 15_000_000, XP: 15_000_000 };
    expect(evaluateAsset(exhausted).warnings.map((w) => w.code)).toContain('FIRST_DEATH_TAX'); // grantor yr 1, spouse yr 2
    const spouseFirst = evaluateAsset({ ...exhausted, deathYearOverride: 2, deathYearOverrideSpouse: 1 });
    expect(spouseFirst.warnings.map((w) => w.code)).not.toContain('FIRST_DEATH_TAX');
    expect(spouseFirst.rows.none[1].ET1).toBe(0); // the real pair (2, 1); row 1 is display-only (both deaths in year 1)
  });
  it('ING_FEE_EXCEEDS_YIELD looks only at the years the ING exists — the grantor\'s life (M-9), not the survivor\'s', () => {
    // grantor dies in year 2, spouse in year 10; the sale in year 5 (post-sale yield 0) comes after the ING has passed
    const inp = { ...BASE, g: 0.05, gr: 0.05, y: 0.04, yr: 0, S: 5, deathYearOverride: 2, deathYearOverrideSpouse: 10, ingAdminRate: 0.005 };
    const ing = evaluateIng(inp, evaluateAsset(inp));
    expect(ing.warnings.map((w) => w.code)).not.toContain('ING_FEE_EXCEEDS_YIELD');
    const single = { ...inp, married: false, deathYearOverride: 10 }; // single grantor alive past the sale: the fee bites
    expect(evaluateIng(single, evaluateAsset(single)).warnings.map((w) => w.code)).toContain('ING_FEE_EXCEEDS_YIELD');
  });
});

describe('married-mode identities', () => {
  it('spouse certain to die first with portability off ≡ the single-life ledger at the grantor\'s death', () => {
    for (const tG of [2, 5, 9]) {
      const married = evaluateAsset({ ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02, E0: 16_000_000, deathYearOverride: tG, deathYearOverrideSpouse: 1, portability: false });
      const single = evaluateAsset({ ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02, E0: 16_000_000, deathYearOverride: tG, married: false });
      expectMoney(married.npvNone, single.npvNone);
      expectMoney(married.npvOpt, single.npvOpt);
      expect(married.sStar).toBe(single.sStar);
    }
  });
  it('components and the ING decomposition sum exactly; a swap never affects pairs where the grantor died first', () => {
    const inp = { ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02, E0: 18_000_000, deathYearOverride: 6, deathYearOverrideSpouse: 9, ingAdminRate: 0.005 };
    const r = evaluateAsset(inp);
    const ing = evaluateIng(inp, r);
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expectMoney(sum(r.components.none), r.npvNone);
    expectMoney(sum(r.components.opt), r.npvOpt);
    expectMoney(sum(ing.components), ing.npv);
    for (const row of r.rows.opt) expectMoney(row.freeze + row.burnC + row.giftTaxC + row.resid + row.stepUp, row.dH);
    // swap after the grantor's death year is not available: the curve stops at the grantor's horizon
    expect(r.npvCurve.length).toBe(7);
  });
});
