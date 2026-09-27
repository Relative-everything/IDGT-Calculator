// Mortality: death-year probabilities from an l_x (survivors) column. Pure functions, no React.
//
// q_t = (l_{x+t-1} - l_{x+t}) / l_x for t = 1..N, N = omega - x, omega = first age with l = 0.
// Sum of q_t is exactly 1 (no tail is dropped and nothing is renormalised) — model.md §3.
// Tables: the registry src/data/lifeTables/index.js (default: SSA 2023 period table, 2026 Trustees Report, verified;
// survivors derived from its published death rates, closed at 120 — docs/changes/2026-09-27-life-tables/model.md §1).
// Married couples: two independent lives and the year of the second death (same contract, §2).

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

/**
 * Life expectancy in years from death-year probabilities (deaths at the end of year t): Σ t·q_t − ½, the complete
 * expectation of life under a uniform distribution of deaths within each year (e_x = e°_x = curtate + ½). Works for a
 * single life and for the second of two lives alike. Display only.
 * @param {number[]} q
 */
export function lifeExpectancyYears(q) {
  return expectedDeathYear(q) - 0.5;
}

/**
 * Survivors l_x from one-year death probabilities q_x (actuarial identity l_{x+1} = l_x (1 − q_x), l_0 = radix), closed at
 * the terminal age: l_{terminalAge} = 0, i.e. everyone alive at terminalAge − 1 dies within that year
 * (docs/changes/2026-09-27-life-tables/model.md §1, M-8). Unrounded, so advanced ages keep the precision of q.
 * @param {number[]} q - death probabilities by exact age 0..terminalAge − 1
 * @param {number} radix
 * @param {number} terminalAge
 * @returns {number[]} l_0 … l_terminalAge (length terminalAge + 1)
 */
export function survivorsFromDeathRates(q, radix, terminalAge) {
  if (!Array.isArray(q) || q.length < terminalAge) throw new RangeError('death probabilities do not reach the terminal age');
  const l = new Array(terminalAge + 1);
  l[0] = radix;
  for (let x = 0; x < terminalAge - 1; x += 1) l[x + 1] = l[x] * (1 - q[x]);
  l[terminalAge] = 0;
  return l;
}

const LX_BY_TABLE = new Map();

/**
 * The survivors column the engine uses for one sex of a registry life table (src/data/lifeTables): derived from q for a
 * 'q'-basis table, the published l for an 'l'-basis (legacy keyed) table. Cached per table and sex.
 * @param {{ id:string, basis:'q'|'l', radix:number, terminalAge:number|null, data:object }} table
 * @param {'male'|'female'} sex
 */
export function lxFromLifeTable(table, sex) {
  const s = String(sex).toLowerCase();
  if (s !== 'male' && s !== 'female') throw new RangeError("sex must be 'male' or 'female'");
  const key = `${table.id}:${s}`;
  if (!LX_BY_TABLE.has(key)) {
    const lx = table.basis === 'q'
      ? survivorsFromDeathRates(table.data[s].q, table.radix, table.terminalAge)
      : lxColumn(table.data, s);
    LX_BY_TABLE.set(key, Object.freeze(lx));
  }
  return LX_BY_TABLE.get(key);
}

/**
 * Year of the second death for two independent lives (model §2, J-1/J-2): q^L_t = Σ_{max(i,j)=t} q^G_i q^S_j
 *   = q^G_t q^S_t + q^G_t F_S(t−1) + q^S_t F_G(t−1),
 * with F the cumulative death probability and q = 0 beyond a life's horizon. Every term is a product of non-negative
 * numbers, so the far tail keeps full relative precision. (The difference form F_G(t)F_S(t) − F_G(t−1)F_S(t−1) cancels
 * where both lives are almost surely dead: beyond age 115 its relative error reached 1e-7 — eval pass 3.)
 * @param {number[]} qG - grantor death-year probabilities (t = 1..N_G)
 * @param {number[]} qS - spouse death-year probabilities (t = 1..N_S)
 * @returns {number[]} q^L, length max(N_G, N_S)
 */
export function secondDeathDistribution(qG, qS) {
  const NL = Math.max(qG.length, qS.length);
  const out = new Array(NL);
  let FG = 0; // F_G(t − 1)
  let FS = 0; // F_S(t − 1)
  for (let t = 1; t <= NL; t += 1) {
    const g = t <= qG.length ? qG[t - 1] : 0;
    const s = t <= qS.length ? qS[t - 1] : 0;
    // both die in year t; or one dies in t with the other already dead (written symmetrically: swapping the lives
    // gives the same floating-point result)
    out[t - 1] = g * s + (g * FS + s * FG);
    FG += g;
    FS += s;
  }
  return out;
}
