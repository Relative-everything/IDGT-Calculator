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
  maxYears: 35,
  tcjaSunset: false,
  state: 'NY',
  totalGrantorEstate: 10_000_000,
  beneficiaryFedLtcg: 0.2,
  beneficiaryStateLtcg: 0.05,
  returnAnnualDetail: true,
};

const result = calculateNPV_Gift(params);
console.log('Result summary:', {
  npv: result.npv,
  pvTaxBurn: result.pvTaxBurn,
  pvEstateTax: result.pvEstateTax,
  pvStepUp: result.pvStepUp,
  optimalSwapYear: result.optimalSwapYear,
  efficiencyRatio: result.efficiencyRatio,
});
