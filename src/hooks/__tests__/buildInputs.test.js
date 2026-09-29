// Every UI field reaches the engine input and moves at least one output (spec R7).
import { describe, it, expect } from 'vitest';
import { buildEngineInputs, parseNum, priorGiftExclusion, validateUiFields } from '../buildInputs.js';
import { evaluateAsset } from '../../engine/idgtModel.js';
import { evaluateIng } from '../../engine/ingModel.js';
import { validateInputs } from '../../engine/validate.js';

const grantor = { age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5' };
const estate = { otherEstate: '20,000,000', otherEstateGrowth: '3', exclusion: '15000000', exclusionIndexing: '2', priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '', estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35',
  spousePriorGifts: '0', spousePriorGiftYear: '2025', spousePriorExclusionMode: 'year', spousePriorGiftExclusion: '13990000' };
const settings = { rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.5', swapTaxRate: '45.8',
  burnShare: '100', ingFedOrd: '37', ingFedLtcg: '20', ingStateRate: '0', ingAdminRate: '0', ingStateTaxOnGrantor: false };
const asset = { id: 'a', name: 'A', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2', saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0' };

describe('buildEngineInputs', () => {
  it('converts percents to decimals, sums the rate stacks, parses commas', () => {
    const inp = buildEngineInputs({ grantor, estate, settings, asset });
    expect(inp.tauOrd).toBeCloseTo(0.458, 12);
    expect(inp.tauCg).toBeCloseTo(0.288, 12);
    expect(inp.tauBene).toBeCloseTo(0.288, 12);
    expect(inp.E0).toBe(20_000_000);
    expect(inp.g).toBeCloseTo(0.07, 12);
    expect(inp.lx.length).toBe(121); // default SSA 2023 table: ages 0–119 plus the closure l_120 = 0
    expect(inp.lx[120]).toBe(0);
    expect(inp.lifeTableId).toBe('ssa-2023-tr2026');
    expect(inp.married).toBe(false);
    expect(inp.deathYearOverride).toBeNull();
    expect(validateInputs(inp).errors).toEqual([]);
  });
  it('the life-table choice selects the survivors column; the legacy table keeps its published l_x', () => {
    const legacy = buildEngineInputs({ grantor: { ...grantor, lifeTable: 'ssa-2021-legacy' }, estate, settings, asset });
    expect(legacy.lx.length).toBe(120);
    expect(legacy.lx[65]).toBe(77402);
    const unknown = buildEngineInputs({ grantor: { ...grantor, lifeTable: 'no-such-table' }, estate, settings, asset });
    expect(unknown.lifeTableId).toBe('ssa-2023-tr2026');
  });
  it('married couple: spouse age, sex, death year, portability and prior gifts reach the engine', () => {
    const couple = { ...grantor, married: true, spouseAge: '62', spouseSex: 'female', portability: false };
    const est = { ...estate, spousePriorGifts: '5,000,000', spousePriorGiftYear: '2024', spousePriorExclusionMode: 'year', spousePriorGiftExclusion: '' };
    const inp = buildEngineInputs({ grantor: couple, estate: est, settings, asset });
    expect(inp.married).toBe(true);
    expect(inp.ageSpouse).toBe(62);
    expect(inp.lxSpouse.length).toBe(121);
    expect(inp.lxSpouse[62]).not.toBe(inp.lx[62]); // female column
    expect(inp.portability).toBe(false);
    expect(inp.PS).toBe(5_000_000);
    expect(inp.XPS).toBe(13_610_000);
    expect(validateInputs(inp).errors).toEqual([]);
    const det = buildEngineInputs({ grantor: { ...couple, useDeathYear: true, deathYear: '10', spouseDeathYear: '14' }, estate: est, settings, asset });
    expect(det.lxSpouse).toBeNull();
    expect(det.deathYearOverrideSpouse).toBe(14);
    expect(validateUiFields({ grantor: { ...couple, spouseAge: '' }, estate: est, settings, asset }).map((e) => e.field)).toEqual(['spouseAge']);
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
  it('passes the state components and NIIT un-summed; the hook stays the single source of both stacks', () => {
    const inp = buildEngineInputs({ grantor, estate, settings, asset });
    expect(inp.stateOrd).toBeCloseTo(0.05, 12);
    expect(inp.stateCg).toBeCloseTo(0.05, 12);
    expect(inp.niit).toBeCloseTo(0.038, 12);
    expect(inp.tauOrd - inp.stateOrd - inp.niit).toBeCloseTo(0.37, 12);
    expect(inp.tauCg - inp.stateCg - inp.niit).toBeCloseTo(0.20, 12);
    expect(inp.burnShare).toBe(1);
    expect(inp.ingFedOrd).toBeCloseTo(0.37, 12);
    expect(inp.ingStateTaxOnGrantor).toBe(false);
  });
  it('a blank ING field is reported on the field itself', () => {
    const ui = validateUiFields({ grantor, estate, settings: { ...settings, burnShare: '', ingAdminRate: 'x' }, asset });
    expect(ui.map((e) => e.field)).toEqual(['burnShare', 'ingAdminRate']);
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
    ['grantor.lifeTable', { grantor: { ...grantor, lifeTable: 'ssa-2021-legacy' } }],
    ['grantor.married', { grantor: { ...grantor, married: true, spouseAge: '63', spouseSex: 'female', portability: true } }],
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
  it('an asset\'s source reference is a label only: it never reaches the engine', () => {
    const a = buildEngineInputs(base);
    const b = buildEngineInputs({ ...base, asset: { ...base.asset, source: 'Excel B7' } });
    expect(b).toEqual(a);
  });
  it('maxYears only changes the display share, never NPV', () => {
    const res = evaluateAsset(buildEngineInputs({ ...base, estate: { ...base.estate, maxYears: '10' } }));
    expect(res.npvOpt).toBe(baseline.npvOpt);
    expect(res.shareBeyondDisplay).not.toBe(baseline.shareBeyondDisplay);
  });
});

describe('every married-couple input changes an output', () => {
  const couple = { ...grantor, married: true, spouseAge: '63', spouseSex: 'female', spouseDeathYear: '25', portability: true };
  const est = { ...estate, otherEstate: '14000000', spousePriorGifts: '0', spousePriorGiftYear: '2025', spousePriorExclusionMode: 'year', spousePriorGiftExclusion: '13990000' };
  const base = { grantor: couple, estate: est, settings, asset: { ...asset, saleYear: '4' } };
  const run = (ui) => { const inp = buildEngineInputs(ui); const idgt = evaluateAsset(inp); return { idgt, ing: evaluateIng(inp, idgt) }; };
  const ref = run(base);
  const outputs = ({ idgt, ing }) => [idgt.npvNone, idgt.npvOpt, idgt.sStar, idgt.derived.expectedDeathYear, ing.npv];
  const changed = (res) => outputs(res).some((v, i) => v !== outputs(ref)[i]);
  const cases = [
    ['grantor.spouseAge', { grantor: { ...couple, spouseAge: '50' } }],
    ['grantor.spouseSex', { grantor: { ...couple, spouseSex: 'male' } }],
    ['grantor.portability', { grantor: { ...couple, portability: false } }],
    ['grantor.spouseDeathYear (assumed death years)', { grantor: { ...couple, useDeathYear: true, spouseDeathYear: '3' } }],
    ['estate.spousePriorGifts', { estate: { ...est, spousePriorGifts: '13990000' } }],
    ['estate.spousePriorGiftYear', { estate: { ...est, spousePriorGifts: '12000000', spousePriorGiftYear: '2019' } }],
    ['estate.spousePriorGiftExclusion (custom)', { estate: { ...est, spousePriorGifts: '12000000', spousePriorExclusionMode: 'custom', spousePriorGiftExclusion: '11000000' } }],
  ];
  for (const [name, patch] of cases) {
    it(name, () => expect(changed(run({ ...base, ...patch })), name).toBe(true));
  }
});

describe('every ING comparison input changes an output', () => {
  const base = { grantor, estate: { ...estate, otherEstate: '30000000' }, settings, asset: { ...asset, saleYear: '4' } };
  const evalBoth = (ui) => { const inp = buildEngineInputs(ui); const idgt = evaluateAsset(inp); return { idgt, ing: evaluateIng(inp, idgt) }; };
  const ref = evalBoth(base);
  const outputs = ({ idgt, ing }) => [idgt.npvNone, idgt.npvOpt, ing.npv, ing.components.ssNet, ing.components.feeNet, ing.components.locNet];
  const changed = (res) => outputs(res).some((v, i) => v !== outputs(ref)[i]);
  const cases = [
    ['settings.burnShare', { settings: { ...settings, burnShare: '60' } }],
    ['settings.ingFedOrd', { settings: { ...settings, ingFedOrd: '35' } }],
    ['settings.ingFedLtcg', { settings: { ...settings, ingFedLtcg: '15' } }],
    ['settings.ingStateRate', { settings: { ...settings, ingStateRate: '2' } }],
    ['settings.ingAdminRate', { settings: { ...settings, ingAdminRate: '0.5' } }],
    ['settings.ingStateTaxOnGrantor', { settings: { ...settings, ingStateTaxOnGrantor: true } }],
    ['grantor.stateOrd reaches the ING rate saving', { grantor: { ...grantor, stateOrd: '9' } }],
  ];
  for (const [name, patch] of cases) {
    it(name, () => expect(changed(evalBoth({ ...base, ...patch })), name).toBe(true));
  }
});
