// CLEAN-ROOM ORACLE — what each UI field SHOULD mean to the engine, written from the labels and tooltips a
// planner sees (src/components/inputs/*.jsx), not from src/hooks/buildInputs.js.
//
// The basic exclusion table is restated here from the IRS revenue procedures so the eval also audits
// src/data/exclusionAmounts.js. Life tables: the default (SSA 2023 period, 2026 Trustees Report) is derived here from
// the extracted source file docs/sources/…csv (./lives.js), not from src/data; the legacy 2021 column exists only in
// src/data (unverified, flagged in the UI) and is taken from there.

import { SSA_2021_LX } from '../../src/data/mortalityTable.js';
import { survivorsFromRates } from './lives.js';

// IRC §2010(c)(3) basic exclusion amount by year (Rev. Procs. 2010-40, 2011-52, 2012-41, 2013-35, 2014-61,
// 2015-53, 2016-55, 2017-58, 2018-57, 2019-44, 2020-45, 2021-45, 2022-38, 2023-34, 2024-40; OBBBA §70106 for 2026).
export const BEA_BY_YEAR = {
  2011: 5_000_000, 2012: 5_120_000, 2013: 5_250_000, 2014: 5_340_000, 2015: 5_430_000, 2016: 5_450_000, 2017: 5_490_000,
  2018: 11_180_000, 2019: 11_400_000, 2020: 11_580_000, 2021: 11_700_000, 2022: 12_060_000, 2023: 12_920_000,
  2024: 13_610_000, 2025: 13_990_000, 2026: 15_000_000,
};

const num = (v) => {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').replace(/[,\s$%]/g, '');
  return t === '' ? NaN : Number(t);
};
const rate = (v) => num(v) / 100;

// "Life table" options a planner can pick (GrantorPanel): the SSA 2023 period table (default) or the legacy 2021 column.
export const DEFAULT_TABLE = 'ssa-2023-tr2026';
const LEGACY_TABLE = 'ssa-2021-legacy';
const tableId = (id) => (id === LEGACY_TABLE ? LEGACY_TABLE : DEFAULT_TABLE);

/** Survivors column for one sex of the chosen table. */
export function lxOf(sex, id = DEFAULT_TABLE) {
  if (tableId(id) === LEGACY_TABLE) {
    const ages = Object.keys(SSA_2021_LX).map(Number).sort((a, b) => a - b);
    return ages.map((a) => SSA_2021_LX[a][sex]);
  }
  return survivorsFromRates(sex);
}

/** The engine input a planner's screen implies. */
export function expectedEngineInputs({ grantor, estate, settings, asset }) {
  const niit = rate(grantor.niit);
  const priorGifts = num(estate.priorGifts);
  const exclusionWhenMade = estate.priorExclusionMode === 'custom' ? num(estate.priorGiftExclusion) : BEA_BY_YEAR[Number(estate.priorGiftYear)];
  const sexOf = (x) => (x === 'female' ? 'female' : 'male');
  // "Married — estate tax at the second death": spouse fields matter only then; the life table only without assumed years
  const married = Boolean(grantor.married);
  const spousePrior = married ? num(estate.spousePriorGifts) : 0;
  const spouseExclusionWhenMade = estate.spousePriorExclusionMode === 'custom' ? num(estate.spousePriorGiftExclusion) : BEA_BY_YEAR[Number(estate.spousePriorGiftYear)];
  return {
    age: num(grantor.age),
    lifeTableId: grantor.useDeathYear ? null : tableId(grantor.lifeTable),
    lx: grantor.useDeathYear ? null : lxOf(sexOf(grantor.sex), grantor.lifeTable),
    deathYearOverride: grantor.useDeathYear ? num(grantor.deathYear) : null,
    married,
    ageSpouse: married ? num(grantor.spouseAge) : null,
    lxSpouse: married && !grantor.useDeathYear ? lxOf(sexOf(grantor.spouseSex), grantor.lifeTable) : null,
    deathYearOverrideSpouse: married && grantor.useDeathYear ? num(grantor.spouseDeathYear) : null,
    // "Elect portability at the first death" (on unless switched off); irrelevant for a single grantor
    portability: married ? grantor.portability !== false : true,
    PS: spousePrior,
    XPS: married && spousePrior > 0 ? spouseExclusionWhenMade : num(estate.exclusion),
    // "Grantor income-tax rates … ordinary stack applies to the yield; the capital-gain stack applies to a sale"
    tauOrd: rate(grantor.fedOrd) + rate(grantor.stateOrd) + niit,
    tauCg: rate(grantor.fedLtcg) + rate(grantor.stateLtcg) + niit,
    stateOrd: rate(grantor.stateOrd),
    stateCg: rate(grantor.stateLtcg),
    niit,
    // "Heirs: Federal LTCG, State LTCG, Add NIIT to the heirs' rate"
    tauBene: rate(estate.beneFedLtcg) + rate(estate.beneStateLtcg) + (estate.beneNiit ? niit : 0),
    tauE: rate(estate.estateTaxRate),
    d: rate(estate.discountRate),
    rE: rate(estate.otherEstateGrowth),
    pi: rate(estate.exclusionIndexing),
    X0: num(estate.exclusion),
    P: priorGifts,
    // "measured against the exclusion of the year they were made"; with no prior gifts the value is irrelevant
    XP: priorGifts > 0 ? exclusionWhenMade : num(estate.exclusion),
    E0: num(estate.otherEstate),
    k: num(estate.yearsToSale),
    NDisp: num(estate.maxYears),
    FMV: num(asset.fmv),
    B0: num(asset.basis),
    g: rate(asset.growth),
    y: rate(asset.yield),
    S: num(asset.saleYear),
    gr: rate(asset.postSaleGrowth),
    yr: rate(asset.postSaleYield),
    delta: rate(asset.discount),
    annualExclusions: num(asset.annualExclusions),
    bSw: settings.swapCustom ? rate(settings.swapBasisPct) : null,
    gSw: settings.swapCustom ? rate(settings.swapGrowth) : null,
    ySw: settings.swapCustom ? rate(settings.swapYield) : null,
    tauSw: settings.swapCustom ? rate(settings.swapTaxRate) : null,
    discountAtDeath: Boolean(settings.discountAtDeath),
    saleAppliesToBaseline: Boolean(settings.saleAppliesToBaseline),
    burnShare: rate(settings.burnShare),
    ingFedOrd: rate(settings.ingFedOrd),
    ingFedLtcg: rate(settings.ingFedLtcg),
    ingStateRate: rate(settings.ingStateRate),
    ingAdminRate: rate(settings.ingAdminRate),
    ingStateTaxOnGrantor: Boolean(settings.ingStateTaxOnGrantor),
  };
}

// ---- the inputs audit page (src/hooks/inputRegister.js) -----------------------------------------------------------
// What the page should show as each field's model value, written from the field labels here, NOT from the page's own
// catalog: a field keyed to the wrong engine input there then disagrees with this table. Refs: G. grantor, E. estate,
// S. settings, A. asset. MEANING names the engine input the label implies (value from expectedEngineInputs); PARSE names
// how a field that feeds no single input is read ('pct' = percent to decimal, 'money', 'int', 'same' = as stored).
export const AUDIT_FIELD_MEANING = {
  'G.lifeTable': 'lifeTableId', 'G.age': 'age', 'G.deathYear': 'deathYearOverride', 'G.stateOrd': 'stateOrd', 'G.niit': 'niit',
  'G.stateLtcg': 'stateCg', 'G.married': 'married', 'G.spouseAge': 'ageSpouse', 'G.spouseDeathYear': 'deathYearOverrideSpouse',
  'G.portability': 'portability', 'E.spousePriorGifts': 'PS', 'E.otherEstate': 'E0', 'E.otherEstateGrowth': 'rE', 'E.exclusion': 'X0',
  'E.exclusionIndexing': 'pi', 'E.estateTaxRate': 'tauE', 'E.discountRate': 'd', 'E.priorGifts': 'P', 'E.yearsToSale': 'k',
  'E.maxYears': 'NDisp', 'S.discountAtDeath': 'discountAtDeath', 'S.saleAppliesToBaseline': 'saleAppliesToBaseline',
  'S.burnShare': 'burnShare', 'S.swapBasisPct': 'bSw', 'S.swapGrowth': 'gSw', 'S.swapYield': 'ySw', 'S.swapTaxRate': 'tauSw',
  'S.ingFedOrd': 'ingFedOrd', 'S.ingFedLtcg': 'ingFedLtcg', 'S.ingStateRate': 'ingStateRate', 'S.ingAdminRate': 'ingAdminRate',
  'S.ingStateTaxOnGrantor': 'ingStateTaxOnGrantor',
  'A.fmv': 'FMV', 'A.basis': 'B0', 'A.discount': 'delta', 'A.annualExclusions': 'annualExclusions', 'A.growth': 'g', 'A.yield': 'y',
  'A.saleYear': 'S', 'A.postSaleGrowth': 'gr', 'A.postSaleYield': 'yr',
};
export const AUDIT_FIELD_PARSE = {
  'G.fedOrd': 'pct', 'G.fedLtcg': 'pct', 'G.sex': 'same', 'G.spouseSex': 'same', 'G.useDeathYear': 'same',
  'E.beneFedLtcg': 'pct', 'E.beneStateLtcg': 'pct', 'E.beneNiit': 'same', 'E.priorExclusionMode': 'same', 'E.priorGiftYear': 'int',
  'E.priorGiftExclusion': 'money', 'E.spousePriorExclusionMode': 'same', 'E.spousePriorGiftYear': 'int', 'E.spousePriorGiftExclusion': 'money',
  'S.rankKey': 'same', 'S.swapCustom': 'same', 'A.name': 'same', 'A.source': 'same',
};
/**
 * Where a validation error must show on the audit page: for each injected error, exactly the typed fields behind it,
 * read off the definitions in expectedEngineInputs above (a stack is wrong because one of its parts is, and the page
 * cannot know which). `when` limits a case to the states it applies to.
 */
export const AUDIT_ROUTING_CASES = [
  // a part typed as 100% puts its stack at 100% or more whatever the other parts are
  { name: 'grantor ordinary stack at 100% or more', patch: { grantor: { fedOrd: '100' } }, parts: () => ['G.fedOrd', 'G.stateOrd', 'G.niit'] },
  { name: 'grantor capital-gain stack at 100% or more', patch: { grantor: { fedLtcg: '100' } }, parts: () => ['G.fedLtcg', 'G.stateLtcg', 'G.niit'] },
  { name: "heirs' stack at 100% or more", patch: { estate: { beneFedLtcg: '100' } },
    parts: ({ estate }) => ['E.beneFedLtcg', 'E.beneStateLtcg', ...(estate.beneNiit ? ['E.beneNiit', 'G.niit'] : [])] },
  // a negative federal rate is the only way a state component can exceed its stack less NIIT (state and NIIT cancel)
  { name: 'negative federal ordinary rate', patch: { grantor: { fedOrd: '-1' } }, parts: () => ['G.fedOrd'] },
  { name: 'negative federal LTCG rate', patch: { grantor: { fedLtcg: '-1' } }, parts: () => ['G.fedLtcg'] },
  // the trust's federal rate at 100%: its own range error, and the trust stack on all three of its parts
  { name: 'trust ordinary stack at 100% or more', patch: { settings: { ingFedOrd: '100' } }, parts: () => ['S.ingFedOrd', 'S.ingStateRate', 'G.niit'] },
  { name: 'trust capital-gain stack at 100% or more', patch: { settings: { ingFedLtcg: '100' } }, parts: () => ['S.ingFedLtcg', 'S.ingStateRate', 'G.niit'] },
  // the ING value factor 1 + g + (1 − trust ordinary stack) · y − fee: the asset's returns, the fee and the stack
  { name: 'ING loses all its value in a year', patch: { asset: { growth: '-99', yield: '2', saleYear: '0' }, settings: { ingAdminRate: '5' } },
    parts: () => ['A1.growth', 'S.ingAdminRate', 'S.ingFedOrd', 'S.ingStateRate', 'G.niit'] },
  // a negative indexing rate that takes the exclusion below $1M within the horizon: the rate and the exclusion it indexes
  // (only where the horizon has room to index: $1.5M halved twice is below $1M, once may not be)
  { name: 'negative indexing below the $1M floor', patch: { estate: { exclusion: '1500000', exclusionIndexing: '-50' } }, parts: () => ['E.exclusionIndexing', 'E.exclusion'],
    when: ({ grantor }) => !grantor.useDeathYear || Math.max(num(grantor.deathYear), grantor.married ? num(grantor.spouseDeathYear) : 0) >= 3 },
  { name: 'negative custom prior-gift exclusion', patch: { estate: { priorGifts: '1000000', priorExclusionMode: 'custom', priorGiftExclusion: '-5' } }, parts: () => ['E.priorGiftExclusion'] },
  { name: 'prior-gift year with no exclusion on file', patch: { estate: { priorGifts: '1000000', priorExclusionMode: 'year', priorGiftYear: '1990' } }, parts: () => ['E.priorGiftYear'] },
  // without prior gifts the exclusion they are measured against IS the basic exclusion: one error, on that field only
  { name: 'negative basic exclusion, no prior gifts', patch: { estate: { exclusion: '-5', priorGifts: '0' } }, parts: () => ['E.exclusion'],
    when: ({ grantor, estate }) => !(grantor.married && num(estate.spousePriorGifts) > 0) },
  { name: "negative custom exclusion for the spouse's gifts", when: ({ grantor }) => Boolean(grantor.married),
    patch: { estate: { spousePriorGifts: '1000000', spousePriorExclusionMode: 'custom', spousePriorGiftExclusion: '-5' } }, parts: () => ['E.spousePriorGiftExclusion'] },
  { name: "spouse's prior-gift year with no exclusion on file", when: ({ grantor }) => Boolean(grantor.married),
    patch: { estate: { spousePriorGifts: '1000000', spousePriorExclusionMode: 'year', spousePriorGiftYear: '1990' } }, parts: () => ['E.spousePriorGiftYear'] },
];
/**
 * Fields in use whose change can legitimately move no engine input, and when: the year and custom modes give the same
 * exclusion; NIIT added to the heirs' rate when NIIT is 0; the ranking order, which only reorders results.
 */
export const AUDIT_INERT_IN_USE = {
  'E.priorExclusionMode': ({ estate }) => BEA_BY_YEAR[Number(estate.priorGiftYear)] === num(estate.priorGiftExclusion),
  'E.spousePriorExclusionMode': ({ estate }) => BEA_BY_YEAR[Number(estate.spousePriorGiftYear)] === num(estate.spousePriorGiftExclusion),
  'E.beneNiit': ({ grantor }) => rate(grantor.niit) === 0,
  'S.rankKey': () => true,
};
/** Engine inputs a "display only" field may move, and when they are display only (ages beside assumed death years). */
export const AUDIT_DISPLAY_KEYS = {
  NDisp: () => true,
  age: (inp) => inp.deathYearOverride != null,
  ageSpouse: (inp) => inp.deathYearOverrideSpouse != null,
};
/** Reads a typed value the way its label says (for the fields in AUDIT_FIELD_PARSE). */
export function auditParse(kind, raw) {
  if (kind === 'pct') return rate(raw);
  if (kind === 'money') return num(raw);
  if (kind === 'int') { const v = num(raw); return Number.isInteger(v) ? v : NaN; }
  return raw;
}

