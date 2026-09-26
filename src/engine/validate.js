// Input validation for the IDGT engine (model.md §10.8). Pure, no React.
// Returns field-level errors (block the run) and warnings (run continues, shown in the UI).

import { MIN_EXCLUSION_FOR_FLAT_RATE } from './constants.js';
import { exclusionAt } from './fedTax.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);

/**
 * @param {object} inp - flat engine inputs (decimals)
 * @returns {{ errors: {field:string, message:string}[], warnings: {code:string, message:string}[] }}
 */
export function validateInputs(inp) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (code, message) => warnings.push({ code, message });

  // Grantor
  if (!isInt(inp.age) || inp.age < 0) err('age', 'Age must be a non-negative integer.');
  if (inp.deathYearOverride != null && (!isInt(inp.deathYearOverride) || inp.deathYearOverride < 1)) {
    err('deathYearOverride', 'Assumed death year must be a positive integer.');
  }

  // Rates
  const rateIn = (field, v, lo, hi, label) => {
    if (!isNum(v)) err(field, `${label} is required.`);
    else if (v < lo || v >= hi) err(field, `${label} must be at least ${lo * 100}% and below ${hi * 100}%.`);
  };
  rateIn('tauOrd', inp.tauOrd, 0, 1, 'Grantor ordinary rate');
  rateIn('tauCg', inp.tauCg, 0, 1, 'Grantor capital-gain rate');
  rateIn('tauBene', inp.tauBene, 0, 1, 'Beneficiary capital-gain rate');
  if (!isNum(inp.tauE) || inp.tauE <= 0 || inp.tauE >= 1) err('tauE', 'Estate tax rate must be above 0% and below 100%.');
  if (!isNum(inp.d) || inp.d <= -1) err('d', 'Discount rate must be above -100%.');
  if (!isNum(inp.rE) || inp.rE <= -1) err('rE', 'Other-estate growth must be above -100%.');
  if (!isNum(inp.pi) || inp.pi <= -1) err('pi', 'Exclusion indexing rate must be above -100%.');

  // Exclusion and prior gifts
  if (!isNum(inp.X0) || inp.X0 < MIN_EXCLUSION_FOR_FLAT_RATE) {
    err('X0', `Basic exclusion must be at least $${MIN_EXCLUSION_FOR_FLAT_RATE.toLocaleString('en-US')} (flat-rate reduction).`);
  }
  if (!isNum(inp.P) || inp.P < 0) err('P', 'Prior taxable gifts cannot be negative.');
  if (inp.XP != null && (!isNum(inp.XP) || inp.XP < 0)) err('XP', 'Prior-gift exclusion cannot be negative.');
  if (!isNum(inp.E0) || inp.E0 < 0) err('E0', 'Other estate cannot be negative.');
  if (!isNum(inp.k) || inp.k < 0) err('k', 'Years until heirs sell cannot be negative.');

  // Asset
  if (!isNum(inp.FMV) || inp.FMV <= 0) err('FMV', 'Fair market value must be positive.');
  if (!isNum(inp.B0) || inp.B0 < 0) err('B0', 'Cost basis cannot be negative.');
  if (!isNum(inp.delta) || inp.delta < 0 || inp.delta >= 1) err('delta', 'Valuation discount must be at least 0% and below 100%.');
  if (!isNum(inp.annualExclusions) || inp.annualExclusions < 0) err('annualExclusions', 'Annual exclusions cannot be negative.');
  if (!isNum(inp.g) || !isNum(inp.y) || 1 + inp.g + inp.y <= 0) err('g', 'Growth plus yield must exceed -100%.');
  if (isNum(inp.y) && inp.y < 0) err('y', 'Income yield cannot be negative.');
  if (!isInt(inp.S) || inp.S < 0) err('S', 'Sale year must be 0 (never) or a positive integer.');
  if (inp.S > 0) {
    if (!isNum(inp.gr) || !isNum(inp.yr) || 1 + inp.gr + inp.yr <= 0) err('gr', 'Post-sale growth plus yield must exceed -100%.');
    if (isNum(inp.yr) && inp.yr < 0) err('yr', 'Post-sale yield cannot be negative.');
  }

  // Swap consideration (nulls mean "derive the neutral default")
  if (inp.bSw != null && (!isNum(inp.bSw) || inp.bSw < 0)) err('bSw', 'Consideration basis % cannot be negative.');
  if (inp.gSw != null && !isNum(inp.gSw)) err('gSw', 'Consideration growth must be a number.');
  if (inp.ySw != null && (!isNum(inp.ySw) || inp.ySw < 0)) err('ySw', 'Consideration yield cannot be negative.');
  if (inp.tauSw != null) rateIn('tauSw', inp.tauSw, 0, 1, 'Grantor rate on consideration yield');
  if (isNum(inp.gSw) && isNum(inp.ySw) && 1 + inp.gSw + inp.ySw <= 0) err('gSw', 'Consideration growth plus yield must exceed -100%.');

  if (errors.length) return { errors, warnings };

  // Cross-field warnings (model.md §10)
  if (inp.B0 > inp.FMV) {
    warn('BUILT_IN_LOSS', 'Basis exceeds FMV: §1015 dual-basis rule — the loss is not usable by the trust (loss basis = gift value) and would be stepped DOWN at death if held. Consider harvesting the loss before gifting.');
  }
  if (inp.X0 < 15_000_000) {
    warn('PRE_OBBBA_EXCLUSION', 'Basic exclusion below the 2026 statutory $15,000,000 (OBBBA §70106); treat as a legislative scenario.');
  }
  if (inp.P > 0 && inp.XP != null && inp.P > inp.XP) {
    warn('PRIOR_GIFT_TAX', 'Prior gifts exceeded that year\'s exclusion: gift tax is assumed to have been paid at the current rate and is credited under §2001(b)(2).');
  }
  if (inp.gSw != null || inp.ySw != null || inp.tauSw != null) {
    const gSw = inp.gSw ?? 0;
    const tauSw = inp.tauSw ?? inp.tauOrd;
    const ySw = inp.ySw ?? inp.rE / (1 - inp.tauOrd);
    const afterTax = gSw + (1 - tauSw) * ySw;
    if (Math.abs(afterTax - inp.rE) > 1e-9) {
      warn('NON_NEUTRAL_SWAP', `Swap consideration earns ${(afterTax * 100).toFixed(2)}% after tax vs ${(inp.rE * 100).toFixed(2)}% for the other estate; the difference is booked in the "residual" component, not as a tax benefit.`);
    }
  }
  // Exclusion must stay >= $1M in every projection year (matters only when pi < 0)
  if (inp.pi < 0) {
    const horizon = inp.deathYearOverride ?? 120;
    if (exclusionAt({ X0: inp.X0, pi: inp.pi }, horizon) < MIN_EXCLUSION_FOR_FLAT_RATE) {
      err('pi', 'A negative indexing rate drives the exclusion below $1,000,000 within the horizon.');
    }
  }
  return { errors, warnings };
}
