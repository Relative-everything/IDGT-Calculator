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
// Ranking (model.md §9): efficiencies equal to this many significant digits are a tie, broken by NPV (larger first).
// Proportionally identical assets (same rates and basis ratio, different size) have mathematically equal efficiency;
// without rounding their order was decided by floating-point noise in the 16th digit (docs/changes/2026-09-27-math-evals,
// F4). Rounding, not a tolerance band, keeps the sort comparator transitive.
export const RANK_EFFICIENCY_SIGNIFICANT_DIGITS = 12;

// Mortality table sentinel: an l_x array that never reaches zero is closed at its last index.
export const TABLE_END_WARNING = 'MORTALITY_TABLE_TRUNCATED';

// ---------------------------------------------------------------------------------------------
// ING comparison module (docs/changes/2026-09-27-ing-comparison/model.md).

// Contract defaults for the ING's own design fields (model.md §1). v1 callers never set them and must keep
// evaluating exactly as before. The grantor's state components (stateOrd, stateCg) and NIIT have NO engine
// default: they describe the client, not the vehicle, so evaluateIng requires them (validateIngInputs).
export const DEFAULT_BURN_SHARE = 1; // φ: the grantor bears all of the trust's income tax (§§671–677; v1 behaviour)
export const DEFAULT_ING_FED_ORD = 0.37; // §1(e) as made permanent by OBBBA: top trust ordinary rate
export const DEFAULT_ING_FED_LTCG = 0.20; // §1(h)(1)(D): top long-term capital-gain rate
export const DEFAULT_ING_STATE_RATE = 0; // intangibles in a no-tax situs (NV, WY, SD, AK; DE with no resident beneficiaries)
export const DEFAULT_ING_ADMIN_RATE = 0; // no corporate-trustee cost unless entered
export const DEFAULT_ING_STATE_TAX_ON_GRANTOR = false; // home state does not tax the grantor on the ING (NY/CA do)

// Breakeven solver (model.md §6). A coarse scan of BREAKEVEN_SCAN_POINTS equally spaced trials finds the sign
// changes (the function need not be monotone); the first is bisected. Bisection halves the bracket each step,
// so 60 iterations resolve any bracket below double precision: the x-tolerance ends every practical solve.
export const BREAKEVEN_SCAN_POINTS = 11;
export const BREAKEVEN_MAX_ITER = 60;
export const BREAKEVEN_BURN_SHARE_XTOL = 1e-4; // φ* to 0.01 percentage points (the UI shows one decimal of %)
export const BREAKEVEN_STATE_RATE_XTOL = 1e-4; // σ* to 0.01 percentage points
export const BREAKEVEN_STATE_RATE_MAX = 0.20; // σ bracket [0, 20%]: above every state's top marginal rate (CA 13.3%, incl. its 1% mental-health surtax, is the highest)
export const BREAKEVEN_ESTATE_XTOL = 1_000; // E_0* to $1,000 (immaterial against an eight-figure estate)
export const BREAKEVEN_ESTATE_MULTIPLE = 3; // E_0 bracket [0, max(3 E_0, 5 X_0)]: wide enough to cross the exclusion either way
export const BREAKEVEN_EXCLUSION_MULTIPLE = 5;

// Breakeven grid (model.md §7): grantor state rate (columns) × burn share (rows). Built from whole percentage
// points ÷ 100 so the axis labels are exact; comparisonGrid inserts the input's own rate and share when they
// fall between lattice points, so the user's position is always a cell.
const pctPoints = (points) => Object.freeze(points.map((p) => p / 100));
export const GRID_STATE_RATES = pctPoints([0, 2, 4, 6, 8, 10, 12, 14]);
export const GRID_BURN_SHARES = pctPoints([100, 80, 60, 40, 20, 0]);
