// CLEAN-ROOM ORACLE — what each UI field SHOULD mean to the engine, written from the labels and tooltips a
// planner sees (src/components/inputs/*.jsx), not from src/hooks/buildInputs.js.
//
// The basic exclusion table is restated here from the IRS revenue procedures so the eval also audits
// src/data/exclusionAmounts.js. The mortality column is taken from src/data (it cannot be re-derived offline;
// its provenance is audited separately and reported as UNVERIFIED).

import { SSA_2021_LX } from '../../src/data/mortalityTable.js';

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

function lxOf(sex) {
  const ages = Object.keys(SSA_2021_LX).map(Number).sort((a, b) => a - b);
  return ages.map((a) => SSA_2021_LX[a][sex]);
}

/** The engine input a planner's screen implies. */
export function expectedEngineInputs({ grantor, estate, settings, asset }) {
  const niit = rate(grantor.niit);
  const priorGifts = num(estate.priorGifts);
  const exclusionWhenMade = estate.priorExclusionMode === 'custom' ? num(estate.priorGiftExclusion) : BEA_BY_YEAR[Number(estate.priorGiftYear)];
  return {
    age: num(grantor.age),
    lx: grantor.useDeathYear ? null : lxOf(grantor.sex === 'female' ? 'female' : 'male'),
    deathYearOverride: grantor.useDeathYear ? num(grantor.deathYear) : null,
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
