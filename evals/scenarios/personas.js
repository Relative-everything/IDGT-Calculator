// Named client files — realistic planning situations an Associate Director of Planning would run through the
// calculator. Each is a full UI state (strings / percents) layered on the app's defaults (src/App.jsx).

export const DEFAULTS = {
  grantor: {
    age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5',
    lifeTable: 'ssa-2023-tr2026', married: false, spouseAge: '63', spouseSex: 'female', spouseDeathYear: '25', portability: true,
  },
  estate: {
    otherEstate: '20000000', otherEstateGrowth: '3', exclusion: '15000000', exclusionIndexing: '2',
    priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '13990000',
    spousePriorGifts: '0', spousePriorGiftYear: '2025', spousePriorExclusionMode: 'year', spousePriorGiftExclusion: '13990000',
    estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35',
  },
  settings: {
    rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.535', swapTaxRate: '45.8',
    burnShare: '100', ingFedOrd: '37', ingFedLtcg: '20', ingStateRate: '0', ingAdminRate: '0', ingStateTaxOnGrantor: false,
  },
  asset: { id: 'a', name: 'Asset', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2', saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0' },
};

const persona = (id, description, over) => ({
  id, description, tags: ['persona'],
  grantor: { ...DEFAULTS.grantor, ...over.grantor },
  estate: { ...DEFAULTS.estate, ...over.estate },
  settings: { ...DEFAULTS.settings, ...over.settings },
  asset: { ...DEFAULTS.asset, id, name: id, ...over.asset },
});

export const PERSONAS = [
  persona('P01-app-defaults', 'The app as shipped: 65M, $20M other estate, $1M low-basis growth stock.', {}),
  persona('P02-tech-founder-presale', 'Founder, 52, $60M estate, $20M pre-IPO stock at 25% discount, liquidity event in year 4.', {
    grantor: { age: '52', stateOrd: '13.3', stateLtcg: '13.3' },
    estate: { otherEstate: '60000000', otherEstateGrowth: '4' },
    asset: { fmv: '20000000', basis: '100000', discount: '25', growth: '15', yield: '0', saleYear: '4', postSaleGrowth: '6', postSaleYield: '2' },
  }),
  persona('P03-widow-flp-exhausted', 'Widow, 78F, used her 2021 exclusion; gifts a 35%-discounted FLP interest now (gift tax paid).', {
    grantor: { age: '78', sex: 'female' },
    estate: { otherEstate: '35000000', priorGifts: '11700000', priorGiftYear: '2021' },
    asset: { fmv: '8000000', basis: '5000000', discount: '35', growth: '5', yield: '3' },
  }),
  persona('P04-used-2025-exclusion', 'Couple member, 70M, fully used the 2025 exclusion; has the $1.01M OBBBA increase left.', {
    grantor: { age: '70' },
    estate: { otherEstate: '25000000', priorGifts: '13990000', priorGiftYear: '2025' },
    asset: { fmv: '3000000', basis: '600000', growth: '8', yield: '1.5' },
  }),
  persona('P05-modest-estate', 'Retiree, 72M, $6M estate — below the exclusion; the gift only costs the step-up.', {
    grantor: { age: '72' },
    estate: { otherEstate: '6000000' },
    asset: { fmv: '1500000', basis: '300000', growth: '6', yield: '2' },
  }),
  persona('P06-terminal-diagnosis', 'Grantor with a 2-year prognosis: assumed death year 2, exclusion exhausted → §2035(b) applies.', {
    grantor: { age: '68', useDeathYear: true, deathYear: '2' },
    estate: { otherEstate: '40000000', priorGifts: '13990000', priorGiftYear: '2025' },
    asset: { fmv: '5000000', basis: '1000000', growth: '7', yield: '2' },
  }),
  persona('P07-ny-ing-candidate', 'New York resident, 60M, weighing an ING for a dividend portfolio (NY taxes the grantor on INGs).', {
    grantor: { age: '60', stateOrd: '10.9', stateLtcg: '10.9' },
    estate: { otherEstate: '30000000' },
    settings: { ingStateTaxOnGrantor: true, ingAdminRate: '0.5' },
    asset: { fmv: '10000000', basis: '4000000', growth: '4', yield: '4' },
  }),
  persona('P08-ca-ing-no-flag', 'California resident, 55F, ING with a DE trustee; 1% fee on a low-yield growth asset (fee > after-tax yield).', {
    grantor: { age: '55', sex: 'female', stateOrd: '13.3', stateLtcg: '13.3' },
    estate: { otherEstate: '18000000' },
    settings: { ingAdminRate: '1' },
    asset: { fmv: '6000000', basis: '500000', growth: '9', yield: '0.8' },
  }),
  persona('P09-reimbursement-clause', 'IDGT with a discretionary reimbursement clause: trustee reimburses 60% of the burn.', {
    grantor: { age: '66' },
    estate: { otherEstate: '22000000' },
    settings: { burnShare: '40' },
    asset: { fmv: '4000000', basis: '800000', growth: '6', yield: '3' },
  }),
  persona('P10-discount-at-death', 'FLP with 30% discount; interest also discounted at death; swap likely.', {
    grantor: { age: '74' },
    estate: { otherEstate: '28000000' },
    settings: { discountAtDeath: true },
    asset: { fmv: '10000000', basis: '2000000', discount: '30', growth: '6', yield: '2.5' },
  }),
  persona('P11-loss-asset', 'Asset under water (basis above FMV) — the model should warn and not credit a loss.', {
    grantor: { age: '64' },
    asset: { fmv: '2000000', basis: '2600000', growth: '5', yield: '1' },
  }),
  persona('P12-crummey-small-gift', 'Small gift fully covered by 3 Crummey annual exclusions ($57,000).', {
    asset: { fmv: '57000', basis: '20000', annualExclusions: '57000', growth: '7', yield: '1' },
  }),
  persona('P13-legislative-7m', 'Legislative stress: exclusion cut to $7M, no indexing, 45% rate.', {
    grantor: { age: '58' },
    estate: { otherEstate: '16000000', exclusion: '7000000', exclusionIndexing: '0', estateTaxRate: '45' },
    asset: { fmv: '3000000', basis: '750000', growth: '7', yield: '2' },
  }),
  persona('P14-illiquid-grantor', 'Most wealth in the gifted asset: $2M other estate, $10M high-yield asset → burn exhausts the estate.', {
    grantor: { age: '60' },
    estate: { otherEstate: '2000000', otherEstateGrowth: '2' },
    asset: { fmv: '10000000', basis: '2000000', growth: '5', yield: '6' },
  }),
  persona('P15-custom-nonneutral-swap', 'Swap consideration is a growth portfolio (6% growth, 1% yield, 50% basis) — not return-neutral.', {
    grantor: { age: '70' },
    estate: { otherEstate: '30000000' },
    settings: { swapCustom: true, swapBasisPct: '50', swapGrowth: '6', swapYield: '1', swapTaxRate: '45.8' },
    asset: { fmv: '5000000', basis: '500000', growth: '8', yield: '1' },
  }),
  persona('P16-sale-no-baseline', 'Trust sells in year 3; the family would NOT have sold if kept (hold-to-death baseline).', {
    grantor: { age: '67' },
    estate: { otherEstate: '24000000' },
    settings: { saleAppliesToBaseline: false },
    asset: { fmv: '4000000', basis: '400000', growth: '8', yield: '1', saleYear: '3', postSaleGrowth: '6', postSaleYield: '2' },
  }),
  // Life tables and married couples (docs/changes/2026-09-27-life-tables/model.md)
  persona('P17-married-defaults', 'The app defaults with "Married" on: 65M and 63F, portability elected, $20M couple estate.', {
    grantor: { married: true },
  }),
  persona('P18-married-no-portability', 'Married, $20M estate, portability NOT elected: the grantor\'s exclusion is lost at a first death, so the gift uses it for free.', {
    grantor: { married: true, portability: false },
  }),
  persona('P19-young-founder-couple', 'Founder 45M, spouse 43F, $60M estate, $20M pre-IPO stock at 25% off, sale in year 6 — long joint horizon.', {
    grantor: { age: '45', married: true, spouseAge: '43', stateOrd: '13.3', stateLtcg: '13.3' },
    estate: { otherEstate: '60000000', otherEstateGrowth: '4' },
    asset: { fmv: '20000000', basis: '100000', discount: '25', growth: '14', yield: '0', saleYear: '6', postSaleGrowth: '6', postSaleYield: '2' },
  }),
  persona('P20-same-sex-exhausted', 'Same-sex couple 70F / 68F, grantor used the 2021 exclusion (gift tax on this gift; §2035(b) add-back taxed at a first death).', {
    grantor: { age: '70', sex: 'female', married: true, spouseAge: '68', spouseSex: 'female' },
    estate: { otherEstate: '40000000', priorGifts: '11700000', priorGiftYear: '2021' },
    asset: { fmv: '8000000', basis: '5000000', discount: '35', growth: '5', yield: '3' },
  }),
  persona('P21-spouse-made-a-slat', 'Grantor 72M, spouse 74F who funded a $10M SLAT in 2021: smaller DSUE if the spouse dies first, smaller own exclusion if not.', {
    grantor: { age: '72', married: true, spouseAge: '74' },
    estate: { otherEstate: '30000000', spousePriorGifts: '10000000', spousePriorGiftYear: '2021' },
    asset: { fmv: '5000000', basis: '1000000', growth: '7', yield: '2' },
  }),
  persona('P22-married-assumed-deaths', 'Assumed deaths: grantor year 3 (inside §2035(b)), spouse year 12; exclusion exhausted in 2025.', {
    grantor: { age: '74', married: true, spouseAge: '66', useDeathYear: true, deathYear: '3', spouseDeathYear: '12' },
    estate: { otherEstate: '45000000', priorGifts: '13990000', priorGiftYear: '2025' },
    asset: { fmv: '6000000', basis: '1500000', growth: '8', yield: '2.5' },
  }),
  persona('P23-legacy-table', 'The legacy 2021 table (unverified, flagged) for a 66M single grantor — reproduces earlier results.', {
    grantor: { age: '66', lifeTable: 'ssa-2021-legacy' },
    estate: { otherEstate: '26000000' },
    asset: { fmv: '3000000', basis: '500000', growth: '7', yield: '2' },
  }),
  persona('P24-married-ny-ing', 'NY couple 61M / 59F weighing an ING (NY taxes the grantor on INGs; 0.5% trustee fee).', {
    grantor: { age: '61', married: true, spouseAge: '59', stateOrd: '10.9', stateLtcg: '10.9' },
    estate: { otherEstate: '35000000' },
    settings: { ingStateTaxOnGrantor: true, ingAdminRate: '0.5' },
    asset: { fmv: '10000000', basis: '4000000', growth: '4', yield: '4' },
  }),
  persona('P25-older-spouse-custom-swap', 'Grantor 80M, older spouse 86F, sale in year 2, non-neutral custom consideration, 60% burn share.', {
    grantor: { age: '80', married: true, spouseAge: '86' },
    estate: { otherEstate: '22000000' },
    settings: { swapCustom: true, swapBasisPct: '50', swapGrowth: '5', swapYield: '1.5', swapTaxRate: '40', burnShare: '60' },
    asset: { fmv: '4000000', basis: '600000', growth: '9', yield: '1', saleYear: '2', postSaleGrowth: '5', postSaleYield: '2' },
  }),
  persona('P26-spouse-first-inside-2035b', 'Exclusion used in 2025, gift tax on this gift; assumed deaths spouse year 1, grantor year 2 — the add-back falls in the grantor\'s (second) estate, nothing is taxed at a first death.', {
    grantor: { age: '70', married: true, spouseAge: '72', useDeathYear: true, deathYear: '2', spouseDeathYear: '1' },
    estate: { otherEstate: '30000000', priorGifts: '13990000', priorGiftYear: '2025' },
    asset: { fmv: '2000000', basis: '500000', growth: '7', yield: '2' },
  }),
  persona('P27-married-ing-fee-after-grantor', 'ING with a 0.5% fee; the asset is sold in year 5 into a no-yield holding, but the grantor dies in year 2 — the ING (and its fee) ends then.', {
    grantor: { age: '76', married: true, spouseAge: '70', useDeathYear: true, deathYear: '2', spouseDeathYear: '10' },
    estate: { otherEstate: '25000000' },
    settings: { ingAdminRate: '0.5' },
    asset: { fmv: '3000000', basis: '900000', growth: '5', yield: '4', saleYear: '5', postSaleGrowth: '5', postSaleYield: '0' },
  }),
];
