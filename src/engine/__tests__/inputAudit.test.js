// Inputs audit arithmetic (engine/inputAudit.js): the gift facts equal the engine's own U_g, totals skip and count
// values that do not parse, and the tie-out adds up.
import { describe, it, expect } from 'vitest';
import { assetAuditFacts, controlTotals, shareOfTotal, balanceSheetTieOut } from '../inputAudit.js';
import { deriveGift } from '../fedTax.js';

describe('assetAuditFacts', () => {
  it('taxable gift = the engine\'s U_g on a grid of values, discounts and annual exclusions (§§2512, 2503(b))', () => {
    for (const FMV of [57_000, 1_000_000, 8_000_000]) for (const delta of [0, 0.25, 0.35]) for (const annualExclusions of [0, 19_000, 57_000, 10_000_000]) {
      const f = assetAuditFacts({ FMV, delta, annualExclusions, B0: 100_000 });
      expect(f.taxableGift).toBe(deriveGift({ FMV, delta, annualExclusions, B0: 100_000, X0: 15_000_000, tauE: 0.4 }).Ug);
      expect(f.giftValue + f.discountAmount).toBeCloseTo(FMV, 6);
    }
  });
  it('hand case: $3,000,000 at a 30% discount with $38,000 of annual exclusions, basis $1,500,000', () => {
    const f = assetAuditFacts({ FMV: 3_000_000, delta: 0.3, annualExclusions: 38_000, B0: 1_500_000 });
    expect(f.giftValue).toBeCloseTo(2_100_000, 6);
    expect(f.discountAmount).toBeCloseTo(900_000, 6);
    expect(f.taxableGift).toBeCloseTo(2_062_000, 6);
    expect(f.unrealizedGain).toBe(1_500_000);
  });
  it('an unreadable input makes the facts that depend on it NaN (so a total can report it)', () => {
    const f = assetAuditFacts({ FMV: 1_000_000, delta: 0, annualExclusions: 0, B0: NaN });
    expect(Number.isNaN(f.unrealizedGain)).toBe(true);
    expect(f.taxableGift).toBe(1_000_000);
  });
});

describe('controlTotals, shareOfTotal, balanceSheetTieOut', () => {
  it('sums finite values, counts the rest as skipped', () => {
    const t = controlTotals([{ a: 1, b: 2 }, { a: NaN, b: 3 }, { a: 4, b: undefined }], ['a', 'b']);
    expect(t).toEqual({ count: 3, a: { sum: 5, skipped: 1 }, b: { sum: 5, skipped: 1 } });
  });
  it('share is null without a positive total; the tie-out adds the other estate to the candidates', () => {
    expect(shareOfTotal(5, 20)).toBe(0.25);
    expect(shareOfTotal(5, 0)).toBeNull();
    expect(shareOfTotal(NaN, 20)).toBeNull();
    expect(balanceSheetTieOut({ otherEstate: 20_000_000, candidatesFmv: 9_000_000 })).toEqual({ otherEstate: 20_000_000, candidates: 9_000_000, total: 29_000_000 });
  });
});
