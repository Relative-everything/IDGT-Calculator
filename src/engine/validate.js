// Input validation for the IDGT engine (model.md §10.8). Pure, no React.
// Returns field-level errors (block the run) and warnings ({code, data}; the UI composes the text).

import { MIN_EXCLUSION_FOR_FLAT_RATE, MAX_PROJECTION_YEARS, MAX_GRANTOR_AGE } from './constants.js';
import { exclusionAt } from './fedTax.js';
import { validateLx } from './mortality.js';
import { BASIC_EXCLUSION_2026 } from '../data/exclusionAmounts.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);

/** Projection horizon implied by the inputs (deterministic year, or ω − age from the table). */
export function horizonYears(inp) {
  if (inp.deathYearOverride != null) return inp.deathYearOverride;
  if (!Array.isArray(inp.lx) || !isInt(inp.age)) return MAX_PROJECTION_YEARS;
  let omega = inp.lx.findIndex((v, i) => i > inp.age && v === 0);
  if (omega === -1) omega = inp.lx.length;
  return Math.max(1, omega - inp.age);
}

/**
 * @param {object} inp - flat engine inputs (decimals)
 * @returns {{ errors: {field:string, message:string}[], warnings: {code:string, data:object}[] }}
 */
export function validateInputs(inp) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (code, data = {}) => warnings.push({ code, data });

  // Grantor and horizon
  if (!isInt(inp.age) || inp.age < 0) err('age', 'Age must be a whole number of years, zero or more.');
  const deterministic = inp.deathYearOverride != null;
  if (deterministic) {
    if (!isInt(inp.deathYearOverride) || inp.deathYearOverride < 1) err('deathYearOverride', 'Assumed death year must be a whole number, 1 or more.');
    else if (inp.deathYearOverride > MAX_PROJECTION_YEARS) err('deathYearOverride', `Assumed death year cannot exceed ${MAX_PROJECTION_YEARS}.`);
    if (isInt(inp.age) && inp.age > MAX_GRANTOR_AGE) err('age', `Age cannot exceed ${MAX_GRANTOR_AGE}.`);
  } else {
    const problems = Array.isArray(inp.lx) ? validateLx(inp.lx) : ['no mortality table supplied'];
    if (problems.length) err('lx', `Mortality table: ${problems[0]}.`);
    else if (isInt(inp.age) && inp.age >= 0) {
      if (inp.age >= inp.lx.length) err('age', `Age is beyond the mortality table (last age ${inp.lx.length - 1}); use an assumed death year.`);
      else if (!(inp.lx[inp.age] > 0)) err('age', `The mortality table has no survivors at age ${inp.age}; use an assumed death year.`);
    }
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
    err('X0', `Basic exclusion must be at least $${MIN_EXCLUSION_FOR_FLAT_RATE} (the flat-rate reduction of §2001(c) requires it).`);
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
  if (!isInt(inp.S) || inp.S < 0) err('S', 'Sale year must be 0 (never) or a whole number of years.');
  if (inp.S > 0) {
    if (!isNum(inp.gr) || !isNum(inp.yr) || 1 + inp.gr + inp.yr <= 0) err('gr', 'Post-sale growth plus yield must exceed -100%.');
    if (isNum(inp.yr) && inp.yr < 0) err('yr', 'Post-sale yield cannot be negative.');
  }

  // Swap consideration: nulls mean "derive the neutral default"; validate the RESOLVED profile.
  if (inp.bSw != null && (!isNum(inp.bSw) || inp.bSw < 0)) err('bSw', 'Consideration basis % cannot be negative.');
  if (inp.gSw != null && !isNum(inp.gSw)) err('gSw', 'Consideration growth must be a number.');
  if (inp.ySw != null && (!isNum(inp.ySw) || inp.ySw < 0)) err('ySw', 'Consideration yield cannot be negative.');
  if (inp.tauSw != null) rateIn('tauSw', inp.tauSw, 0, 1, 'Grantor rate on consideration yield');

  if (errors.length) return { errors, warnings };

  const gSw = inp.gSw ?? 0;
  const tauSw = inp.tauSw ?? inp.tauOrd;
  const ySw = inp.ySw ?? inp.rE / (1 - inp.tauOrd);
  if (1 + gSw + ySw <= 0) err('gSw', 'Consideration growth plus yield must exceed -100%.');

  // Exclusion must stay >= $1M in every projection year (matters only when pi < 0).
  if (inp.pi < 0 && exclusionAt({ X0: inp.X0, pi: inp.pi }, horizonYears(inp)) < MIN_EXCLUSION_FOR_FLAT_RATE) {
    err('pi', 'A negative indexing rate drives the exclusion below $1,000,000 within the projection horizon.');
  }
  if (errors.length) return { errors, warnings };

  // Cross-field warnings (model.md §10); text is composed by the UI from `data`.
  if (inp.B0 > inp.FMV) warn('BUILT_IN_LOSS', { basis: inp.B0, fmv: inp.FMV });
  if (inp.X0 < BASIC_EXCLUSION_2026) warn('PRE_OBBBA_EXCLUSION', { X0: inp.X0, statutory: BASIC_EXCLUSION_2026 });
  if (inp.P > 0 && inp.XP != null && inp.P > inp.XP) warn('PRIOR_GIFT_TAX', { P: inp.P, XP: inp.XP });
  if (inp.gSw != null || inp.ySw != null || inp.tauSw != null) {
    const afterTax = gSw + (1 - tauSw) * ySw;
    if (Math.abs(afterTax - inp.rE) > 1e-9) warn('NON_NEUTRAL_SWAP', { afterTaxReturn: afterTax, rE: inp.rE });
  }
  return { errors, warnings };
}
