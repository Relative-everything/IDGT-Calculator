// State estate tax data (2024). State law changes frequently; verify rates and exemptions annually.
// These tables are intended to provide rough order-of-magnitude estimates and should not be used as a substitute for current state tax advice.

/**
 * State-level estate / inheritance tax regimes (estate tax only). For states with no estate tax,
 * the entry may be omitted or set with exemption=Infinity and rate=0.
 *
 * For states with graduated rates, the brackets represent marginal rates on the taxable estate above
 * the stated exemption.
 */
export const STATE_ESTATE_TAX = {
  WA: {
    name: 'Washington',
    exemption: 2_193_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 1_000_000, rate: 0.13 },
      { threshold: 2_000_000, rate: 0.14 },
      { threshold: 3_000_000, rate: 0.15 },
      { threshold: 4_000_000, rate: 0.17 },
      { threshold: 5_000_000, rate: 0.19 },
      { threshold: 6_000_000, rate: 0.20 },
    ],
    note: 'Washington estate tax rates 2024. Verify for changes each legislative session.',
  },
  OR: {
    name: 'Oregon',
    exemption: Infinity,
    brackets: [{ threshold: 0, rate: 0 }],
    note: 'Oregon estate tax repealed for decedents dying in 2024 and thereafter.',
  },
  MN: {
    name: 'Minnesota',
    exemption: 3_000_000,
    brackets: [
      { threshold: 0, rate: 0.13 },
      { threshold: 3_000_000, rate: 0.15 },
      { threshold: 7_000_000, rate: 0.16 },
    ],
  },
  IL: {
    name: 'Illinois',
    exemption: 4_000_000,
    brackets: [
      { threshold: 0, rate: 0.08 },
      { threshold: 4_000_000, rate: 0.16 },
    ],
  },
  MD: {
    name: 'Maryland',
    exemption: 5_000_000,
    brackets: [
      { threshold: 0, rate: 0.08 },
      { threshold: 5_000_000, rate: 0.16 },
    ],
  },
  MA: {
    name: 'Massachusetts',
    exemption: 1_000_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 1_000_000, rate: 0.16 },
    ],
  },
  NY: {
    name: 'New York',
    exemption: 6_580_000,
    brackets: [
      { threshold: 0, rate: 0.08 },
      { threshold: 1_000_000, rate: 0.10 },
      { threshold: 1_750_000, rate: 0.12 },
      { threshold: 2_250_000, rate: 0.13 },
      { threshold: 3_000_000, rate: 0.14 },
      { threshold: 5_000_000, rate: 0.15 },
      { threshold: 10_000_000, rate: 0.16 },
    ],
  },
  CT: {
    name: 'Connecticut',
    exemption: 12_060_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 2_600_000, rate: 0.11 },
      { threshold: 4_300_000, rate: 0.12 },
    ],
  },
  RI: {
    name: 'Rhode Island',
    exemption: 1_677_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 1_677_000, rate: 0.16 },
    ],
  },
  ME: {
    name: 'Maine',
    exemption: 7_000_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 7_000_000, rate: 0.12 },
    ],
  },
  VT: {
    name: 'Vermont',
    exemption: 5_000_000,
    brackets: [
      { threshold: 0, rate: 0.09 },
      { threshold: 5_000_000, rate: 0.16 },
    ],
  },
  HI: {
    name: 'Hawaii',
    exemption: 5_490_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 5_490_000, rate: 0.20 },
    ],
  },
  DC: {
    name: 'District of Columbia',
    exemption: 4_000_000,
    brackets: [
      { threshold: 0, rate: 0.10 },
      { threshold: 4_000_000, rate: 0.16 },
    ],
  },
  NE: {
    name: 'Nebraska',
    exemption: 40_000,
    brackets: [
      { threshold: 0, rate: 0.018 },
      { threshold: 40_000, rate: 0.052 },
      { threshold: 1_000_000, rate: 0.081 },
      { threshold: 2_000_000, rate: 0.108 },
      { threshold: 3_000_000, rate: 0.135 },
      { threshold: 4_000_000, rate: 0.162 },
      { threshold: 5_000_000, rate: 0.18 },
    ],
  },
  NJ: {
    name: 'New Jersey',
    exemption: Infinity,
    brackets: [{ threshold: 0, rate: 0 }],
    note: 'New Jersey estate tax was repealed for decedents dying after 2017.',
  },
  PA: {
    name: 'Pennsylvania',
    exemption: Infinity,
    brackets: [{ threshold: 0, rate: 0 }],
    note: 'Pennsylvania imposes inheritance tax (not estate tax).',
  },
};

function getStateEntry(state) {
  const key = (state || '').toString().trim().toUpperCase();
  return STATE_ESTATE_TAX[key] || null;
}

/**
 * Estimate state estate tax liability for a given state and taxable estate.
 * Uses the state exemption and marginal brackets defined in STATE_ESTATE_TAX.
 *
 * @param {string} state - USPS two-letter state code (e.g., 'WA', 'NY', 'DC').
 * @param {number} taxableEstate - Taxable estate amount after state deductions.
 * @returns {number} Estimated state estate tax liability (0 if no tax).
 */
export function getStateEstateTax(state, taxableEstate) {
  if (typeof taxableEstate !== 'number' || taxableEstate < 0) {
    throw new RangeError('taxableEstate must be a non-negative number');
  }

  const entry = getStateEntry(state);
  if (!entry) {
    return 0;
  }

  const taxable = Math.max(0, taxableEstate - (entry.exemption || 0));
  if (taxable === 0) return 0;

  let remaining = taxable;
  let tax = 0;
  const brackets = entry.brackets || [];

  for (let i = 0; i < brackets.length; i += 1) {
    const current = brackets[i];
    const next = brackets[i + 1];
    const bracketTop = next ? next.threshold : Infinity;
    const tranche = Math.max(0, Math.min(remaining, bracketTop - current.threshold));
    tax += tranche * current.rate;
    remaining -= tranche;
    if (remaining <= 0) break;
  }

  return tax;
}
