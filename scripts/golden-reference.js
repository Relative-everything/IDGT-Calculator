import { calculateNPV_Gift } from '../src/engine/index.js';

const params = {
  assetFMV: 1_000_000,
  costBasis: 200_000,
  annualGrowthRate: 0.07,
  annualIncomeYield: 0.02,
  grantorAge: 65,
  gender: 'male',
  discountRate: 0.04,
  federalEstateTaxRate: 0.4,
  totalGrantorEstate: 10_000_000,
  maxYears: 35,
  beneficiaryFedLtcg: 0.2,
  beneficiaryStateLtcg: 0.05,
  returnAnnualDetail: true,
};

const result = calculateNPV_Gift(params);

const bestYear = result.annualDetail.reduce((best, row) => {
  if (!best || row.pvContributionThisYear > best.pvContributionThisYear) return row;
  return best;
}, null);

const giftValue = params.assetFMV;
const npvNoSwap = result.npv;
const efficiencyNoSwap = result.efficiencyRatio;
const optimalSwapYear = result.optimalSwapYear;
const npvOptimalSwap = result.pvTaxBurn + (bestYear?.pvContributionThisYear ?? 0);
const efficiencyOptimalSwap = npvOptimalSwap / giftValue;
const pvTaxBurn = result.pvTaxBurn;
const pvEstateTax = result.pvEstateTax;
const pvStepUp = result.pvStepUp;
const taxExclusiveGiftBenefit = result.taxExclusiveGiftBenefit;

console.log('--- Golden Reference Output ---');
console.log('Gift Value:', giftValue);
console.log('NPV No Swap:', npvNoSwap);
console.log('Efficiency Ratio No Swap:', efficiencyNoSwap);
console.log('Optimal Swap Year:', optimalSwapYear);
console.log('NPV Optimal Swap:', npvOptimalSwap);
console.log('Efficiency Ratio Optimal Swap:', efficiencyOptimalSwap);
console.log('PV Tax Burn:', pvTaxBurn);
console.log('PV Estate Tax Impact:', pvEstateTax);
console.log('PV Step-Up Impact:', pvStepUp);
console.log('Tax-Exclusive Gift Benefit:', taxExclusiveGiftBenefit);

console.log('\n--- Full calculateNPV_Gift Return Object ---');
console.log(JSON.stringify(result, null, 2));
