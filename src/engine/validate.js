// Input validation for the IDGT engine (model.md §10.8) and the ING comparison module
// (docs/changes/2026-09-27-ing-comparison/model.md §8). Pure, no React.
// Returns field-level errors (block the run) and warnings ({code, data}; the UI composes the text).

import {
  MIN_EXCLUSION_FOR_FLAT_RATE, MAX_PROJECTION_YEARS, MAX_GRANTOR_AGE,
  DEFAULT_BURN_SHARE, DEFAULT_ING_FED_ORD, DEFAULT_ING_FED_LTCG, DEFAULT_ING_STATE_RATE, DEFAULT_ING_ADMIN_RATE,
  DEFAULT_ING_STATE_TAX_ON_GRANTOR,
} from './constants.js';
import { exclusionAt } from './fedTax.js';
import { validateLx } from './mortality.js';
import { BASIC_EXCLUSION_2026 } from '../data/exclusionAmounts.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);

/** Projection horizon of one life (deterministic year, or ω − age from its table). */
function lifeHorizon(lx, age, override) {
  if (override != null) return override;
  if (!Array.isArray(lx) || !isInt(age)) return MAX_PROJECTION_YEARS;
  let omega = lx.findIndex((v, i) => i > age && v === 0);
  if (omega === -1) omega = lx.length;
  return Math.max(1, omega - age);
}

/**
 * Projection horizon implied by the inputs: the grantor's, or for a married couple the later of the two lives' (the
 * second death, docs/changes/2026-09-27-life-tables/model.md §2).
 */
export function horizonYears(inp) {
  const grantor = lifeHorizon(inp.lx, inp.age, inp.deathYearOverride);
  if (!inp.married) return grantor;
  const spouse = lifeHorizon(inp.lxSpouse, inp.ageSpouse, inp.deathYearOverride != null ? inp.deathYearOverrideSpouse : null);
  return Math.max(grantor, spouse);
}

/**
 * The ING module's engine fields resolved (ING model.md §1). The vehicle's own design fields take the contract
 * defaults when null/undefined so v1 callers evaluate exactly as before; the client's state components and
 * NIIT (stateOrd, stateCg, niit) are passed through as given — evaluateIng requires them (validateIngInputs).
 * Derived stacks: τ^n_ord = τ^n_fed + niit + τ^n_st and τ^n_cg = τ^n_fcg + niit + τ^n_st (§§1(e), 1(h), 641;
 * §1411(a)(2): a trust pays NIIT above the top-bracket threshold). Grantor-level state tax on the ING's income
 * (σ^g) equals the grantor's own state components when the home state taxes the grantor on the ING as if it
 * were a grantor trust (N.Y. Tax Law §612(b)(41); Cal. R&TC §17082), else 0.
 *
 * @param {object} inp - flat engine inputs
 */
export function resolveIngInputs(inp) {
  const burnShare = inp.burnShare ?? DEFAULT_BURN_SHARE;
  const ingFedOrd = inp.ingFedOrd ?? DEFAULT_ING_FED_ORD;
  const ingFedLtcg = inp.ingFedLtcg ?? DEFAULT_ING_FED_LTCG;
  const ingStateRate = inp.ingStateRate ?? DEFAULT_ING_STATE_RATE;
  const ingAdminRate = inp.ingAdminRate ?? DEFAULT_ING_ADMIN_RATE;
  const ingStateTaxOnGrantor = inp.ingStateTaxOnGrantor ?? DEFAULT_ING_STATE_TAX_ON_GRANTOR;
  const { stateOrd, stateCg, niit } = inp;
  return {
    burnShare, ingFedOrd, ingFedLtcg, ingStateRate, ingAdminRate, ingStateTaxOnGrantor, stateOrd, stateCg, niit,
    tauNo: ingFedOrd + niit + ingStateRate,
    tauNc: ingFedLtcg + niit + ingStateRate,
    sgOrd: ingStateTaxOnGrantor ? stateOrd : 0,
    sgCg: ingStateTaxOnGrantor ? stateCg : 0,
  };
}

/**
 * Fields evaluateIng needs beyond validateInputs (ING model.md §8): the grantor's state components and NIIT,
 * which have no engine default. Field-level errors, never thrown.
 * @returns {{field:string, message:string}[]}
 */
export function validateIngInputs(inp) {
  const errors = [];
  if (!isNum(inp.stateOrd)) errors.push({ field: 'stateOrd', message: 'The state component of the grantor ordinary rate is required for the ING comparison.' });
  if (!isNum(inp.stateCg)) errors.push({ field: 'stateCg', message: 'The state component of the grantor capital-gain rate is required for the ING comparison.' });
  if (!isNum(inp.niit)) errors.push({ field: 'niit', message: 'The NIIT rate is required for the ING comparison.' });
  return errors;
}

/**
 * The return-neutral swap consideration (model.md C-2): cash-like, basis 100%, earning the other-estate after-tax rate
 * r_E after the grantor's tax at τ_ord. For r_E ≥ 0 that is a gross yield r_E/(1 − τ_ord) with no appreciation. For
 * r_E < 0 it is a holding that depreciates at r_E with no income — a negative "yield" would mean the grantor collects a
 * tax refund on negative income, which no instrument produces (docs/changes/2026-09-27-math-evals, F7). Either way the
 * after-tax return is exactly r_E, so the pre-tax family wealth path is unchanged by the swap.
 * @returns {{ bSw:number, gSw:number, ySw:number, tauSw:number }}
 */
export function neutralSwapProfile(rE, tauOrd) {
  return rE >= 0
    ? { bSw: 1, gSw: 0, ySw: rE / (1 - tauOrd), tauSw: tauOrd }
    : { bSw: 1, gSw: rE, ySw: 0, tauSw: tauOrd };
}

/**
 * @param {object} inp - flat engine inputs (decimals)
 * @returns {{ errors: {field:string, message:string}[], warnings: {code:string, data:object}[] }}
 */
export function validateInputs(inp) {
  const errors = [];
  const warnings = [];
  // `also`: the other inputs an error depends on besides `field` (a stack's parts, the asset's returns for the ING value
  // factor), so a caller can show the error on them too
  const err = (field, message, also) => errors.push(also ? { field, message, also } : { field, message });
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

  // Married couple (docs/changes/2026-09-27-life-tables/model.md §5): the spouse's life on the same basis as the grantor's
  if (inp.married != null && typeof inp.married !== 'boolean') err('married', 'Married must be on or off.');
  if (inp.married === true) {
    if (!isInt(inp.ageSpouse) || inp.ageSpouse < 0) err('ageSpouse', "Spouse's age must be a whole number of years, zero or more.");
    if (deterministic) {
      if (!isInt(inp.deathYearOverrideSpouse) || inp.deathYearOverrideSpouse < 1) err('deathYearOverrideSpouse', "Spouse's assumed death year must be a whole number, 1 or more.");
      else if (inp.deathYearOverrideSpouse > MAX_PROJECTION_YEARS) err('deathYearOverrideSpouse', `Spouse's assumed death year cannot exceed ${MAX_PROJECTION_YEARS}.`);
      if (isInt(inp.ageSpouse) && inp.ageSpouse > MAX_GRANTOR_AGE) err('ageSpouse', `Spouse's age cannot exceed ${MAX_GRANTOR_AGE}.`);
    } else {
      const problems = Array.isArray(inp.lxSpouse) ? validateLx(inp.lxSpouse) : ['no mortality table supplied for the spouse'];
      if (problems.length) err('lxSpouse', `Spouse's mortality table: ${problems[0]}.`);
      else if (isInt(inp.ageSpouse) && inp.ageSpouse >= 0) {
        if (inp.ageSpouse >= inp.lxSpouse.length) err('ageSpouse', `Spouse's age is beyond the mortality table (last age ${inp.lxSpouse.length - 1}); use assumed death years.`);
        else if (!(inp.lxSpouse[inp.ageSpouse] > 0)) err('ageSpouse', `The mortality table has no survivors at the spouse's age ${inp.ageSpouse}; use assumed death years.`);
      }
    }
    if (inp.PS != null && (!isNum(inp.PS) || inp.PS < 0)) err('PS', "Spouse's prior taxable gifts cannot be negative.");
    if (inp.XPS != null && (!isNum(inp.XPS) || inp.XPS < 0)) err('XPS', "Spouse's prior-gift exclusion cannot be negative.");
    if (inp.portability != null && typeof inp.portability !== 'boolean') err('portability', 'Portability must be on or off.');
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

  // ING comparison module (ING model.md §8): the vehicle's fields are validated at their RESOLVED values (a v1
  // caller that omits them passes on the defaults); the client's state components and NIIT only when given.
  const ing = resolveIngInputs(inp);
  if (!isNum(ing.burnShare) || ing.burnShare < 0 || ing.burnShare > 1) err('burnShare', 'Share of the trust tax the grantor bears must be between 0% and 100%.');
  rateIn('ingFedOrd', ing.ingFedOrd, 0, 1, 'Trust federal ordinary rate');
  rateIn('ingFedLtcg', ing.ingFedLtcg, 0, 1, 'Trust federal capital-gain rate');
  rateIn('ingStateRate', ing.ingStateRate, 0, 1, 'State rate the ING bears');
  if (!isNum(ing.ingAdminRate) || ing.ingAdminRate < 0 || ing.ingAdminRate >= 1) err('ingAdminRate', 'ING administration cost must be at least 0% and below 100% of trust value a year.');
  if (typeof ing.ingStateTaxOnGrantor !== 'boolean') err('ingStateTaxOnGrantor', 'Home-state treatment of the ING must be on or off.');
  if (inp.niit != null) rateIn('niit', inp.niit, 0, 1, 'NIIT rate');
  const niitForBound = isNum(inp.niit) ? inp.niit : 0;
  if (isNum(ing.niit) && isNum(ing.ingStateRate)) {
    if (isNum(ing.ingFedOrd) && ing.tauNo >= 1) err('ingFedOrd', 'The trust ordinary stack (federal + NIIT + state) must be below 100%.', ['ingStateRate', 'niit']);
    if (isNum(ing.ingFedLtcg) && ing.tauNc >= 1) err('ingFedLtcg', 'The trust capital-gain stack (federal + NIIT + state) must be below 100%.', ['ingStateRate', 'niit']);
  }
  // The state component sits inside the grantor's stack next to NIIT: 0 ≤ σ ≤ τ − niit (model.md §8).
  if (inp.stateOrd != null) {
    if (!isNum(inp.stateOrd) || inp.stateOrd < 0) err('stateOrd', 'State ordinary rate cannot be negative.');
    else if (isNum(inp.tauOrd) && inp.stateOrd > inp.tauOrd - niitForBound + 1e-12) err('stateOrd', 'State ordinary rate cannot exceed the grantor ordinary rate less NIIT.');
  }
  if (inp.stateCg != null) {
    if (!isNum(inp.stateCg) || inp.stateCg < 0) err('stateCg', 'State capital-gain rate cannot be negative.');
    else if (isNum(inp.tauCg) && inp.stateCg > inp.tauCg - niitForBound + 1e-12) err('stateCg', 'State capital-gain rate cannot exceed the grantor capital-gain rate less NIIT.');
  }

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

  // ING value factor must stay positive on both rate profiles (model.md §8): 1 + g + (1 − τ^n_ord) y − c > 0.
  // v1's 1 + g + y > 0 does not imply it once the trust pays its own tax and fee.
  // Checked only where v1's 1 + g + y > 0 holds (otherwise that error already stands). The trust's ordinary stack is a
  // part of the factor only when there is a yield to tax.
  const trustStack = (y) => (y > 0 ? ['ingFedOrd', 'ingStateRate', 'niit'] : []);
  if (isNum(inp.g) && isNum(inp.y) && isNum(ing.tauNo) && isNum(ing.ingAdminRate) && 1 + inp.g + inp.y > 0
    && 1 + inp.g + (1 - ing.tauNo) * inp.y - ing.ingAdminRate <= 0) {
    err('ingAdminRate', 'The ING would lose all its value in a year: growth plus after-tax yield less the administration cost must exceed -100%.', ['g', 'y', ...trustStack(inp.y)]);
  } else if (inp.S > 0 && isNum(inp.gr) && isNum(inp.yr) && isNum(ing.tauNo) && isNum(ing.ingAdminRate) && 1 + inp.gr + inp.yr > 0
    && 1 + inp.gr + (1 - ing.tauNo) * inp.yr - ing.ingAdminRate <= 0) {
    err('ingAdminRate', 'After the sale the ING would lose all its value in a year: post-sale growth plus after-tax yield less the administration cost must exceed -100%.', ['gr', 'yr', ...trustStack(inp.yr)]);
  }

  // Swap consideration: nulls mean "derive the neutral default"; validate the RESOLVED profile.
  if (inp.bSw != null && (!isNum(inp.bSw) || inp.bSw < 0)) err('bSw', 'Consideration basis % cannot be negative.');
  if (inp.gSw != null && !isNum(inp.gSw)) err('gSw', 'Consideration growth must be a number.');
  if (inp.ySw != null && (!isNum(inp.ySw) || inp.ySw < 0)) err('ySw', 'Consideration yield cannot be negative.');
  if (inp.tauSw != null) rateIn('tauSw', inp.tauSw, 0, 1, 'Grantor rate on consideration yield');

  if (errors.length) return { errors, warnings };

  const neutral = neutralSwapProfile(inp.rE, inp.tauOrd);
  const gSw = inp.gSw ?? neutral.gSw;
  const tauSw = inp.tauSw ?? neutral.tauSw;
  const ySw = inp.ySw ?? neutral.ySw;
  if (1 + gSw + ySw <= 0) err('gSw', 'Consideration growth plus yield must exceed -100%.');

  // Exclusion must stay >= $1M in every projection year (matters only when pi < 0).
  if (inp.pi < 0 && exclusionAt({ X0: inp.X0, pi: inp.pi }, horizonYears(inp)) < MIN_EXCLUSION_FOR_FLAT_RATE) {
    err('pi', 'A negative indexing rate drives the exclusion below $1,000,000 within the projection horizon (set by the age and life table, or the assumed death year).', ['X0']);
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

  // ING comparison (ING model.md §8): the IDGT-ledger warning lives here; the ING's own warnings are emitted by
  // evaluateIng so they never appear on the IDGT result. φ < 1: a constant reimbursed fraction is the pattern
  // the implied-understanding caveat of Rev. Rul. 2004-64 describes; the safe harbour also needs state law that
  // keeps the trust out of the grantor's creditors' reach (§2036(a)(1) otherwise). Not priced.
  if (ing.burnShare < 1) warn('BURN_REIMBURSED', { burnShare: ing.burnShare });
  if (inp.married === true && inp.portability === false) warn('PORTABILITY_OFF', {});
  if (inp.married === true && (inp.PS ?? 0) > 0 && inp.XPS != null && inp.PS > inp.XPS) warn('SPOUSE_PRIOR_GIFT_TAX', { P: inp.PS, XP: inp.XPS });
  return { errors, warnings };
}
