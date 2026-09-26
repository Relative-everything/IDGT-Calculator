// Mortality: death-year probabilities from an l_x (survivors) column. Pure functions, no React.
//
// q_t = (l_{x+t-1} - l_{x+t}) / l_x for t = 1..N, N = omega - x, omega = first age with l = 0.
// Sum of q_t is exactly 1 (no tail is dropped and nothing is renormalised) — model.md §3.
// Source of the table: src/data/mortalityTable.js (SSA period life table; provisional, see its META).

import { PROBABILITY_SUM_TOLERANCE, TABLE_END_WARNING } from './constants.js';

/**
 * Extract one sex's l_x column from the keyed table {age: {male, female}} as a dense array by age.
 * @param {Record<number, {male:number, female:number}>} table
 * @param {'male'|'female'} sex
 * @returns {number[]}
 */
export function lxColumn(table, sex) {
  const s = String(sex).toLowerCase();
  if (s !== 'male' && s !== 'female') throw new RangeError("sex must be 'male' or 'female'");
  const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
  const out = new Array(ages.length);
  ages.forEach((age, i) => {
    if (age !== i) throw new RangeError(`mortality table must be contiguous from age 0 (missing age ${i})`);
    out[i] = table[age][s];
  });
  return out;
}

/**
 * Validate an l_x array: finite, non-negative, non-increasing.
 * @param {number[]} lx
 * @returns {string[]} problems (empty when valid)
 */
export function validateLx(lx) {
  const problems = [];
  if (!Array.isArray(lx) || lx.length < 2) return ['l_x must be an array with at least two ages'];
  for (let i = 0; i < lx.length; i += 1) {
    const v = lx[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) { problems.push(`l_x[${i}] is not a non-negative finite number`); break; }
    if (i > 0 && v > lx[i - 1]) { problems.push(`l_x is not non-increasing at age ${i}`); break; }
  }
  return problems;
}

/**
 * Death-year probabilities for a grantor aged `age` (integer, start of year 1).
 *
 * @param {object} p
 * @param {number[]} p.lx - survivors by age (index = age)
 * @param {number} p.age
 * @param {number|null} [p.deathYearOverride] - deterministic mode: q_t = 1 at t = override, N = override
 * @returns {{ q:number[], N:number, omega:number|null, warnings:string[] }}
 */
export function deathProbabilities({ lx, age, deathYearOverride = null }) {
  const warnings = [];
  if (deathYearOverride != null) {
    if (!Number.isInteger(deathYearOverride) || deathYearOverride < 1) {
      throw new RangeError('deathYearOverride must be a positive integer');
    }
    const q = new Array(deathYearOverride).fill(0);
    q[deathYearOverride - 1] = 1;
    return { q, N: deathYearOverride, omega: null, warnings };
  }
  const problems = validateLx(lx);
  if (problems.length) throw new RangeError(problems[0]);
  if (!Number.isInteger(age) || age < 0 || age >= lx.length) throw new RangeError('age is outside the mortality table');
  if (!(lx[age] > 0)) throw new RangeError(`no survivors at age ${age} in the mortality table`);

  let omega = lx.findIndex((v, i) => i > age && v === 0);
  if (omega === -1) {
    omega = lx.length; // closed at the end of the table; residual mass falls in the final year
    warnings.push(TABLE_END_WARNING);
  }
  const N = omega - age;
  const lAt = (a) => (a >= omega ? 0 : lx[a]);
  const q = new Array(N);
  for (let t = 1; t <= N; t += 1) q[t - 1] = (lAt(age + t - 1) - lAt(age + t)) / lx[age];
  const sum = q.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) throw new Error(`death probabilities sum to ${sum}, not 1`);
  return { q, N, omega, warnings };
}

/**
 * Expected death year Σ q_t · t (display only).
 * @param {number[]} q
 */
export function expectedDeathYear(q) {
  return q.reduce((acc, qt, i) => acc + qt * (i + 1), 0);
}
