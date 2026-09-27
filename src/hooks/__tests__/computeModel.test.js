// The app pipeline (computeModel) and the settings transitions it depends on.
import { describe, it, expect } from 'vitest';
import { computeModel } from '../computeModel.js';
import { toggleSwapCustom } from '../settingsActions.js';
import { buildEngineInputs } from '../buildInputs.js';

const grantor = { age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '9.3', niit: '3.8', fedLtcg: '20', stateLtcg: '9.3' };
const estate = {
  otherEstate: '20000000', otherEstateGrowth: '4', exclusion: '15000000', exclusionIndexing: '2',
  priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '13990000',
  estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35',
};
// the app's default settings: the custom consideration fields hold 5.535% / 45.8%, neutral only at 3% growth and 45.8%
const settings = {
  rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.535', swapTaxRate: '45.8',
  burnShare: '100', ingFedOrd: '37', ingFedLtcg: '20', ingStateRate: '0', ingAdminRate: '0', ingStateTaxOnGrantor: false,
};
const asset = { id: 'a', name: 'A', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2', saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0' };

describe('F5 — switching "Customise the consideration" on changes nothing until a value is edited', () => {
  it('at non-default rates (9.3% state, 4% growth) the seeded profile is neutral and every NPV is unchanged', () => {
    const off = computeModel({ grantor, estate, settings, assets: [asset] });
    const on = toggleSwapCustom(settings, true, off.swapRates);
    const res = computeModel({ grantor, estate, settings: on, assets: [asset] });
    const a = off.perAsset[0];
    const b = res.perAsset[0];
    expect(Math.abs(b.result.npvNone - a.result.npvNone)).toBeLessThan(0.01);
    expect(Math.abs(b.result.npvOpt - a.result.npvOpt)).toBeLessThan(0.01);
    expect(b.result.sStar).toBe(a.result.sStar);
    expect(b.warnings.map((w) => w.code)).not.toContain('NON_NEUTRAL_SWAP');
  });
  it('seeds basis 100%, growth 0%, yield r_E ÷ (1 − τ_ord) and rate τ_ord; switching off keeps the values', () => {
    const rates = { rE: 0.04, tauOrd: 0.501 };
    const on = toggleSwapCustom(settings, true, rates);
    expect(on.swapCustom).toBe(true);
    expect(Number(on.swapBasisPct)).toBe(100);
    expect(Number(on.swapGrowth)).toBe(0);
    expect(Math.abs(Number(on.swapYield) / 100 - 0.04 / 0.499)).toBeLessThan(1e-12);
    expect(Math.abs(Number(on.swapTaxRate) / 100 - 0.501)).toBeLessThan(1e-12);
    const off = toggleSwapCustom(on, false, rates);
    expect(off.swapCustom).toBe(false);
    expect(off.swapYield).toBe(on.swapYield);
  });
  it('the old behaviour (flag only) is what moved the NPVs', () => {
    const flagOnly = { ...settings, swapCustom: true };
    const inputs = buildEngineInputs({ grantor, estate, settings: flagOnly, asset });
    expect(Math.abs(inputs.ySw * (1 - inputs.tauSw) + inputs.gSw - inputs.rE)).toBeGreaterThan(1e-4);
  });
});

describe('F7 — a shrinking other estate (r_E < 0): the neutral consideration depreciates instead of paying a negative yield', () => {
  const shrinking = { ...estate, otherEstateGrowth: '-1' };
  it('switching "Customise" on seeds a valid, neutral profile and changes nothing', () => {
    const off = computeModel({ grantor, estate: shrinking, settings, assets: [asset] });
    const on = toggleSwapCustom(settings, true, off.swapRates);
    expect(Number(on.swapYield)).toBe(0);
    expect(Math.abs(Number(on.swapGrowth) + 1)).toBeLessThan(1e-12);
    const res = computeModel({ grantor, estate: shrinking, settings: on, assets: [asset] });
    expect(res.perAsset[0].errors).toEqual([]);
    expect(Math.abs(res.perAsset[0].result.npvOpt - off.perAsset[0].result.npvOpt)).toBeLessThan(0.01);
    expect(res.perAsset[0].warnings.map((w) => w.code)).not.toContain('NON_NEUTRAL_SWAP');
  });
  it('the default profile has no negative yield (no tax refund on negative income)', () => {
    const m = computeModel({ grantor, estate: shrinking, settings, assets: [asset] });
    expect(m.neutralSwap).toEqual({ bSw: 1, gSw: -0.01, ySw: 0, tauSw: m.swapRates.tauOrd });
  });
});

describe('computeModel exposes what the settings panel needs', () => {
  it('neutral yield and the rates it was computed from', () => {
    const m = computeModel({ grantor, estate, settings, assets: [asset] });
    expect(m.swapRates.rE).toBeCloseTo(0.04, 12);
    expect(m.swapRates.tauOrd).toBeCloseTo(0.501, 12);
    expect(m.neutralSwapYield).toBeCloseTo(0.04 / 0.499, 12);
    expect(m.ranked).toHaveLength(1);
  });
});
