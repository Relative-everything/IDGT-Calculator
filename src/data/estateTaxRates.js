// IRC §2001(c) tentative-tax rate schedule (unified estate and gift tax), current law.
// Marginal rates on the cumulative taxable amount; the schedule is flat at 40% above $1,000,000.
// Tentative tax on exactly $1,000,000 is $345,800.
//
// The calculator's engine applies a flat 40% to the amount above the applicable exclusion, which is
// exact whenever the exclusion is at least $1,000,000 because the unified credit (§2010) absorbs the
// tentative tax on everything below it. This schedule is retained as DATA for the cross-check test in
// src/engine/__tests__/fedTax.test.js that proves the reduction.
// Source: IRC §2001(c). Confidence H. Checked 2026-09-26. DATA ONLY — no calculations in this folder.

export const SECTION_2001C_BRACKETS = [
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

export const TOP_BRACKET_THRESHOLD = 1_000_000;
export const TOP_MARGINAL_RATE = 0.40;
export const TENTATIVE_TAX_AT_TOP_THRESHOLD = 345_800; // §2001(c): tax on $1,000,000

export const SECTION_2001C_META = {
  authority: 'IRC §2001(c)',
  checkedOn: '2026-09-26',
  confidence: 'H',
};
