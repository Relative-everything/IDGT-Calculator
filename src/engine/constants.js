// Named modelling constants for the IDGT engine. Every number here has a legal or numerical reason.

// IRC §2035(b): gift tax paid on gifts made within the 3-year period ending on the date of death is
// included in the gross estate. Convention (model.md C-4): death at the end of year 3 counts.
export const SECTION_2035_WINDOW_YEARS = 3;

// IRC §2001(c) is flat at 40% above this amount; the engine refuses an exclusion below it because the
// flat-rate reduction (engine/fedTax.js) would no longer be exact.
export const MIN_EXCLUSION_FOR_FLAT_RATE = 1_000_000;

// Tolerances (model.md §10.11).
export const MONEY_TOLERANCE = 0.005;
export const RATIO_TOLERANCE = 1e-9;
export const RELATIVE_TOLERANCE = 1e-9;
export const PROBABILITY_SUM_TOLERANCE = 1e-12;
export const SWAP_TIE_TOLERANCE = 1e-6; // relative, applied as max(1, |NPV|) scaled

// Mortality table sentinel: an l_x array that never reaches zero is closed at its last index.
export const TABLE_END_WARNING = 'MORTALITY_TABLE_TRUNCATED';
