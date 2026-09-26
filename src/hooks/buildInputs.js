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
const int = (v) => {
  const n = parseNum(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

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
};
