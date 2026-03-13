// IRC §2001(c) progressive estate and gift tax rate schedule (current law)
// Source: IRC §2001(c); TCJA §11061 (AMT repeal, rate schedule)

/**
 * Current law exemption amounts (indexed).
 * - CURRENT_EXEMPTION: 2025 indexed unified credit equivalent.
 * - TCJA_SUNSET_EXEMPTION: Projected post-2025 exemption per §2010(c)(3)(C) inflation adjustment.
 */
export const CURRENT_EXEMPTION = 13_990_000; // 2025 indexed amount
export const TCJA_SUNSET_EXEMPTION = 7_000_000; // projected 2026 (estimate, subject to inflation adjustment)

// IRC §2001(c) estate tax rate brackets (marginal)
// Data is expressed as an array of bracket thresholds with corresponding marginal rates.
// This is the schedule used to compute the tax on the estate (not a flat 40%).
const ESTATE_TAX_BRACKETS = [
  { threshold: 0, rate: 0.18 },
  { threshold: 10_000, rate: 0.20 },
  { threshold: 20_000, rate: 0.22 },
  { threshold: 40_000, rate: 0.24 },
  { threshold: 60_000, rate: 0.26 },
  { threshold: 80_000, rate: 0.28 },
  { threshold: 100_000, rate: 0.30 },
  { threshold: 150_000, rate: 0.32 },
  { threshold: 250_000, rate: 0.34 },
  { threshold: 500_000, rate: 0.37 },
  { threshold: 750_000, rate: 0.39 },
  { threshold: 1_000_000, rate: 0.40 },
];

/**
 * Compute total estate tax liability using IRC §2001(c) progressive rate schedule.
 * Returns the effective tax rate (tax / taxableEstate).
 *
 * @param {number} taxableEstate - Taxable estate amount after deductions (not including unified credit).
 * @returns {number} effective tax rate between 0 and 0.40 (inclusive)
 */
export function getMarginalEstateTax(taxableEstate) {
  if (typeof taxableEstate !== 'number' || taxableEstate < 0) {
    throw new RangeError('taxableEstate must be a non-negative number');
  }

  let remaining = taxableEstate;
  let tax = 0;

  for (let i = 0; i < ESTATE_TAX_BRACKETS.length; i += 1) {
    const current = ESTATE_TAX_BRACKETS[i];
    const next = ESTATE_TAX_BRACKETS[i + 1];
    const bracketTop = next ? next.threshold : Infinity;
    const tranche = Math.max(0, Math.min(remaining, bracketTop - current.threshold));
    tax += tranche * current.rate;
    remaining -= tranche;
    if (remaining <= 0) break;
  }

  const effectiveRate = taxableEstate === 0 ? 0 : tax / taxableEstate;
  return Math.min(effectiveRate, 0.4);
}
