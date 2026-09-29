// The app's default UI state (strings as typed, percents as percents). State only: the engine never sees these directly;
// buildInputs.js converts them. Shared by App.jsx, the asset editor, and the tests that check every field is wired and
// listed on the inputs audit page (inputRegister.test.js).
import { newId } from './scenarioIO.js';
import { DEFAULT_LIFE_TABLE_ID } from '../data/lifeTables/index.js';
import { BASIC_EXCLUSION_2026 } from '../data/exclusionAmounts.js';

export const DEFAULT_GRANTOR = Object.freeze({
  age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5',
  // life table and married couple (docs/changes/2026-09-27-life-tables/model.md)
  lifeTable: DEFAULT_LIFE_TABLE_ID, married: false, spouseAge: '63', spouseSex: 'female', spouseDeathYear: '25', portability: true,
});
export const DEFAULT_ESTATE = Object.freeze({
  otherEstate: '20000000', otherEstateGrowth: '3', exclusion: String(BASIC_EXCLUSION_2026), exclusionIndexing: '2',
  priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '13990000',
  spousePriorGifts: '0', spousePriorGiftYear: '2025', spousePriorExclusionMode: 'year', spousePriorGiftExclusion: '13990000',
  estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35',
});
export const DEFAULT_SETTINGS = Object.freeze({
  rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.535', swapTaxRate: '45.8',
  // ING comparison (docs/changes/2026-09-27-ing-comparison/model.md §1): classic full burn; trust at the federal top rates + NIIT in a no-tax situs
  burnShare: '100', ingFedOrd: '37', ingFedLtcg: '20', ingStateRate: '0', ingAdminRate: '0', ingStateTaxOnGrantor: false,
});

/** A new asset row; `source` is a free-text reference to the source document (label only, never used in the math). */
export const makeAsset = (over = {}) => ({
  id: newId(), name: 'Asset 1', source: '', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2',
  saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0', ...over,
});

export const DEFAULT_ASSETS = () => [
  makeAsset({ name: 'Growth stock (low basis)' }),
  makeAsset({ name: 'Family LP interest (30% discount)', fmv: '3000000', basis: '1500000', discount: '30', growth: '6', yield: '3' }),
  makeAsset({ name: 'Business interest, sale in yr 5', fmv: '5000000', basis: '500000', discount: '25', growth: '8', yield: '1', saleYear: '5', postSaleGrowth: '6', postSaleYield: '1.5' }),
];
