// Breakevens between the ING and the IDGT (docs/changes/2026-09-27-ing-comparison/model.md §6–§7).
// Pure functions, no React. Every trial re-runs the full v1 swap search (s* re-optimised) and the ING ledger.
//
// The comparison function is Δ_opt(inp) = NPV^n − NPV_IDGT(s*), so f > 0 means the ING leads. f need not be
// monotone (s* jumps; the estate crosses the exclusion in some death years; a non-taxable estate reverses the
// burn-share direction), so the solver scans a coarse lattice first, bisects the FIRST sign change, and reports
// how many it saw and which side the ING wins on. Readings are composed from those signs, never assumed.

import { evaluateAsset } from './idgtModel.js';
import { evaluateIng } from './ingModel.js';
import { validateInputs, validateIngInputs, resolveIngInputs } from './validate.js';
import {
  BREAKEVEN_SCAN_POINTS, BREAKEVEN_MAX_ITER, BREAKEVEN_BURN_SHARE_XTOL, BREAKEVEN_STATE_RATE_XTOL,
  BREAKEVEN_STATE_RATE_MAX, BREAKEVEN_ESTATE_XTOL, BREAKEVEN_ESTATE_MULTIPLE, BREAKEVEN_EXCLUSION_MULTIPLE,
  GRID_STATE_RATES, GRID_BURN_SHARES,
} from './constants.js';

/** f > 0 across the whole bracket: the ING wins everywhere. */
export const REASON_ING_ALWAYS = 'ING_ALWAYS';
/** f < 0 across the whole bracket: the IDGT wins everywhere. */
export const REASON_IDGT_ALWAYS = 'IDGT_ALWAYS';
/** A trial's transformed inputs failed validation, so f is undefined there. */
export const REASON_NOT_EVALUABLE = 'NOT_EVALUABLE';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * Scan-then-bisect root finder (model.md §6). Evaluates f on `scanPoints` equally spaced points of [lo, hi];
 *  - any non-finite value → { value: null, reason: NOT_EVALUABLE, … }
 *  - no sign change → { value: null, reason: ING_ALWAYS (all > 0) | IDGT_ALWAYS (all < 0), … }
 *  - otherwise the first sign change is bisected until its width ≤ xTol (or maxIter), an exact zero ending early.
 * Every result carries fLo, fHi (the bracket ends), crossings (sign changes seen on the scan) and ingWinsAbove
 * (the sign just above the first root, or the constant sign when there is none).
 *
 * @param {(x:number)=>number} f
 * @param {number} lo
 * @param {number} hi
 * @param {{ xTol?: number, maxIter?: number, scanPoints?: number }} [opts]
 */
export function solveRoot(f, lo, hi, { xTol = 1e-4, maxIter = BREAKEVEN_MAX_ITER, scanPoints = BREAKEVEN_SCAN_POINTS } = {}) {
  const m = Math.max(2, Math.floor(scanPoints));
  const xs = Array.from({ length: m }, (_, i) => (i === m - 1 ? hi : lo + ((hi - lo) * i) / (m - 1)));
  const fs = xs.map((x) => f(x));
  const fLo = fs[0];
  const fHi = fs[m - 1];
  const base = { fLo, fHi };
  if (fs.some((v) => !Number.isFinite(v))) return { value: null, reason: REASON_NOT_EVALUABLE, ...base, crossings: 0, ingWinsAbove: null };

  // sign changes across adjacent scan points (an exact zero counts as a root at that point)
  let crossings = 0;
  let first = -1;
  for (let i = 0; i < m - 1; i += 1) {
    const zeroHere = fs[i] === 0 && (i === 0 || sign(fs[i - 1]) !== 0);
    if (zeroHere || sign(fs[i]) * sign(fs[i + 1]) < 0) {
      crossings += 1;
      if (first < 0) first = i;
    }
  }
  if (fs[m - 1] === 0 && sign(fs[m - 2]) !== 0) { crossings += 1; if (first < 0) first = m - 1; }
  if (first < 0) {
    return { value: null, reason: fLo > 0 ? REASON_ING_ALWAYS : REASON_IDGT_ALWAYS, ...base, crossings: 0, ingWinsAbove: fLo > 0 };
  }
  if (fs[first] === 0) {
    const above = first < m - 1 ? fs[first + 1] : fs[first];
    return { value: xs[first], fAtValue: 0, iterations: 0, ...base, crossings, ingWinsAbove: above > 0 };
  }

  let a = xs[first];
  let b = xs[first + 1];
  let fa = fs[first];
  let fb = fs[first + 1];
  const ingWinsAbove = fb > 0;
  let iterations = 0;
  while (b - a > xTol && iterations < maxIter) {
    const mid = a + (b - a) / 2;
    const fm = f(mid);
    iterations += 1;
    if (!Number.isFinite(fm)) return { value: null, reason: REASON_NOT_EVALUABLE, ...base, crossings, ingWinsAbove: null };
    if (fm === 0) return { value: mid, fAtValue: 0, iterations, ...base, crossings, ingWinsAbove, bracket: { lo: a, hi: b, fLo: fa, fHi: fb } };
    if (sign(fm) === sign(fa)) { a = mid; fa = fm; } else { b = mid; fb = fm; }
  }
  const value = a + (b - a) / 2;
  return { value, fAtValue: f(value), iterations, ...base, crossings, ingWinsAbove, bracket: { lo: a, hi: b, fLo: fa, fHi: fb } };
}

/**
 * Input transform for §6.2: the state component of both grantor stacks replaced by σ
 * (τ_ord' = τ_ord − σ_ord + σ, τ_cg' = τ_cg − σ_cg + σ, and the components themselves), never one without the
 * others; the ING's own state rate and the heirs' rates are unchanged. Returns the input itself when σ equals
 * both components, so the transform is an exact identity at the input's own rate.
 */
export function withStateRate(inp, sigma) {
  if (sigma === inp.stateOrd && sigma === inp.stateCg) return inp;
  return {
    ...inp,
    tauOrd: inp.tauOrd - inp.stateOrd + sigma,
    tauCg: inp.tauCg - inp.stateCg + sigma,
    stateOrd: sigma,
    stateCg: sigma,
  };
}

/** Input transform for §6.1: the share of the IDGT's income tax the grantor bears (identity at the input's own φ). */
export function withBurnShare(inp, phi) {
  return phi === resolveIngInputs(inp).burnShare ? inp : { ...inp, burnShare: phi };
}

/** Input transform for §6.3: the size of the other estate (identity at the input's own E_0). */
export function withOtherEstate(inp, E) {
  return E === inp.E0 ? inp : { ...inp, E0: E };
}

/** Δ_opt and the verdict, or null when the (transformed) inputs fail validation — never throws. */
export function compare(inp) {
  if (validateInputs(inp).errors.length || validateIngInputs(inp).length) return null;
  const { deltaOpt, verdict } = evaluateIng(inp, evaluateAsset(inp)).vsIdgt;
  return { deltaOpt, verdict };
}

const safeDelta = (inp) => {
  const c = compare(inp);
  return c ? c.deltaOpt : NaN;
};

/**
 * The three breakevens of model.md §6 (see solveRoot for the result shape):
 *   burnShare   — φ* on [0, 1]: the share of the trust's income tax the grantor must bear for the IDGT to match the ING
 *   stateRate   — σ* on [0, 20%]: the grantor's state income-tax rate at which the two structures tie
 *   otherEstate — E_0* on [0, max(3 E_0, 5 X_0)]: the size of the other estate at which they tie
 * Which side wins above each root is in `ingWinsAbove`; the UI composes the sentence from it.
 */
export function breakevens(inp) {
  const burnShare = solveRoot((phi) => safeDelta(withBurnShare(inp, phi)), 0, 1, { xTol: BREAKEVEN_BURN_SHARE_XTOL });
  const stateRate = solveRoot((sigma) => safeDelta(withStateRate(inp, sigma)), 0, BREAKEVEN_STATE_RATE_MAX, { xTol: BREAKEVEN_STATE_RATE_XTOL });
  const hiE = Math.max(BREAKEVEN_ESTATE_MULTIPLE * inp.E0, BREAKEVEN_EXCLUSION_MULTIPLE * inp.X0);
  const otherEstate = solveRoot((E) => safeDelta(withOtherEstate(inp, E)), 0, hiE, { xTol: BREAKEVEN_ESTATE_XTOL });
  return { burnShare, stateRate, otherEstate };
}

/** Insert `value` into a sorted lattice (ascending or descending) unless it is already on it; returns [axis, index]. */
function withOwnPoint(lattice, value, descending) {
  const axis = [...lattice];
  let idx = axis.indexOf(value);
  if (idx >= 0) return [axis, idx, false];
  idx = axis.findIndex((x) => (descending ? x < value : x > value));
  if (idx < 0) idx = axis.length;
  axis.splice(idx, 0, value);
  return [axis, idx, true];
}

/**
 * Δ_opt on the lattice of model.md §7: grantor state rate σ (columns, ascending) × burn share φ (rows, descending).
 * The input's own σ (when σ_ord = σ_cg) and φ are inserted when they fall between lattice points; the own column
 * is evaluated on the UNTRANSFORMED stacks, so cells[own.row][own.col] is the headline Δ_opt bit for bit. When
 * σ_ord ≠ σ_cg the own column is still inserted, keyed by σ_ord and flagged `asEntered`.
 * cells[i][j] / verdicts[i][j] are null where the transformed inputs fail validation.
 */
export function comparisonGrid(inp) {
  const ownPhi = resolveIngInputs(inp).burnShare;
  const [stateRates, col, colInserted] = withOwnPoint(GRID_STATE_RATES, inp.stateOrd, false);
  const [burnShares, row, rowInserted] = withOwnPoint(GRID_BURN_SHARES, ownPhi, true);
  const evaluated = burnShares.map((phi) => stateRates.map((sigma, j) => {
    const stacked = j === col ? inp : withStateRate(inp, sigma);
    return compare(withBurnShare(stacked, phi));
  }));
  return {
    stateRates,
    burnShares,
    cells: evaluated.map((r) => r.map((c) => (c ? c.deltaOpt : null))),
    verdicts: evaluated.map((r) => r.map((c) => (c ? c.verdict : null))),
    own: { row, col, rowInserted, colInserted, asEntered: inp.stateOrd !== inp.stateCg },
  };
}
