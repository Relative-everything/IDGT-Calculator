// Every UI field reaches the engine input and moves at least one output (spec R7).
import { describe, it, expect } from 'vitest';
import { buildEngineInputs, parseNum, priorGiftExclusion, validateUiFields } from '../buildInputs.js';
import { evaluateAsset } from '../../engine/idgtModel.js';
import { validateInputs } from '../../engine/validate.js';

const grantor = { age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5' };
const estate = { otherEstate: '20,000,000', otherEstateGrowth: '3', exclusion: '15000000', exclusionIndexing: '2', priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '', estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35' };
const settings = { rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.5', swapTaxRate: '45.8' };
const asset = { id: 'a', name: 'A', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2', saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0' };

describe('buildEngineInputs', () => {
  it('converts percents to decimals, sums the rate stacks, parses commas', () => {
    const inp = buildEngineInputs({ grantor, estate, settings, asset });
    expect(inp.tauOrd).toBeCloseTo(0.458, 12);
    expect(inp.tauCg).toBeCloseTo(0.288, 12);
    expect(inp.tauBene).toBeCloseTo(0.288, 12);
    expect(inp.E0).toBe(20_000_000);
    expect(inp.g).toBeCloseTo(0.07, 12);
    expect(inp.lx.length).toBe(120);
    expect(inp.deathYearOverride).toBeNull();
    expect(validateInputs(inp).errors).toEqual([]);
  });
  it('prior-gift exclusion comes from the year table, or the custom amount', () => {
    expect(priorGiftExclusion({ priorExclusionMode: 'year', priorGiftYear: '2025' })).toBe(13_990_000);
    expect(priorGiftExclusion({ priorExclusionMode: 'custom', priorGiftExclusion: '12,000,000' })).toBe(12_000_000);
    expect(parseNum('')).toBeNaN();
  });
  it('non-integer age, death year and sale year are not rounded — they fail validation at the field', () => {
    const inp = buildEngineInputs({ grantor: { ...grantor, age: '65.5' }, estate, settings, asset });
    expect(inp.age).toBeNaN();
    const ui = validateUiFields({ grantor: { ...grantor, age: '65.5' }, estate, settings, asset: { ...asset, saleYear: '0.5' } });
    expect(ui.map((e) => e.field)).toEqual(['age', 'saleYear']);
    expect(ui[0].message).toMatch(/whole number/);
  });
  it('blank or non-numeric UI fields are reported on the field itself', () => {
    const ui = validateUiFields({ grantor: { ...grantor, stateOrd: '' }, estate: { ...estate, beneStateLtcg: 'x' }, settings, asset });
    expect(ui.map((e) => e.field)).toEqual(['stateOrd', 'beneStateLtcg']);
    expect(validateUiFields({ grantor, estate, settings, asset })).toEqual([]);
  });
  it('deterministic death year replaces the table', () => {
    const inp = buildEngineInputs({ grantor: { ...grantor, useDeathYear: true, deathYear: '12' }, estate, settings, asset });
    expect(inp.lx).toBeNull();
    expect(inp.deathYearOverride).toBe(12);
  });
});

describe('every UI input changes an output', () => {
  const base = { grantor, estate: { ...estate, otherEstate: '30000000' }, settings, asset: { ...asset, saleYear: '4' } };
  const baseline = evaluateAsset(buildEngineInputs(base));
  const outputs = (res) => [res.npvNone, res.npvOpt, res.sStar, res.eff.opt, res.derived.Ug, res.derived.G, res.derived.BT0, res.derived.expectedDeathYear, res.rows.none[0].Hb];
  const changed = (res) => outputs(res).some((v, i) => v !== outputs(baseline)[i]);

  const cases = [
    ['grantor.age', { grantor: { ...grantor, age: '55' } }],
    ['grantor.sex', { grantor: { ...grantor, sex: 'female' } }],
    ['grantor.useDeathYear', { grantor: { ...grantor, useDeathYear: true } }],
    ['grantor.fedOrd', { grantor: { ...grantor, fedOrd: '24' } }],
    ['grantor.stateOrd', { grantor: { ...grantor, stateOrd: '0' } }],
    ['grantor.niit', { grantor: { ...grantor, niit: '0' } }],
    ['grantor.fedLtcg', { grantor: { ...grantor, fedLtcg: '15' } }],
    ['grantor.stateLtcg', { grantor: { ...grantor, stateLtcg: '0' } }],
    ['estate.otherEstate', { estate: { ...base.estate, otherEstate: '40000000' } }],
    ['estate.otherEstateGrowth', { estate: { ...base.estate, otherEstateGrowth: '5' } }],
    ['estate.exclusion', { estate: { ...base.estate, exclusion: '16000000' } }],
    ['estate.exclusionIndexing', { estate: { ...base.estate, exclusionIndexing: '0' } }],
    ['estate.priorGifts+year', { estate: { ...base.estate, priorGifts: '13990000', priorGiftYear: '2025' } }],
    ['estate.priorGiftExclusion(custom)', { estate: { ...base.estate, priorGifts: '13990000', priorExclusionMode: 'custom', priorGiftExclusion: '13610000' } }],
    ['estate.estateTaxRate', { estate: { ...base.estate, estateTaxRate: '45' } }],
    ['estate.beneFedLtcg', { estate: { ...base.estate, beneFedLtcg: '15' } }],
    ['estate.beneStateLtcg', { estate: { ...base.estate, beneStateLtcg: '0' } }],
    ['estate.beneNiit', { estate: { ...base.estate, beneNiit: false } }],
    ['estate.yearsToSale', { estate: { ...base.estate, yearsToSale: '5' } }],
    ['estate.discountRate', { estate: { ...base.estate, discountRate: '6' } }],
    ['asset.fmv', { asset: { ...base.asset, fmv: '2000000' } }],
    ['asset.discount', { asset: { ...base.asset, discount: '30' } }],
    ['asset.basis', { asset: { ...base.asset, basis: '500000' } }],
    ['asset.growth', { asset: { ...base.asset, growth: '3' } }],
    ['asset.yield', { asset: { ...base.asset, yield: '0' } }],
    ['asset.saleYear', { asset: { ...base.asset, saleYear: '0' } }],
    ['asset.postSaleGrowth', { asset: { ...base.asset, postSaleGrowth: '2' } }],
    ['asset.postSaleYield', { asset: { ...base.asset, postSaleYield: '4' } }],
    ['asset.annualExclusions', { asset: { ...base.asset, annualExclusions: '38000' } }],
    ['settings.discountAtDeath', { settings: { ...settings, discountAtDeath: true }, asset: { ...base.asset, discount: '25' } }],
    ['settings.saleAppliesToBaseline', { settings: { ...settings, saleAppliesToBaseline: false } }],
    ['settings.swapCustom(basis)', { settings: { ...settings, swapCustom: true, swapBasisPct: '50', swapGrowth: '0', swapYield: '5.535', swapTaxRate: '45.8' } }],
    ['settings.swapGrowth', { settings: { ...settings, swapCustom: true, swapBasisPct: '100', swapGrowth: '6', swapYield: '0', swapTaxRate: '0' } }],
    ['settings.swapYield/taxRate', { settings: { ...settings, swapCustom: true, swapBasisPct: '100', swapGrowth: '0', swapYield: '3', swapTaxRate: '0' } }],
  ];
  for (const [name, patch] of cases) {
    it(name, () => {
      const res = evaluateAsset(buildEngineInputs({ ...base, ...patch }));
      expect(changed(res), name).toBe(true);
    });
  }
  it('maxYears only changes the display share, never NPV', () => {
    const res = evaluateAsset(buildEngineInputs({ ...base, estate: { ...base.estate, maxYears: '10' } }));
    expect(res.npvOpt).toBe(baseline.npvOpt);
    expect(res.shareBeyondDisplay).not.toBe(baseline.shareBeyondDisplay);
  });
});
