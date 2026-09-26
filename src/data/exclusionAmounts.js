// Basic exclusion amount (BEA) under IRC §2010(c)(3), by calendar year, in nominal dollars.
// Used (a) as the default X_0 for a gift made in CURRENT_GIFT_YEAR and (b) to measure prior taxable
// gifts against the exclusion of the year they were made (IRC §2001(g)(2); Reg. §20.2010-1(c)).
//
// Sources and confidence (checked 2026-09-26):
//  - 2026: $15,000,000 — OBBBA §70106, P.L. 119-21 (2025-07-04), implemented by Rev. Proc. 2025-32. H.
//  - 2025: $13,990,000 — Rev. Proc. 2024-40. H.   2024: $13,610,000 — Rev. Proc. 2023-34. H.
//  - 2018–2023: TCJA §11061 doubling, indexed — Rev. Procs. 2017-58, 2018-57, 2019-44, 2020-45,
//    2021-45, 2022-38. H (from the revenue procedures; not re-fetched this session).
//  - 2011–2017: ATRA/§2010(c) as then in effect — Rev. Procs. 2011-52 … 2016-55. H (same caveat).
//  - 2027+: indexed from the 2025 base year under §2010(c)(3)(B) (chained CPI, rounded down to $10,000);
//    the IRS had not announced the 2027 amount as of 2026-09-26, so 2027+ is a user-controlled projection.
// DATA ONLY — no calculations in this folder.

export const CURRENT_GIFT_YEAR = 2026;

export const BASIC_EXCLUSION_BY_YEAR = {
  2011: 5_000_000,
  2012: 5_120_000,
  2013: 5_250_000,
  2014: 5_340_000,
  2015: 5_430_000,
  2016: 5_450_000,
  2017: 5_490_000,
  2018: 11_180_000,
  2019: 11_400_000,
  2020: 11_580_000,
  2021: 11_700_000,
  2022: 12_060_000,
  2023: 12_920_000,
  2024: 13_610_000,
  2025: 13_990_000,
  2026: 15_000_000,
};

export const BASIC_EXCLUSION_2026 = BASIC_EXCLUSION_BY_YEAR[2026];

export const EXCLUSION_META = {
  authority: 'IRC §2010(c)(3) as amended by OBBBA §70106 (P.L. 119-21); Rev. Proc. 2025-32',
  checkedOn: '2026-09-26',
  indexingNote: 'Indexed for calendar years after 2026 (base year 2025, C-CPI-U, rounded down to $10,000). '
    + '2027 amount not announced as of the check date; the calculator projects it with a user-set rate.',
};
