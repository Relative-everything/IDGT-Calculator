// Client-scenario generator for the eval sweep. Seeded (reproducible) and stratified so every region of the
// input space a planner meets is covered: estates below / straddling / far above the exclusion, prior gifts
// from none to gift-tax-paid, every asset archetype, every toggle, and the ING design space.
//
// About 45% of scenarios are married couples (estate tax at the second death); 15% use the legacy 2021 table.
//
// Scenarios are produced in the calculator's UI vocabulary (strings, percents) so the same case can be driven
// through the UI mapping (src/hooks/buildInputs.js) AND through the independent mapping (evals/oracle/ui.js).

const BEA = { 2011: 5_000_000, 2012: 5_120_000, 2013: 5_250_000, 2014: 5_340_000, 2015: 5_430_000, 2016: 5_450_000, 2017: 5_490_000,
  2018: 11_180_000, 2019: 11_400_000, 2020: 11_580_000, 2021: 11_700_000, 2022: 12_060_000, 2023: 12_920_000, 2024: 13_610_000, 2025: 13_990_000 };

/** mulberry32 — small, fast, seedable PRNG. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const weighted = (pairs) => {
    const total = pairs.reduce((a, [, w]) => a + w, 0);
    let x = next() * total;
    for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const between = (lo, hi) => lo + (hi - lo) * next();
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, pick, weighted, between, int };
}

const s = (x, digits = 4) => String(Number(x.toFixed(digits)));

/** Asset archetypes a planner actually brings to an IDGT conversation. */
export const ARCHETYPES = {
  growthStock: (R) => ({ fmv: R.pick([500_000, 1_000_000, 2_500_000, 10_000_000]), basisPct: R.between(0, 0.3), growth: R.between(5, 10), yield: R.between(0.5, 2), discount: 0 }),
  flpInterest: (R) => ({ fmv: R.pick([3_000_000, 8_000_000, 20_000_000]), basisPct: R.between(0.3, 0.9), growth: R.between(3, 7), yield: R.between(2, 4), discount: R.pick([15, 25, 30, 35]) }),
  preSaleBusiness: (R) => ({ fmv: R.pick([5_000_000, 15_000_000, 40_000_000]), basisPct: R.between(0, 0.15), growth: R.between(6, 14), yield: R.between(0, 1.5), discount: R.pick([20, 25, 30]), sale: true }),
  bondFund: (R) => ({ fmv: R.pick([1_000_000, 5_000_000]), basisPct: R.between(0.9, 1.05), growth: R.between(-0.5, 1), yield: R.between(3.5, 6), discount: 0 }),
  realEstate: (R) => ({ fmv: R.pick([2_000_000, 6_000_000]), basisPct: R.between(0.2, 0.6), growth: R.between(2, 5), yield: R.between(3, 6), discount: R.pick([0, 20, 30]) }),
  lossAsset: (R) => ({ fmv: R.pick([1_000_000, 3_000_000]), basisPct: R.between(1.05, 1.6), growth: R.between(0, 6), yield: R.between(0, 2), discount: 0 }),
  highGrowth: (R) => ({ fmv: R.pick([250_000, 1_000_000, 5_000_000]), basisPct: R.between(0, 0.05), growth: R.between(12, 25), yield: 0, discount: R.pick([0, 20]) }),
  smallGift: (R) => ({ fmv: R.pick([19_000, 38_000, 60_000]), basisPct: R.between(0.5, 1), growth: R.between(4, 8), yield: R.between(0, 3), discount: 0, smallGift: true }),
  flatAsset: (R) => ({ fmv: R.pick([1_000_000, 4_000_000]), basisPct: R.between(0.2, 1), growth: 0, yield: 0, discount: 0 }),
};

/**
 * One UI-state scenario. `profile` biases toward a stratum; everything else is drawn at random.
 * @returns {{ id:string, grantor:object, estate:object, settings:object, asset:object, tags:string[] }}
 */
export function makeScenario(R, id) {
  const tags = [];
  const archetype = R.pick(Object.keys(ARCHETYPES));
  tags.push(archetype);
  const a = ARCHETYPES[archetype](R);

  // Grantor
  const useDeathYear = R.next() < 0.3;
  const age = useDeathYear ? R.int(40, 95) : R.weighted([[R.int(35, 54), 2], [R.int(55, 74), 5], [R.int(75, 95), 3]]);
  const deathYear = useDeathYear ? R.weighted([[R.int(1, 3), 3], [R.int(4, 10), 3], [R.int(11, 40), 4]]) : 20;
  const stateOrd = R.pick([0, 0, 3.07, 5, 5.75, 9.3, 10.9, 13.3]);
  const niit = R.weighted([[3.8, 9], [0, 1]]);
  const grantor = {
    age: String(age), sex: R.pick(['male', 'female']), useDeathYear, deathYear: String(deathYear),
    fedOrd: R.weighted([['37', 8], ['35', 1], ['32', 1]]), stateOrd: s(stateOrd), niit: s(niit),
    fedLtcg: R.weighted([['20', 9], ['15', 1]]), stateLtcg: s(stateOrd === 0 ? 0 : Math.min(stateOrd, R.pick([stateOrd, 5, 4.25]))),
  };
  if (useDeathYear) tags.push('deterministic'); else tags.push('mortalityTable');

  // Estate band relative to the exclusion
  const band = R.weighted([['belowExclusion', 2], ['straddling', 3], ['taxable', 4], ['uhnw', 2]]);
  tags.push(band);
  const E0 = { belowExclusion: R.between(0.5e6, 9e6), straddling: R.between(10e6, 18e6), taxable: R.between(20e6, 60e6), uhnw: R.between(100e6, 400e6) }[band];
  const X0 = R.weighted([[15_000_000, 8], [7_000_000, 1], [13_990_000, 1]]);
  if (X0 !== 15_000_000) tags.push('legislativeExclusion');
  const priorKind = R.weighted([['none', 5], ['partial', 2], ['exhausted', 2], ['giftTaxPaid', 1], ['custom', 1]]);
  tags.push(`prior:${priorKind}`);
  const priorYear = R.pick(Object.keys(BEA));
  let priorGifts = 0;
  let priorExclusionMode = 'year';
  let priorGiftExclusion = '13990000';
  if (priorKind === 'partial') priorGifts = Math.round(R.between(0.1, 0.9) * BEA[priorYear]);
  if (priorKind === 'exhausted') priorGifts = BEA[priorYear];
  if (priorKind === 'giftTaxPaid') priorGifts = Math.round(BEA[priorYear] * R.between(1.05, 1.6));
  if (priorKind === 'custom') { priorExclusionMode = 'custom'; priorGiftExclusion = String(R.pick([11_700_000, 12_920_000, 13_990_000])); priorGifts = Math.round(R.between(2e6, 14e6)); }
  const beneNiit = R.next() < 0.8;
  const estate = {
    otherEstate: s(E0, 0), otherEstateGrowth: s(R.weighted([[R.between(2, 5), 8], [R.between(-1, 2), 1], [R.between(5, 8), 1]])),
    exclusion: String(X0), exclusionIndexing: s(R.weighted([[R.between(1.5, 3), 8], [0, 1], [R.between(-0.5, 0), 1]])),
    priorGifts: String(priorGifts), priorGiftYear: priorYear, priorExclusionMode, priorGiftExclusion,
    estateTaxRate: R.weighted([['40', 9], ['45', 0.5], ['35', 0.5]]),
    beneFedLtcg: R.weighted([['20', 9], ['15', 1]]), beneStateLtcg: s(R.pick([0, 5, 9.3, 13.3])), beneNiit,
    yearsToSale: String(R.pick([0, 1, 1, 3, 5])), discountRate: s(R.between(2, 8)), maxYears: String(R.pick([10, 35, 60])),
  };

  // Asset
  const hasSale = a.sale || R.next() < 0.12;
  const saleYear = hasSale ? R.int(1, 12) : 0;
  if (hasSale) tags.push('sale');
  const basis = a.fmv * a.basisPct;
  const giftValue = a.fmv * (1 - a.discount / 100);
  const annualExclusions = a.smallGift ? R.pick([giftValue, giftValue * 1.5, 19_000]) : R.weighted([[0, 7], [19_000 * R.int(1, 8), 3]]);
  if (a.discount > 0) tags.push('discount');
  if (annualExclusions > 0) tags.push('annualExclusions');
  const asset = {
    id: id, name: `${archetype} ${id}`, fmv: s(a.fmv, 0), discount: s(a.discount), basis: s(basis, 0), growth: s(a.growth), yield: s(a.yield),
    saleYear: String(saleYear), postSaleGrowth: s(R.between(4, 7)), postSaleYield: s(R.between(1, 3)), annualExclusions: s(annualExclusions, 0),
  };

  // Settings and toggles
  const tauOrd = (Number(grantor.fedOrd) + stateOrd + niit) / 100;
  const rE = Number(estate.otherEstateGrowth) / 100;
  const swapCustom = R.next() < 0.25;
  const neutral = R.next() < 0.4;
  const burnShare = R.weighted([[100, 6], [0, 1], [50, 1], [R.between(0, 100), 2]]);
  const settings = {
    rankKey: R.pick(['opt', 'none']),
    discountAtDeath: R.next() < 0.3,
    saleAppliesToBaseline: R.next() < 0.7,
    swapCustom,
    swapBasisPct: swapCustom && !neutral ? s(R.pick([0, 50, 100])) : '100',
    swapGrowth: swapCustom && !neutral ? s(R.between(0, 8)) : String(rE >= 0 ? 0 : rE * 100),
    swapYield: swapCustom && !neutral ? s(R.between(0, 5)) : String(rE >= 0 ? rE / (1 - tauOrd) * 100 : 0),
    swapTaxRate: swapCustom && !neutral ? s(R.between(20, 45)) : String(tauOrd * 100),
    burnShare: s(burnShare),
    ingFedOrd: R.weighted([['37', 9], ['35', 1]]), ingFedLtcg: '20',
    ingStateRate: s(R.weighted([[0, 6], [R.between(3, 10), 2], [stateOrd, 2]])),
    ingAdminRate: s(R.weighted([[0, 4], [0.25, 2], [0.5, 2], [1, 1], [1.5, 1]])),
    ingStateTaxOnGrantor: R.next() < 0.2,
  };
  // Life table and married couple (docs/changes/2026-09-27-life-tables/model.md): the second death decides the estate tax
  grantor.lifeTable = R.weighted([['ssa-2023-tr2026', 85], ['ssa-2021-legacy', 15]]);
  const married = R.next() < 0.45;
  grantor.married = married;
  grantor.spouseSex = R.next() < 0.85 ? (grantor.sex === 'male' ? 'female' : 'male') : grantor.sex;
  grantor.spouseAge = String(Math.min(100, Math.max(25, age + R.int(-10, 10))));
  grantor.spouseDeathYear = String(R.weighted([[R.int(1, 3), 3], [R.int(4, 10), 3], [R.int(11, 40), 4]]));
  grantor.portability = R.next() < 0.85;
  const spouseKind = R.weighted([['none', 12], ['partial', 4], ['exhausted', 2], ['giftTaxPaid', 1], ['custom', 1]]);
  const spouseYear = R.pick(Object.keys(BEA));
  let spouseGifts = 0;
  let spouseMode = 'year';
  let spouseExclusion = '13990000';
  if (spouseKind === 'partial') spouseGifts = Math.round(R.between(0.1, 0.9) * BEA[spouseYear]);
  if (spouseKind === 'exhausted') spouseGifts = BEA[spouseYear];
  if (spouseKind === 'giftTaxPaid') spouseGifts = Math.round(BEA[spouseYear] * R.between(1.05, 1.6));
  if (spouseKind === 'custom') { spouseMode = 'custom'; spouseExclusion = String(R.pick([11_700_000, 12_920_000, 13_990_000])); spouseGifts = Math.round(R.between(2e6, 14e6)); }
  Object.assign(estate, { spousePriorGifts: String(spouseGifts), spousePriorGiftYear: spouseYear, spousePriorExclusionMode: spouseMode, spousePriorGiftExclusion: spouseExclusion });
  if (grantor.lifeTable !== 'ssa-2023-tr2026' && !useDeathYear) tags.push('table:legacy');
  if (married) {
    tags.push('married');
    if (!grantor.portability) tags.push('portabilityOff');
    tags.push(`spousePrior:${spouseKind}`);
    if (grantor.spouseSex === grantor.sex) tags.push('sameSexCouple');
    if (Number(grantor.spouseAge) > age) tags.push('spouseOlder');
  } else tags.push('single');

  for (const k of ['discountAtDeath', 'saleAppliesToBaseline', 'swapCustom', 'ingStateTaxOnGrantor']) if (settings[k]) tags.push(k);
  if (swapCustom) tags.push(neutral ? 'swapNeutralCustom' : 'swapNonNeutral');
  if (burnShare < 100) tags.push('burnShare<100');
  if (Number(settings.ingAdminRate) > 0) tags.push('ingFee');
  if (!beneNiit) tags.push('beneNiitOff');
  return { id: String(id), grantor, estate, settings, asset, tags };
}

export function makeScenarios(n, seed = 20260927) {
  const R = rng(seed);
  return Array.from({ length: n }, (_, i) => makeScenario(R, i + 1));
}
