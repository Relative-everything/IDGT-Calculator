// Named modelling constants for the IDGT engine. Every number here has a legal or numerical reason.

// IRC §2035(b): gift tax paid on gifts made within the 3-year period ending on the date of death is
// included in the gross estate. Convention (model.md C-4): death at the end of year 3 counts.
export const SECTION_2035_WINDOW_YEARS = 3;

// IRC §2001(c) is flat at 40% above this amount; the engine refuses an exclusion below it because the
// flat-rate reduction (engine/fedTax.js) would no longer be exact.
export const MIN_EXCLUSION_FOR_FLAT_RATE = 1_000_000;

// Longest projection the engine accepts: the SSA table spans ages 0–119, so no life-table horizon
// exceeds 120 years; the deterministic death-year mode is capped at the same span (the swap search is
// O(N²) and runs synchronously in the browser).
export const MAX_PROJECTION_YEARS = 120;
export const MAX_GRANTOR_AGE = 120;

// Tolerances (model.md §10.11).
export const MONEY_TOLERANCE = 0.005;
export const RATIO_TOLERANCE = 1e-9;
export const RELATIVE_TOLERANCE = 1e-9;
export const PROBABILITY_SUM_TOLERANCE = 1e-12;
export const SWAP_TIE_TOLERANCE = 1e-6; // relative, applied as max(1, |NPV|) scaled

// Mortality table sentinel: an l_x array that never reaches zero is closed at its last index.
export const TABLE_END_WARNING = 'MORTALITY_TABLE_TRUNCATED';
