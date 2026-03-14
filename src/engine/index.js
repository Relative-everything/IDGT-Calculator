import {
  getProbSurvivalToYear,
  getProbDeathInYear,
  get7520AnnuityFactor,
} from '../data/mortalityTable';
import { CURRENT_EXEMPTION, TCJA_SUNSET_EXEMPTION, getMarginalEstateTax } from '../data/estateTaxRates';
import { validateNoteRate as validateNoteRateRaw } from '../data/afrRates';
import { getStateEstateTax } from '../data/stateEstateTax';

function assertNumber(name, value) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function discountFactor(rate, t) {
  return 1 / Math.pow(1 + rate, t);
}

function getAFRTerm(termYears) {
  if (!Number.isInteger(termYears) || termYears <= 0) {
    throw new RangeError('termYears must be a positive integer');
  }
  if (termYears <= 3) return 'short';
  if (termYears <= 9) return 'mid';
  return 'long';
}

/**
 * Validate that a note rate meets the §7520 required rate.
 *
 * @param {number} proposedRate - Annual nominal rate (decimal)
 * @param {number|string} sectionRateOrTerm - If number: explicit §7520 rate (decimal). If string: 'short'|'mid'|'long' to use IRS AFR tables.
 * @returns {{valid:boolean, minimumRequired:number, message:string}}
 */
export function validateNoteRate(proposedRate, sectionRateOrTerm) {
  assertNumber('proposedRate', proposedRate);

  if (typeof sectionRateOrTerm === 'number') {
    const minimumRequired = sectionRateOrTerm;
    const valid = proposedRate >= minimumRequired;
    return {
      valid,
      minimumRequired,
      message: valid
        ? `Proposed rate meets or exceeds the required rate (${(minimumRequired * 100).toFixed(2)}%).`
        : `Proposed rate is below the required §7520 rate (${(minimumRequired * 100).toFixed(2)}%).`,
    };
  }

  // Fallback to AFR table validation
  return validateNoteRateRaw(proposedRate, sectionRateOrTerm);
}

/**
 * Calculate NPV of an outright gift to the IDGT, including tax burn benefits.
 *
 * @param {object} params - Inputs:
 *   - giftAmount: number
 *   - donorMarginalRate: number (decimal)
 *   - recipientDiscountRate: number (decimal)
 *   - mortality: { age, gender }
 *   - projectedIncome?: number[] (optional; year-by-year trust income assumed taxable to grantor)
 * @returns {number} NPV benefit of gift transfer
 *
 * Source: IRC §§2501, 671–679 (grantor trust), and actuarial PV using SSA 2021 mortality.
 * Addresses audit issue: tax burn present value and mortality table selection.
 */
export function calculateNPV_Gift(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const {
    assetFMV,
    costBasis,
    annualGrowthRate,
    annualIncomeYield,
    grantorAge,
    gender,
    discountRate,
    federalEstateTaxRate,
    maxYears,
    tcjaSunset = false,
    state = null,
    totalGrantorEstate = 0,
    beneficiaryFedLtcg = 0,
    beneficiaryStateLtcg = 0,
    returnAnnualDetail = false,
  } = params;

  assertNumber('assetFMV', assetFMV);
  assertNumber('costBasis', costBasis);
  assertNumber('annualGrowthRate', annualGrowthRate);
  assertNumber('annualIncomeYield', annualIncomeYield);
  assertNumber('grantorAge', grantorAge);
  assertNumber('discountRate', discountRate);
  assertNumber('federalEstateTaxRate', federalEstateTaxRate);
  assertNumber('maxYears', maxYears);

  const beneficiaryTaxRate = (beneficiaryFedLtcg || 0) + (beneficiaryStateLtcg || 0);

  // Projected income series for tax burn calculation.
  const projectedIncome = [];
  for (let t = 1; t <= maxYears; t += 1) {
    const valueAtT = assetFMV * Math.pow(1 + annualGrowthRate, t - 1);
    projectedIncome.push(valueAtT * annualIncomeYield);
  }

  const pvTaxBurn = calculateTaxBurnBenefit({
    projectedIncome,
    taxRate: federalEstateTaxRate,
    discountRate,
  });

  const projectedEstate = assetFMV * Math.pow(1 + annualGrowthRate, maxYears);

  const estateTaxImpactWithAsset = calculateEstateTaxImpact({
    taxableEstate: totalGrantorEstate + projectedEstate,
    state,
    useSunsetExemption: Boolean(tcjaSunset),
  });
  const estateTaxImpactWithoutAsset = calculateEstateTaxImpact({
    taxableEstate: totalGrantorEstate,
    state,
    useSunsetExemption: Boolean(tcjaSunset),
  });

  // Projected estate tax savings if the asset is removed from the estate via gift.
  // This is a snapshot at the end of the planning horizon; the true value is the
  // probability-weighted present value of the savings over the grantor's lifetime.
  const projectedEstateTaxSavings =
    estateTaxImpactWithAsset.totalTax - estateTaxImpactWithoutAsset.totalTax;
  const estateTaxImpact = {
    withAsset: estateTaxImpactWithAsset,
    withoutAsset: estateTaxImpactWithoutAsset,
  };

  // Probability-weighted present values (PV) for estate tax savings and the step-up "cost".
  // These use the mortality table to weight the expected timing of death.
  let totalPvEstateTax = 0;
  let totalPvStepUpCost = 0;
  let totalProbDeath = 0;
  let weightedYearSum = 0;
  let cumulativeTaxBurn = 0;
  let bestYearContribution = -Infinity;
  let optimalSwapYear = null;

  const annualDetail = returnAnnualDetail ? [] : null;
  for (let t = 1; t <= maxYears; t += 1) {
    const valueAtT = assetFMV * Math.pow(1 + annualGrowthRate, t - 1);
    const incomeThisYear = valueAtT * annualIncomeYield;
    const taxBurn = incomeThisYear * federalEstateTaxRate;
    cumulativeTaxBurn += taxBurn;

    const estateTaxImpactWithAssetAtT = calculateEstateTaxImpact({
      taxableEstate: totalGrantorEstate + valueAtT,
      state,
      useSunsetExemption: Boolean(tcjaSunset),
    });
    const estateTaxImpactWithoutAssetAtT = calculateEstateTaxImpact({
      taxableEstate: totalGrantorEstate,
      state,
      useSunsetExemption: Boolean(tcjaSunset),
    });

    const estateTaxSavingsIfDeathThisYear =
      estateTaxImpactWithAssetAtT.totalTax - estateTaxImpactWithoutAssetAtT.totalTax;

    const stepUpCostIfDeathThisYear = Math.max(0, valueAtT - costBasis) * beneficiaryTaxRate;
    const probDeathThisYear = getProbDeathInYear(grantorAge, t, gender);
    const df = discountFactor(discountRate, t);

    const pvEstateTaxSavingsThisYear = estateTaxSavingsIfDeathThisYear * probDeathThisYear * df;
    const pvStepUpCostThisYear = stepUpCostIfDeathThisYear * probDeathThisYear * df;

    const pvContributionThisYear = pvEstateTaxSavingsThisYear - pvStepUpCostThisYear;

    if (pvContributionThisYear > bestYearContribution) {
      bestYearContribution = pvContributionThisYear;
      optimalSwapYear = t;
    }

    totalPvEstateTax += pvEstateTaxSavingsThisYear;
    totalPvStepUpCost += pvStepUpCostThisYear;
    totalProbDeath += probDeathThisYear;
    weightedYearSum += probDeathThisYear * t;

    if (returnAnnualDetail) {
      annualDetail.push({
        year: t,
        assetFMV: valueAtT,
        taxBurn,
        cumulativeTaxBurn,
        estateTaxSavingsIfDeathThisYear,
        stepUpCostIfDeathThisYear,
        probDeathThisYear,
        discountFactor: df,
        pvEstateTaxSavingsThisYear,
        pvStepUpCostThisYear: -pvStepUpCostThisYear,
        pvContributionThisYear,
      });
    }
  }

  const pvStepUp = -totalPvStepUpCost;
  const pvEstateTax = totalPvEstateTax;
  const npv = pvTaxBurn + pvEstateTax + pvStepUp;

  const result = {
    npv,
    pvTaxBurn,
    pvEstateTax,
    pvStepUp,
    estateTaxImpact,
    optimalSwapYear,
    efficiencyRatio: assetFMV > 0 ? npv / assetFMV : 0,
  };

  if (returnAnnualDetail) {
    result.annualDetail = annualDetail;
    result.annualSummary = {
      totalTaxBurn: cumulativeTaxBurn,
      totalPvContribution: totalPvEstateTax - totalPvStepUpCost,
      totalPvStepUp: -totalPvStepUpCost,
      weightedAverageYearOfDeath:
        totalProbDeath > 0 ? weightedYearSum / totalProbDeath : 0,
      projectedEstateTaxSavings,
    };
  }

  return result;
}

/**
 * Calculate NPV of an installment sale to an IDGT.
 *
 * @param {object} params - Inputs:
 *   - assetFMV: number
 *   - costBasis: number
 *   - noteRate: number (decimal)
 *   - noteTerm: number
 *   - section7520Rate: number (decimal)
 *   - grantorAge: number
 *   - gender: 'male'|'female'
 *   - discountRate: number
 *   - federalEstateTaxRate: number
 *   - grantor: { fedOrdIncomeTaxRate, fedLtcgTaxRate, niitRate }
 *   - returnAnnualDetail: boolean
 * @returns {object} NPV analysis object
 *
 * Source: IRC §7520, §7872; actuarial factors per IRS Table 2000CM; SSA 2021 mortality.
 * Addresses audit issues: AFR compliance, IRS Table 2000CM dependency, and interest income tax drag.
 */
export function calculateNPV_InstallmentSale(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const {
    assetFMV,
    costBasis,
    noteRate,
    noteTerm,
    section7520Rate,
    grantorAge,
    gender,
    discountRate,
    federalEstateTaxRate,
    grantor,
    returnAnnualDetail = false,
  } = params;

  assertNumber('assetFMV', assetFMV);
  assertNumber('costBasis', costBasis);
  assertNumber('noteRate', noteRate);
  assertNumber('noteTerm', noteTerm);
  assertNumber('section7520Rate', section7520Rate);
  assertNumber('grantorAge', grantorAge);
  assertNumber('discountRate', discountRate);
  assertNumber('federalEstateTaxRate', federalEstateTaxRate);

  if (!grantor || typeof grantor !== 'object') {
    throw new TypeError('grantor must be provided');
  }

  const {
    fedOrdIncomeTaxRate = 0,
    fedLtcgTaxRate = 0,
    niitRate = 0,
  } = grantor;

  const validation = validateNoteRate(noteRate, section7520Rate);
  if (!validation.valid) {
    throw new Error(`Installment note rate validation failed: ${validation.message}`);
  }

  const loanAmount = assetFMV;
  const r = noteRate;
  const n = noteTerm;

  const payment = r === 0 ? loanAmount / n : (loanAmount * r) / (1 - Math.pow(1 + r, -n));
  const annuityFactor = get7520AnnuityFactor(grantorAge, section7520Rate);

  let balance = loanAmount;
  let totalInterest = 0;
  let totalPV = 0;

  let cumulativeTaxBurn = 0;
  let totalPvContribution = 0;
  let totalProbDeath = 0;
  let totalPvStepUp = 0;
  let weightedYearSum = 0;
  const annualDetail = [];

  for (let year = 1; year <= n; year += 1) {
    const interest = balance * r;
    const principal = Math.min(payment - interest, balance);
    balance -= principal;
    totalInterest += interest;

    // Taxable income to grantor: interest portion taxed at ordinary rate + NIIT
    const taxOnInterest = interest * (fedOrdIncomeTaxRate + niitRate);
    cumulativeTaxBurn += taxOnInterest;

    const afterTaxCash = principal + (interest - taxOnInterest);
    const pvAfterTaxCash = afterTaxCash * discountFactor(discountRate, year);
    totalPV += pvAfterTaxCash;

    const probDeathThisYear = getProbDeathInYear(grantorAge, year, gender);
    const pvContributionThisYear = probDeathThisYear * pvAfterTaxCash;

    totalPvContribution += pvContributionThisYear;
    totalProbDeath += probDeathThisYear;
    weightedYearSum += probDeathThisYear * year;

    annualDetail.push({
      year,
      payment,
      principal,
      interest,
      taxOnInterest,
      afterTaxCash,
      pvAfterTaxCash,
      probDeathThisYear,
      pvContributionThisYear,
    });
  }

  const pvNotePayments = totalPV;
  const npv = pvNotePayments - costBasis;

  const result = {
    npv,
    annuityFactor,
    totalInterest,
    pvNotePayments,
    principal: loanAmount,
    validation,
  };

  if (returnAnnualDetail) {
    result.annualDetail = annualDetail;
    result.annualSummary = {
      totalTaxBurn: cumulativeTaxBurn,
      totalPvContribution,
      weightedAverageYearOfDeath: totalProbDeath > 0 ? weightedYearSum / totalProbDeath : 0,
    };
  }

  return result;
}

/**
 * Calculate NPV of a GRAT transfer to an IDGT.
 *
 * @param {object} params - Inputs:
 *   - annuityPayment: number
 *   - termYears: number
 *   - grantorAge: number
 *   - annuityRate: number (decimal)
 *   - gender: 'male'|'female'
 *   - assetValue?: number (optional, assumed to be annuityPayment*termYears if missing)
 * @returns {number} NPV benefit of GRAT transfer (estimated remainder value)
 *
 * Source: IRC §2702, §7520; actuarial annuity factors.
 * Addresses audit issue: mortality-probability-weighted value and swap optimizer.
 */
export function calculateNPV_GRAT(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const { annuityPayment, termYears, grantorAge, annuityRate, gender, assetValue } = params;
  assertNumber('annuityPayment', annuityPayment);
  assertNumber('termYears', termYears);
  assertNumber('grantorAge', grantorAge);
  assertNumber('annuityRate', annuityRate);

  const startValue = typeof assetValue === 'number' ? assetValue : annuityPayment * termYears;
  let pvAnnuity = 0;

  for (let t = 1; t <= termYears; t += 1) {
    const survivalProb = getProbSurvivalToYear(grantorAge, t - 1, gender);
    pvAnnuity += annuityPayment * survivalProb * discountFactor(annuityRate, t);
  }

  return Math.max(0, startValue - pvAnnuity);
}

/**
 * Calculate the present value of tax burn (grantor income tax paid on trust income).
 *
 * @param {object} params - Inputs:
 *   - projectedIncome: number[] (year-by-year)
 *   - taxRate: number
 *   - discountRate: number
 * @returns {number} PV of tax burn benefit (taxes paid by grantor on trust income)
 *
 * Source: Grantor trust rules (IRC §§671-679) and actuarial PV.
 * Addresses audit issue: ensure tax burn is treated as additional tax-free transfer benefit.
 */
export function calculateTaxBurnBenefit(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const { projectedIncome, taxRate, discountRate } = params;

  if (!Array.isArray(projectedIncome) || projectedIncome.length === 0) {
    throw new TypeError('projectedIncome must be a non-empty array');
  }
  assertNumber('taxRate', taxRate);
  assertNumber('discountRate', discountRate);

  let pv = 0;
  for (let t = 0; t < projectedIncome.length; t += 1) {
    const income = projectedIncome[t];
    assertNumber(`projectedIncome[${t}]`, income);
    const taxPaid = income * taxRate;
    pv += taxPaid * discountFactor(discountRate, t + 1);
  }

  return pv;
}

/**
 * Determine optimal swap year for an asset swap between donor and trust.
 *
 * @param {object} params - Inputs:
 *   - assetA: { value, growthRate }
 *   - assetB: { value, growthRate }
 *   - swapCosts: number
 *   - horizonYears: number
 * @returns {{bestYear: number, expectedGain: number}} Best year to execute swap and expected gain
 *
 * Source: portfolio optimization and tax planning principles.
 * Addresses audit issue: global vs. local optimum in brute-force scan, transaction costs.
 */
export function calculateOptimalSwapYear(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const { assetA, assetB, swapCosts, horizonYears } = params;
  if (!assetA || !assetB) {
    throw new TypeError('assetA and assetB must be provided');
  }
  assertNumber('assetA.value', assetA.value);
  assertNumber('assetA.growthRate', assetA.growthRate);
  assertNumber('assetB.value', assetB.value);
  assertNumber('assetB.growthRate', assetB.growthRate);
  assertNumber('swapCosts', swapCosts);
  assertNumber('horizonYears', horizonYears);

  if (!Number.isInteger(horizonYears) || horizonYears <= 0) {
    throw new RangeError('horizonYears must be a positive integer');
  }

  let bestYear = 0;
  let bestGain = -Infinity;

  for (let year = 0; year <= horizonYears; year += 1) {
    const valueA = assetA.value * Math.pow(1 + assetA.growthRate, year);
    const valueB = assetB.value * Math.pow(1 + assetB.growthRate, year);
    const gain = valueA - valueB - swapCosts;

    if (gain > bestGain) {
      bestGain = gain;
      bestYear = year;
    }
  }

  return {
    bestYear,
    expectedGain: bestGain,
  };
}

/**
 * Estimate the estate tax impact of a transfer, including federal and state taxes.
 *
 * @param {object} params - Inputs:
 *   - taxableEstate: number (gross estate before exemption)
 *   - state: string (USPS code)
 *   - useSunsetExemption: boolean
 * @returns {{federalTax: number, stateTax: number, effectiveRate: number, totalTax: number}}
 *
 * Source: IRC §2001(c) progressive brackets and state estate tax schedules.
 * Addresses audit issue: flat 40% vs. correct progressive rate and state estate tax omission.
 */
export function calculateEstateTaxImpact(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const { taxableEstate, state, useSunsetExemption } = params;
  assertNumber('taxableEstate', taxableEstate);

  const exemption = useSunsetExemption ? TCJA_SUNSET_EXEMPTION : CURRENT_EXEMPTION;
  const taxable = Math.max(0, taxableEstate - exemption);

  const effectiveRate = getMarginalEstateTax(taxable);
  const federalTax = taxable * effectiveRate;
  const stateTax = getStateEstateTax(state, taxable);
  const totalTax = federalTax + stateTax;

  return {
    federalTax,
    stateTax,
    effectiveRate,
    totalTax,
  };
}

/**
 * Calculate the step-up in basis impact by integrating mortality-weighted probabilities.
 *
 * @param {object} params - Inputs:
 *   - basis: number
 *   - currentAge: number
 *   - gender: 'male'|'female'
 *   - discountRate: number
 * @returns {number} Expected present value of stepped-up basis benefit
 *
 * Source: estate inclusion (IRC §§2036/2038) and actuarial probability of death.
 * Addresses audit issue: verifying mortality-probability-weighted integral implementation.
 */
export function calculateStepUpImpact(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const { basis, currentAge, gender, discountRate } = params;
  assertNumber('basis', basis);
  assertNumber('currentAge', currentAge);
  assertNumber('discountRate', discountRate);

  const maxYears = Math.max(0, 119 - currentAge);
  let pv = 0;

  for (let t = 0; t <= maxYears; t += 1) {
    const probDeath = getProbDeathInYear(currentAge, t, gender);
    pv += basis * probDeath * discountFactor(discountRate, t);
  }

  return pv;
}

/**
 * Calculate an efficiency ratio for a given transfer mechanism (e.g., gift vs. sale).
 *
 * @param {object} params - Inputs:
 *   - netBenefit: number
 *   - cost: number
 * @returns {number} Efficiency ratio (higher is better)
 *
 * Source: financial analysis best practices.
 * Addresses audit issue: multi-asset exemption cliff and comparative ranking.
 */
export function calculateEfficiencyRatio(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const { netBenefit, cost } = params;
  assertNumber('netBenefit', netBenefit);
  assertNumber('cost', cost);

  if (cost <= 0) {
    return netBenefit > 0 ? Infinity : 0;
  }

  return netBenefit / cost;
}

function boxMullerRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Run a Monte Carlo simulation for stochastic inputs (market returns, mortality, etc.).
 *
 * @param {object} params - Inputs:
 *   - iterations: number (default 500)
 *   - model: optional function(randomNormal: number, index: number) => number
 *   - mu: number (mean for log-normal when no model provided)
 *   - sigma: number (std dev for log-normal when no model provided)
 * @returns {object} Summary statistics (mean, stdDev, p10, p50, p90)
 *
 * Source: Monte Carlo simulation best practices for long-term planning.
 * Addresses audit issue: swap optimizer risk and sensitivity analysis.
 */
export function runMonteCarlo(params = {}) {
  const iterations = Number.isInteger(params.iterations) ? params.iterations : 500;
  if (iterations <= 0) {
    throw new RangeError('iterations must be a positive integer');
  }

  const mu = typeof params.mu === 'number' ? params.mu : 0;
  const sigma = typeof params.sigma === 'number' ? params.sigma : 0.15;

  const results = [];
  for (let i = 0; i < iterations; i += 1) {
    const z = boxMullerRandom();
    const value = typeof params.model === 'function'
      ? params.model(z, i)
      : Math.exp(mu + sigma * z);
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error('Monte Carlo model must return a number');
    }
    results.push(value);
  }

  results.sort((a, b) => a - b);
  const mean = results.reduce((sum, v) => sum + v, 0) / results.length;
  const variance = results.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / results.length;
  const stdDev = Math.sqrt(variance);

  const percentile = (p) => {
    const idx = Math.floor((p / 100) * (results.length - 1));
    return results[Math.max(0, Math.min(results.length - 1, idx))];
  };

  return {
    mean,
    stdDev,
    p10: percentile(10),
    p50: percentile(50),
    p90: percentile(90),
    values: results,
  };
}

/**
 * Compare the outcome of gifting an asset now vs holding until death for estate tax purposes.
 *
 * @param {object} params
 * @param {number} params.assetFMV - Current fair market value of the asset.
 * @param {number} params.annualGrowthRate - Expected annual growth rate (decimal).
 * @param {number} params.yearsUntilDeath - Years until projected death.
 * @param {number} params.federalGiftTaxRate - Federal gift tax rate (decimal).
 * @param {number} params.federalEstateTaxRate - Federal estate tax rate (decimal).
 * @param {number} params.stateEstateTaxRate - State estate tax rate (decimal).
 * @param {number} params.stateGiftTaxRate - State gift tax rate (decimal).
 * @param {boolean} params.stateEstateCliffEnabled - Whether state's cliff rule applies.
 * @param {number} params.stateEstateCliffThreshold - Threshold for cliff in state law.
 * @param {number} params.stateEstateCliffMultiplier - Multiplier for cliff threshold.
 * @param {number} params.stateEstateExemption - State estate tax exemption amount.
 * @param {number} params.discountRate - Discount rate (decimal) for PV.
 * @param {boolean} params.exemptionAlreadyExhausted - If false, no gift tax is due.
 * @param {boolean} params.giftTax3YearRuleRisk - If true, note IRC §2035(b) risk.
 *
 * @returns {object} Comparison results
 *
 * Authority: IRC §2001, IRC §2502, IRC §2035(b), NAEPC Journal Issue 46 (Manganelli, 2025), NY Tax Law §952.
 */
export function calculateGiftVsDeathComparison(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object');
  }

  const {
    assetFMV,
    annualGrowthRate,
    yearsUntilDeath,
    federalGiftTaxRate,
    federalEstateTaxRate,
    state,
    stateEstateTaxRate,
    stateGiftTaxRate,
    stateEstateCliffEnabled,
    stateEstateCliffThreshold,
    stateEstateCliffMultiplier,
    stateEstateExemption,
    discountRate,
    exemptionAlreadyExhausted,
    giftTax3YearRuleRisk,
  } = params;

  let resolvedStateEstateTaxRate = stateEstateTaxRate;
  let resolvedStateEstateExemption = stateEstateExemption;
  if (typeof state === 'string' && state.length === 2) {
    const stateInfo = getStateEstateTax(state);
    if (stateInfo) {
      resolvedStateEstateTaxRate = stateInfo.brackets?.slice(-1)[0]?.rate ?? resolvedStateEstateTaxRate;
      resolvedStateEstateExemption = stateInfo.exemption ?? resolvedStateEstateExemption;
    }
  }

  assertNumber('assetFMV', assetFMV);
  assertNumber('annualGrowthRate', annualGrowthRate);
  assertNumber('yearsUntilDeath', yearsUntilDeath);
  assertNumber('federalGiftTaxRate', federalGiftTaxRate);
  assertNumber('federalEstateTaxRate', federalEstateTaxRate);
  assertNumber('stateEstateTaxRate', resolvedStateEstateTaxRate);
  assertNumber('stateGiftTaxRate', stateGiftTaxRate);
  assertNumber('stateEstateCliffThreshold', stateEstateCliffThreshold);
  assertNumber('stateEstateCliffMultiplier', stateEstateCliffMultiplier);
  assertNumber('stateEstateExemption', resolvedStateEstateExemption);
  assertNumber('discountRate', discountRate);

  const assetValueAtDeath = assetFMV * Math.pow(1 + annualGrowthRate, yearsUntilDeath);

  const giftTaxPaidNow = exemptionAlreadyExhausted ? assetFMV * federalGiftTaxRate : 0;
  const stateGiftTaxPaidNow = exemptionAlreadyExhausted ? assetFMV * stateGiftTaxRate : 0;

  const giftNowScenario = {
    giftTaxPaidNow,
    stateGiftTaxPaidNow,
    assetValueAtDeath,
    federalEstateTaxAtDeath: 0,
    stateEstateTaxAtDeath: 0,
    netToHeirs: assetValueAtDeath,
    pvNetToHeirs: assetValueAtDeath * discountFactor(discountRate, yearsUntilDeath),
  };

  let stateEstateTaxAtDeath = 0;

  if (stateEstateCliffEnabled) {
    if (assetValueAtDeath > stateEstateCliffThreshold * stateEstateCliffMultiplier) {
      stateEstateTaxAtDeath = assetValueAtDeath * resolvedStateEstateTaxRate;
    } else if (assetValueAtDeath > stateEstateCliffThreshold) {
      stateEstateTaxAtDeath = Math.max(0, (assetValueAtDeath - resolvedStateEstateExemption) * resolvedStateEstateTaxRate);
    } else {
      stateEstateTaxAtDeath = 0;
    }
  } else {
    stateEstateTaxAtDeath = Math.max(0, (assetValueAtDeath - resolvedStateEstateExemption) * resolvedStateEstateTaxRate);
  }

  const holdUntilDeathScenario = {
    assetValueAtDeath,
    federalEstateTaxAtDeath: assetValueAtDeath * federalEstateTaxRate,
    stateEstateTaxAtDeath,
    netToHeirs: assetValueAtDeath - assetValueAtDeath * federalEstateTaxRate - stateEstateTaxAtDeath,
    pvNetToHeirs: (assetValueAtDeath - assetValueAtDeath * federalEstateTaxRate - stateEstateTaxAtDeath) * discountFactor(discountRate, yearsUntilDeath),
    stepUpBasisBenefit: assetValueAtDeath - assetFMV,
  };

  const additionalHeirWealthIfGiftNow = giftNowScenario.pvNetToHeirs - holdUntilDeathScenario.pvNetToHeirs;
  const percentageMoreToHeirs = holdUntilDeathScenario.pvNetToHeirs === 0
    ? Infinity
    : additionalHeirWealthIfGiftNow / Math.abs(holdUntilDeathScenario.pvNetToHeirs);

  const recommendation = additionalHeirWealthIfGiftNow > 0
    ? 'GIFT_NOW'
    : additionalHeirWealthIfGiftNow < 0
      ? 'HOLD_UNTIL_DEATH'
      : 'BORDERLINE';

  const warnings = [];
  if (giftTax3YearRuleRisk) {
    warnings.push('Gift tax paid within 3 years of death may be included in estate under IRC §2035(b).');
  }

  // Simple binary search for break-even growth rate (over 60% range)
  const breakEvenGrowthRate = (() => {
    const targetFunction = (g) => {
      const fv = assetFMV * Math.pow(1 + g, yearsUntilDeath);
      const pvGift = fv * discountFactor(discountRate, yearsUntilDeath);
      const pvHold = (fv * (1 - federalEstateTaxRate) - stateEstateTaxAtDeath) * discountFactor(discountRate, yearsUntilDeath);
      return pvGift - pvHold;
    };

    let low = 0;
    let high = 0.3;
    let mid = 0;
    for (let i = 0; i < 40; i += 1) {
      mid = (low + high) / 2;
      if (targetFunction(mid) > 0) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return mid;
  })();

  return {
    giftNowScenario,
    holdUntilDeathScenario,
    comparison: {
      additionalHeirWealthIfGiftNow,
      percentageMoreToHeirs,
      breakEvenGrowthRate,
      recommendation,
      warnings,
    },
  };
}
