// Pure mapping from UI state (strings, percents) to the engine's flat input (numbers, decimals).
// No React. Every UI field is mapped here; buildInputs.test.js walks this mapping.

import { lxColumn } from '../engine/mortality.js';
import { SSA_2021_LX } from '../data/mortalityTable.js';
import { BASIC_EXCLUSION_BY_YEAR } from '../data/exclusionAmounts.js';

const LX_CACHE = {};

/** Parse a user-typed number; commas and blanks tolerated. Returns NaN when not a number. */
export function parseNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).replace(/[,\s$%]/g, '');
  if (s === '' || s === '-' || s === '.') return NaN;
  return Number(s);
}

const pct = (v) => parseNum(v) / 100;
/** Whole numbers only: a typed 65.5 is NaN here so validation reports it instead of silently rounding. */
const int = (v) => {
  const n = parseNum(v);
  return Number.isInteger(n) ? n : NaN;
};

/** UI field labels for validation messages. */
export const UI_LABELS = {
  age: 'Age', deathYear: 'Assumed death year', fedOrd: 'Federal ordinary rate', stateOrd: 'State ordinary rate', niit: 'NIIT',
  fedLtcg: 'Federal LTCG rate', stateLtcg: 'State LTCG rate',
  otherEstate: 'Other estate', otherEstateGrowth: 'Other-estate growth', exclusion: 'Basic exclusion', exclusionIndexing: 'Exclusion indexing',
  priorGifts: 'Prior taxable gifts', priorGiftExclusion: 'Prior-gift exclusion', estateTaxRate: 'Estate tax rate',
  beneFedLtcg: "Heirs' federal LTCG rate", beneStateLtcg: "Heirs' state LTCG rate", yearsToSale: 'Years until heirs sell',
  discountRate: 'Discount rate', maxYears: 'Table display horizon',
  swapBasisPct: 'Consideration basis', swapGrowth: 'Consideration growth', swapYield: 'Consideration yield', swapTaxRate: 'Rate on consideration yield',
  fmv: 'Fair market value', discount: 'Valuation discount', basis: 'Cost basis', growth: 'Appreciation', yield: 'Income yield',
  saleYear: 'Sale year', postSaleGrowth: 'Post-sale appreciation', postSaleYield: 'Post-sale yield', annualExclusions: 'Annual exclusions',
  burnShare: 'Share of trust tax the grantor bears', ingFedOrd: 'Trust federal ordinary rate', ingFedLtcg: 'Trust federal LTCG rate',
  ingStateRate: 'State rate the ING bears', ingAdminRate: 'ING administration cost',
};

/** The ING comparison's settings fields (docs/changes/2026-09-27-ing-comparison/model.md §1), all required strings. */
export const ING_SETTING_FIELDS = ['burnShare', 'ingFedOrd', 'ingFedLtcg', 'ingStateRate', 'ingAdminRate'];

/**
 * Field-level checks on the raw UI values (blank / non-numeric / non-integer) so the error lands on the
 * input the user typed in; engine validation covers ranges and cross-field rules.
 * @returns {{field:string, label:string, message:string}[]}
 */
export function validateUiFields({ grantor, estate, settings, asset }) {
  const errors = [];
  const need = (section, field, { integer = false } = {}) => {
    const n = parseNum(section[field]);
    if (!Number.isFinite(n)) errors.push({ field, label: UI_LABELS[field], message: `${UI_LABELS[field]} is required.` });
    else if (integer && !Number.isInteger(n)) errors.push({ field, label: UI_LABELS[field], message: `${UI_LABELS[field]} must be a whole number.` });
  };
  need(grantor, 'age', { integer: true });
  if (grantor.useDeathYear) need(grantor, 'deathYear', { integer: true });
  for (const f of ['fedOrd', 'stateOrd', 'niit', 'fedLtcg', 'stateLtcg']) need(grantor, f);
  for (const f of ['otherEstate', 'otherEstateGrowth', 'exclusion', 'exclusionIndexing', 'priorGifts', 'estateTaxRate', 'beneFedLtcg', 'beneStateLtcg', 'yearsToSale', 'discountRate']) need(estate, f);
  need(estate, 'maxYears', { integer: true });
  if (parseNum(estate.priorGifts) > 0 && estate.priorExclusionMode === 'custom') need(estate, 'priorGiftExclusion');
  if (settings.swapCustom) for (const f of ['swapBasisPct', 'swapGrowth', 'swapYield', 'swapTaxRate']) need(settings, f);
  for (const f of ING_SETTING_FIELDS) need(settings, f);
  for (const f of ['fmv', 'discount', 'basis', 'growth', 'yield', 'annualExclusions']) need(asset, f);
  need(asset, 'saleYear', { integer: true });
  if (parseNum(asset.saleYear) > 0) for (const f of ['postSaleGrowth', 'postSaleYield']) need(asset, f);
  return errors;
}

export function lxFor(sex) {
  const key = sex === 'female' ? 'female' : 'male';
  if (!LX_CACHE[key]) LX_CACHE[key] = lxColumn(SSA_2021_LX, key);
  return LX_CACHE[key];
}

/** Exclusion of the prior-gift year: from the table when a year is chosen, else the custom amount. */
export function priorGiftExclusion(estate) {
  if (estate.priorExclusionMode === 'custom') return parseNum(estate.priorGiftExclusion);
  const year = int(estate.priorGiftYear);
  return BASIC_EXCLUSION_BY_YEAR[year] ?? NaN;
}

/**
 * @param {object} p
 * @param {object} p.grantor - UI grantor state
 * @param {object} p.estate - UI estate/tax state
 * @param {object} p.settings - UI model settings
 * @param {object} p.asset - UI asset row
 * @returns {object} flat engine input
 */
export function buildEngineInputs({ grantor, estate, settings, asset }) {
  const P = parseNum(estate.priorGifts);
  const beneNiit = estate.beneNiit ? pct(grantor.niit) : 0;
  const custom = settings.swapCustom;
  return {
    // grantor
    age: int(grantor.age),
    lx: grantor.useDeathYear ? null : lxFor(grantor.sex),
    deathYearOverride: grantor.useDeathYear ? int(grantor.deathYear) : null,
    tauOrd: pct(grantor.fedOrd) + pct(grantor.stateOrd) + pct(grantor.niit),
    tauCg: pct(grantor.fedLtcg) + pct(grantor.stateLtcg) + pct(grantor.niit),
    // the same panel values un-summed, for the ING comparison (the trust stacks and the state-rate breakeven)
    stateOrd: pct(grantor.stateOrd),
    stateCg: pct(grantor.stateLtcg),
    niit: pct(grantor.niit),
    // estate and transfer tax
    tauBene: pct(estate.beneFedLtcg) + pct(estate.beneStateLtcg) + beneNiit,
    tauE: pct(estate.estateTaxRate),
    d: pct(estate.discountRate),
    rE: pct(estate.otherEstateGrowth),
    pi: pct(estate.exclusionIndexing),
    X0: parseNum(estate.exclusion),
    P: Number.isFinite(P) ? P : NaN,
    XP: P > 0 ? priorGiftExclusion(estate) : parseNum(estate.exclusion),
    E0: parseNum(estate.otherEstate),
    k: parseNum(estate.yearsToSale),
    NDisp: int(estate.maxYears),
    // asset
    FMV: parseNum(asset.fmv),
    B0: parseNum(asset.basis),
    g: pct(asset.growth),
    y: pct(asset.yield),
    S: int(asset.saleYear),
    gr: pct(asset.postSaleGrowth),
    yr: pct(asset.postSaleYield),
    delta: pct(asset.discount),
    annualExclusions: parseNum(asset.annualExclusions),
    // swap consideration (null = engine's neutral cash default)
    bSw: custom ? pct(settings.swapBasisPct) : null,
    gSw: custom ? pct(settings.swapGrowth) : null,
    ySw: custom ? pct(settings.swapYield) : null,
    tauSw: custom ? pct(settings.swapTaxRate) : null,
    // conventions
    discountAtDeath: Boolean(settings.discountAtDeath),
    saleAppliesToBaseline: Boolean(settings.saleAppliesToBaseline),
    // ING comparison (docs/changes/2026-09-27-ing-comparison/model.md §1)
    burnShare: pct(settings.burnShare),
    ingFedOrd: pct(settings.ingFedOrd),
    ingFedLtcg: pct(settings.ingFedLtcg),
    ingStateRate: pct(settings.ingStateRate),
    ingAdminRate: pct(settings.ingAdminRate),
    ingStateTaxOnGrantor: Boolean(settings.ingStateTaxOnGrantor),
  };
}

/** Human labels for engine field names, for validation messages. */
export const FIELD_LABELS = {
  age: 'Grantor age',
  deathYearOverride: 'Assumed death year',
  tauOrd: 'Grantor ordinary-income rate',
  tauCg: 'Grantor capital-gain rate',
  tauBene: 'Beneficiary capital-gain rate',
  tauE: 'Estate tax rate',
  d: 'Discount rate',
  rE: 'Other-estate growth',
  pi: 'Exclusion indexing',
  X0: 'Basic exclusion',
  P: 'Prior taxable gifts',
  XP: 'Prior-gift exclusion',
  E0: 'Other estate',
  k: 'Years until heirs sell',
  FMV: 'Fair market value',
  B0: 'Cost basis',
  g: 'Appreciation',
  y: 'Income yield',
  S: 'Sale year',
  gr: 'Post-sale growth',
  yr: 'Post-sale yield',
  delta: 'Valuation discount',
  annualExclusions: 'Annual exclusions',
  bSw: 'Consideration basis',
  gSw: 'Consideration growth',
  ySw: 'Consideration yield',
  tauSw: 'Rate on consideration yield',
  stateOrd: 'State ordinary rate',
  stateCg: 'State LTCG rate',
  niit: 'NIIT',
  burnShare: 'Share of trust tax the grantor bears',
  ingFedOrd: 'Trust federal ordinary rate',
  ingFedLtcg: 'Trust federal LTCG rate',
  ingStateRate: 'State rate the ING bears',
  ingAdminRate: 'ING administration cost',
  ingStateTaxOnGrantor: 'Home state taxes the grantor on the ING',
};
