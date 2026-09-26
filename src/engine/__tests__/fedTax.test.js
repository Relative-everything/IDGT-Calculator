// Federal tax mechanics: §2001(c) goldens and the flat-40% reduction cross-check.
import { describe, it, expect } from 'vitest';
import { tentativeTax, estateTaxByBrackets, deriveGift, makeBases, taxFromBase, exclusionAt } from '../fedTax.js';

// Deterministic pseudo-random generator (mulberry32) so the cross-check is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('§2001(c) tentative tax (goldens: statute; by inspection above $1M)', () => {
  it('tax on $1,000,000 is $345,800 (IRC §2001(c))', () => {
    expect(tentativeTax(1_000_000)).toBeCloseTo(345_800, 6);
  });
  it('tax on $15,000,000 is $345,800 + 40% × $14,000,000 = $5,945,800', () => {
    expect(tentativeTax(15_000_000)).toBeCloseTo(5_945_800, 6);
  });
  it('estate of $16,390,000 with a $15,000,000 exclusion owes $556,000 (40% of the excess), not the 36.1% the legacy engine produced', () => {
    expect(estateTaxByBrackets({ TE: 16_390_000, applicableExclusion: 15_000_000 })).toBeCloseTo(556_000, 6);
  });
  it('zero below the exclusion and for zero amounts', () => {
    expect(tentativeTax(0)).toBe(0);
    expect(estateTaxByBrackets({ TE: 14_000_000, applicableExclusion: 15_000_000 })).toBe(0);
  });
});

describe('flat-rate reduction equals the full §2001(b) bracket computation whenever the exclusion ≥ $1M', () => {
  it('20 seeded random (TE, prior gifts, exclusion) triples, HOLD base', () => {
    const rand = rng(20260926);
    for (let i = 0; i < 20; i += 1) {
      const TE = rand() * 60_000_000;
      const XP = 1_000_000 + rand() * 14_000_000;
      const P = rand() < 0.3 ? 0 : rand() * 25_000_000;
      const X0 = 15_000_000;
      const pi = rand() * 0.04 - 0.01;
      const t = 1 + Math.floor(rand() * 40);
      const bases = makeBases({ X0, pi, P, XP, Ug: 0, R: Math.max(0, X0 - Math.min(P, XP)), Uc: 0 });
      const flat = taxFromBase(0.4, bases.baseHold(TE, t));
      const giftTaxPayable = tentativeTax(P) - tentativeTax(Math.min(P, XP));
      const applicableExclusion = Math.max(exclusionAt({ X0, pi }, t), Math.min(P, XP));
      const bracket = estateTaxByBrackets({ TE, adjustedTaxableGifts: P, giftTaxPayable, applicableExclusion });
      expect(Math.abs(flat - bracket)).toBeLessThanOrEqual(1e-6 * Math.max(1, bracket));
    }
  });
  it('GIFT base with a current taxable gift (exclusion partly covering it)', () => {
    const rand = rng(7);
    for (let i = 0; i < 20; i += 1) {
      const TE = rand() * 60_000_000;
      const X0 = 15_000_000;
      const XP = 1_000_000 + rand() * 14_000_000;
      const P = rand() * 20_000_000;
      const Ug = rand() * 10_000_000;
      const usedPrior = Math.min(P, XP);
      const R = Math.max(0, X0 - usedPrior);
      const Uc = Math.min(Ug, R);
      const t = 1 + Math.floor(rand() * 40);
      const pi = 0.02;
      const bases = makeBases({ X0, pi, P, XP, Ug, R, Uc });
      const flat = taxFromBase(0.4, bases.baseGift(TE, t));
      // gift tax payable on all post-1976 gifts computed with the exclusion of each gift's year
      const priorTax = tentativeTax(P) - tentativeTax(usedPrior);
      const currentTax = tentativeTax(P + Ug) - tentativeTax(P) - (tentativeTax(X0) - tentativeTax(usedPrior)) ;
      const giftTaxPayable = priorTax + Math.max(0, currentTax);
      const applicableExclusion = Math.max(exclusionAt({ X0, pi }, t), usedPrior + Uc);
      const bracket = estateTaxByBrackets({ TE, adjustedTaxableGifts: P + Ug, giftTaxPayable, applicableExclusion });
      expect(Math.abs(flat - bracket)).toBeLessThanOrEqual(1e-6 * Math.max(1, bracket));
    }
  });
});

describe('deriveGift', () => {
  it('Fixture E: exclusion exhausted → G = 400,000, §1015(d)(6) basis 520,000', () => {
    const d = deriveGift({ FMV: 1_000_000, B0: 200_000, X0: 15_000_000, P: 15_000_000, XP: 15_000_000, tauE: 0.4 });
    expect(d.R).toBe(0);
    expect(d.Uc).toBe(0);
    expect(d.G).toBeCloseTo(400_000, 6);
    expect(d.BT0).toBeCloseTo(520_000, 6);
  });
  it('Fixture F: 2025 gifts leave $1,010,000 of 2026 exclusion; partial coverage', () => {
    const d = deriveGift({ FMV: 2_000_000, B0: 400_000, X0: 15_000_000, P: 13_990_000, XP: 13_990_000, tauE: 0.4 });
    expect(d.R).toBeCloseTo(1_010_000, 6);
    expect(d.Uc).toBeCloseTo(1_010_000, 6);
    expect(d.G).toBeCloseTo(396_000, 6);
    expect(d.BT0).toBeCloseTo(716_800, 6);
  });
  it('valuation discount and annual exclusions reduce only the taxable gift', () => {
    const d = deriveGift({ FMV: 1_000_000, delta: 0.3, annualExclusions: 38_000, B0: 200_000, X0: 15_000_000, P: 0, XP: 15_000_000, tauE: 0.4 });
    expect(d.Ug).toBeCloseTo(662_000, 6);
    expect(d.G).toBe(0);
    expect(d.BT0).toBe(200_000);
  });
});
