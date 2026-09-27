// CLEAN-ROOM ORACLE — life tables and death-year distributions.
//
// The default table is read from the extracted source file (docs/sources/ssa-period-life-table-2023-tr2026.csv, itself
// checked against the published PDF when it was extracted), NOT from src/data. Death-year probabilities are computed two
// ways that share no code with src/engine/mortality.js:
//   - from a survivors column, the actuarial definition q_t = (l_{x+t−1} − l_{x+t}) / l_x (as in v1);
//   - straight from the one-year death rates, product form P(T = t) = Π_{k<t−1} (1 − q_{x+k}) · q_{x+t−1}.
// Convention M-8 (docs/changes/2026-09-27-life-tables/model.md): the q-basis table is closed at age 120 — everyone
// alive at 119 dies within that year (the published q₁₁₉ = 0.926604 is replaced by 1).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SSA_2023_CSV = join(HERE, '..', '..', 'docs', 'sources', 'ssa-period-life-table-2023-tr2026.csv');
export const SSA_2023_PDF = join(HERE, '..', '..', 'docs', 'sources', 'ssa-period-life-table-2023-tr2026.pdf');
export const TERMINAL_AGE = 120;
export const RADIX = 100_000;

let csvCache = null;
/** The SSA 2023 period table as published: q, l, e by age 0–119 for each sex. */
export function ssa2023FromCsv() {
  if (csvCache) return csvCache;
  const lines = readFileSync(SSA_2023_CSV, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  const out = { male: { q: [], l: [], e: [] }, female: { q: [], l: [], e: [] } };
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const age = Number(f[col('age')]);
    if (age !== out.male.q.length) throw new Error(`life-table CSV is not contiguous at age ${age}`);
    for (const sex of ['male', 'female']) {
      out[sex].q.push(Number(f[col(`${sex}_q`)]));
      out[sex].l.push(Number(f[col(`${sex}_l`)]));
      out[sex].e.push(Number(f[col(`${sex}_e`)]));
    }
  }
  csvCache = out;
  return out;
}

/** One-year death rates by age with the M-8 closure (q at the last age = 1). */
export function closedDeathRates(sex) {
  const q = [...ssa2023FromCsv()[sex].q];
  q[TERMINAL_AGE - 1] = 1;
  return q;
}

/** Survivors l_0 … l_120 from the death rates (radix 100,000; l_120 = 0 by M-8). */
export function survivorsFromRates(sex) {
  const q = closedDeathRates(sex);
  const l = [RADIX];
  for (let x = 0; x < TERMINAL_AGE; x += 1) l.push(x === TERMINAL_AGE - 1 ? 0 : l[x] * (1 - q[x]));
  return l;
}

/** Death-year probabilities for a life aged x, product form from the death rates. */
export function deathYearsFromRates(sex, age) {
  const q = closedDeathRates(sex);
  const out = [];
  let alive = 1;
  for (let a = age; a < TERMINAL_AGE; a += 1) {
    out.push(alive * q[a]);
    alive *= 1 - q[a];
  }
  return out;
}

/**
 * Death-year distribution from a survivors column l_x (actuarial definition): the probability that a life aged
 * x dies in year t is (l_{x+t−1} − l_{x+t}) / l_x. The column is closed at the first zero after x, or at the end
 * of the table (all remaining lives die in the last year). An assumed death year is certain death that year.
 */
export function deathDistribution(inp) {
  if (inp.deathYearOverride != null) {
    const q = Array.from({ length: inp.deathYearOverride }, (_, i) => (i === inp.deathYearOverride - 1 ? 1 : 0));
    return { q, N: inp.deathYearOverride };
  }
  const { lx, age } = inp;
  let end = lx.length;
  for (let a = age + 1; a < lx.length; a += 1) if (lx[a] === 0) { end = a; break; }
  const l = (a) => (a >= end ? 0 : lx[a]);
  const N = end - age;
  const q = [];
  for (let t = 1; t <= N; t += 1) q.push((l(age + t - 1) - l(age + t)) / lx[age]);
  return { q, N };
}

/** Year of the second death for independent lives (J-1): explicit double sum over the pairs. */
export function secondDeathByPairs(qG, qS) {
  const qL = new Array(Math.max(qG.length, qS.length)).fill(0);
  for (let i = 1; i <= qG.length; i += 1) for (let j = 1; j <= qS.length; j += 1) qL[Math.max(i, j) - 1] += qG[i - 1] * qS[j - 1];
  return qL;
}

/** Complete life expectancy with deaths at mid-year: Σ_t P(T = t)·(t − ½). */
export const lifeExpectancy = (q) => q.reduce((a, p, i) => a + p * (i + 0.5), 0);
