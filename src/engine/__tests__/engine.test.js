import { describe, it, expect } from 'vitest';
import {
  validateNoteRate,
  calculateNPV_InstallmentSale,
  calculateNPV_Gift,
  runMonteCarlo,
  calculateGiftVsDeathComparison,
} from '../index.js';
import { getMarginalEstateTax } from '../../data/estateTaxRates.js';

describe('Engine core functions', () => {
  it('validateNoteRate should flag below-AFR rates', () => {
    const result = validateNoteRate(0.03, 0.0382);
    expect(result.valid).toBe(false);
    expect(result.message.toLowerCase()).toContain('below');
  });

  it('validateNoteRate should accept rates above AFR', () => {
    const result = validateNoteRate(0.05, 0.0382);
    expect(result.valid).toBe(true);
  });

  it('getMarginalEstateTax should compute progressive tax correctly', () => {
    // Taxable estate after exemption: $1,390,000 (effective rate expected ~40%)
    const effectiveRate = getMarginalEstateTax(1_390_000);
    expect(effectiveRate).toBeCloseTo(0.361, 3); // expected effective rate based on IRC §2001(c) bracket composition

    const zeroTax = getMarginalEstateTax(0);
    expect(zeroTax).toBe(0);
  });

  it('calculateNPV_InstallmentSale returns positive NPV and interest does not exceed principal', () => {
    const params = {
      assetFMV: 5_000_000,
      costBasis: 1_000_000,
      noteRate: 0.05,
      noteTerm: 10,
      section7520Rate: 0.05,
      grantorAge: 65,
      gender: 'male',
      discountRate: 0.04,
      federalEstateTaxRate: 0.4,
      grantor: {
        fedOrdIncomeTaxRate: 0.37,
        fedLtcgTaxRate: 0.2,
        niitRate: 0.038,
      },
    };

    const result = calculateNPV_InstallmentSale(params);
    console.log('InstallmentSale:', {
      annuityFactor: result.annuityFactor,
      totalInterest: result.totalInterest,
      pvNotePayments: result.pvNotePayments,
      npv: result.npv,
    });

    expect(result.npv).toBeGreaterThan(0);
    expect(result.totalInterest).toBeLessThanOrEqual(result.principal);
  });

  it('calculateNPV_Gift returns positive metrics for NPV, tax burn, and estate tax', () => {
    const params = {
      assetFMV: 20_000_000,
      costBasis: 200_000,
      annualGrowthRate: 0.07,
      annualIncomeYield: 0.02,
      grantorAge: 65,
      gender: 'male',
      discountRate: 0.04,
      federalEstateTaxRate: 0.4,
      maxYears: 35,
      totalGrantorEstate: 13_000_000,
    };

    const result = calculateNPV_Gift(params);
    console.log('Gift:', {
      npv: result.npv,
      pvTaxBurn: result.pvTaxBurn,
      pvEstateTax: result.pvEstateTax,
    });

    expect(result.npv).toBeGreaterThan(0);
    expect(result.pvTaxBurn).toBeGreaterThan(0);
    expect(result.pvEstateTax).toBeGreaterThan(0);
  });

  it('runMonteCarlo returns summary statistics with numeric fields', () => {
    const baseParams = {
      assetFMV: 1_000_000,
      costBasis: 200_000,
      annualGrowthRate: 0.07,
      annualIncomeYield: 0.02,
      grantorAge: 65,
      gender: 'male',
      discountRate: 0.04,
      federalEstateTaxRate: 0.4,
      maxYears: 35,
    };

    const baseNPV = calculateNPV_Gift(baseParams).npv;

    const result = runMonteCarlo({
      iterations: 100,
      model: () => baseNPV,
    });

    expect(typeof result.mean).toBe('number');
    expect(typeof result.stdDev).toBe('number');
    expect(typeof result.p10).toBe('number');
    expect(typeof result.p50).toBe('number');
    expect(typeof result.p90).toBe('number');
    expect(result.mean).toBeGreaterThan(0);
  });

  it('calculateGiftVsDeathComparison favors gift now when exemption exhausted', () => {
    const params = {
      assetFMV: 3_000_000,
      annualGrowthRate: 0.06,
      yearsUntilDeath: 15,
      federalGiftTaxRate: 0.4,
      federalEstateTaxRate: 0.4,
      stateEstateTaxRate: 0,
      stateGiftTaxRate: 0,
      stateEstateCliffEnabled: false,
      stateEstateExemption: 0,
      stateEstateCliffThreshold: 0,
      stateEstateCliffMultiplier: 1.05,
      discountRate: 0.04,
      exemptionAlreadyExhausted: true,
      giftTax3YearRuleRisk: false,
    };

    const result = calculateGiftVsDeathComparison(params);

    expect(result.giftNowScenario.giftTaxPaidNow).toBe(1_200_000);
    expect(result.giftNowScenario.netToHeirs).toBeGreaterThan(result.holdUntilDeathScenario.netToHeirs);
    expect(result.comparison.recommendation).toBe('GIFT_NOW');
    expect(result.comparison.additionalHeirWealthIfGiftNow).toBeGreaterThan(0);
  });
});
