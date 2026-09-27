// Breakeven solver and grid (docs/changes/2026-09-27-ing-comparison/model.md §6–§7; spec R4–R5).
// Scenario roots were located by a numerical sweep (plan.md); the tests assert properties of each root
// (the verdict flips across it, the reading's direction) rather than a digit-level value.
import { describe, it, expect } from 'vitest';
import { solveRoot, breakevens, comparisonGrid, compare, withStateRate, withBurnShare, withOtherEstate,
  REASON_ING_ALWAYS, REASON_IDGT_ALWAYS, REASON_NOT_EVALUABLE } from '../breakeven.js';
import { evaluateAsset } from '../idgtModel.js';
import { evaluateIng } from '../ingModel.js';
import { BASE } from './fixtures.js';
import { BREAKEVEN_BURN_SHARE_XTOL, BREAKEVEN_STATE_RATE_XTOL, BREAKEVEN_ESTATE_XTOL } from '../constants.js';

const stateStack = (inp, s) => ({ ...inp, tauOrd: 0.37 + 0.038 + s, tauCg: 0.2 + 0.038 + s, stateOrd: s, stateCg: s });
// Pre-sale business near the exclusion: $5M, basis 0, 5% growth, sale in year 2; $12M other estate; 13.3% state; death in year 5.
const PRE_SALE = stateStack({ ...BASE, FMV: 5_000_000, B0: 0, g: 0.05, y: 0.02, S: 2, gr: 0.05, yr: 0.03, E0: 12_000_000, deathYearOverride: 5, tauBene: 0.288 }, 0.133);
// Modest estate: $6M other estate, the same asset without a sale, 5% state, death in year 5.
const MODEST = stateStack({ ...BASE, FMV: 5_000_000, B0: 0, g: 0.05, y: 0.02, E0: 6_000_000, deathYearOverride: 5, tauBene: 0.288 }, 0.05);
const verdictAt = (inp) => compare(inp).deltaOpt > 0;

describe('solveRoot', () => {
  it('finds a single root to the tolerance and reports which side the ING wins on', () => {
    const down = solveRoot((x) => 0.3 - x, 0, 1, { xTol: 1e-6 });
    expect(Math.abs(down.value - 0.3)).toBeLessThanOrEqual(1e-6);
    expect(down.crossings).toBe(1);
    expect(down.ingWinsAbove).toBe(false);
    expect(solveRoot((x) => x - 0.3, 0, 1).ingWinsAbove).toBe(true);
  });
  it('reports the sign pattern when there is no root, and NOT_EVALUABLE on a non-finite value', () => {
    expect(solveRoot(() => 5, 0, 1)).toMatchObject({ value: null, reason: REASON_ING_ALWAYS, crossings: 0, fLo: 5, fHi: 5 });
    expect(solveRoot(() => -5, 0, 1)).toMatchObject({ value: null, reason: REASON_IDGT_ALWAYS, crossings: 0 });
    expect(solveRoot((x) => (x > 0.5 ? NaN : 1), 0, 1)).toMatchObject({ value: null, reason: REASON_NOT_EVALUABLE });
  });
  it('counts several crossings and bisects the first; returns an exact zero on a scan point', () => {
    const cubic = (x) => (x - 0.15) * (x - 0.55) * (x - 0.85);
    const r = solveRoot(cubic, 0, 1, { xTol: 1e-8 });
    expect(r.crossings).toBe(3);
    expect(Math.abs(r.value - 0.15)).toBeLessThanOrEqual(1e-8);
    const z = solveRoot((x) => x - 0.5, 0, 1);
    expect(z).toMatchObject({ value: 0.5, fAtValue: 0, iterations: 0, crossings: 1, ingWinsAbove: true });
  });
  it('never runs past maxIter', () => {
    let calls = 0;
    const r = solveRoot((x) => { calls += 1; return 0.33 - x; }, 0, 1, { xTol: 0, maxIter: 7 });
    expect(r.iterations).toBe(7);
    expect(calls).toBe(11 + 7 + 1);
  });
});

describe('input transforms', () => {
  it('replace the state component in both stacks together and are identities at the input’s own values', () => {
    const t = withStateRate(BASE, 0.093);
    expect(t.tauOrd).toBeCloseTo(0.37 + 0.038 + 0.093, 12);
    expect(t.tauCg).toBeCloseTo(0.2 + 0.038 + 0.093, 12);
    expect(t.stateOrd).toBe(0.093);
    expect(t.stateCg).toBe(0.093);
    expect(withStateRate(BASE, BASE.stateOrd)).toBe(BASE);
    expect(withBurnShare(BASE, 1)).toBe(BASE);
    expect(withOtherEstate(BASE, BASE.E0)).toBe(BASE);
  });
});

describe('breakevens (each root: the verdict flips across it, in the reported direction)', () => {
  it('burn share — pre-sale business near the exclusion: the IDGT wins only while the grantor bears at least φ*', () => {
    const { burnShare: r } = breakevens(PRE_SALE);
    expect(r.value).toBeGreaterThan(0.1);
    expect(r.value).toBeLessThan(0.2);
    expect(r.crossings).toBe(1);
    expect(r.ingWinsAbove).toBe(false);
    const eps = 2 * BREAKEVEN_BURN_SHARE_XTOL;
    expect(verdictAt(withBurnShare(PRE_SALE, r.value - eps))).toBe(true);
    expect(verdictAt(withBurnShare(PRE_SALE, r.value + eps))).toBe(false);
  });
  it('state rate — modest estate: the ING wins only when the grantor’s state rate is at least σ*', () => {
    const { stateRate: r } = breakevens(MODEST);
    expect(r.value).toBeGreaterThan(0.02);
    expect(r.value).toBeLessThan(0.03);
    expect(r.ingWinsAbove).toBe(true);
    const eps = 2 * BREAKEVEN_STATE_RATE_XTOL;
    expect(verdictAt(withStateRate(MODEST, r.value - eps))).toBe(false);
    expect(verdictAt(withStateRate(MODEST, r.value + eps))).toBe(true);
  });
  it('other estate — default asset: below E_0* the ING wins', () => {
    const { otherEstate: r } = breakevens(BASE);
    expect(r.value).not.toBeNull();
    expect(r.ingWinsAbove).toBe(false);
    const eps = 2 * BREAKEVEN_ESTATE_XTOL;
    expect(verdictAt(withOtherEstate(BASE, r.value - eps))).toBe(true);
    expect(verdictAt(withOtherEstate(BASE, r.value + eps))).toBe(false);
  });
  it('a clearly taxable estate: no burn share and no state rate up to 20% makes the ING win', () => {
    const inp = { ...BASE, deathYearOverride: 20, E0: 40_000_000 };
    const { burnShare, stateRate } = breakevens(inp);
    expect(burnShare).toMatchObject({ value: null, reason: REASON_IDGT_ALWAYS });
    expect(stateRate).toMatchObject({ value: null, reason: REASON_IDGT_ALWAYS });
  });
});

describe('comparisonGrid (spec R5)', () => {
  it('inserts the input’s own state rate; the own cell is the headline Δ_opt bit for bit', () => {
    const g = comparisonGrid(BASE);
    expect(g.stateRates).toEqual([0, 0.02, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.14]);
    expect(g.burnShares).toEqual([1, 0.8, 0.6, 0.4, 0.2, 0]);
    expect(g.own).toMatchObject({ row: 0, col: 3, rowInserted: false, colInserted: true, asEntered: false });
    expect(g.cells[g.own.row][g.own.col]).toBe(evaluateIng(BASE, evaluateAsset(BASE)).vsIdgt.deltaOpt);
    expect(g.cells.length).toBe(6);
    g.cells.forEach((row) => expect(row.length).toBe(9));
  });
  it('inserts an off-lattice burn share, keys the own column by σ_ord when the stacks differ, and keeps verdicts consistent with cells', () => {
    const inp = { ...BASE, burnShare: 0.75, stateCg: 0.03, tauCg: 0.2 + 0.038 + 0.03 };
    const g = comparisonGrid(inp);
    expect(g.burnShares).toEqual([1, 0.8, 0.75, 0.6, 0.4, 0.2, 0]);
    expect(g.own).toMatchObject({ row: 2, rowInserted: true, asEntered: true });
    expect(g.cells[g.own.row][g.own.col]).toBe(evaluateIng(inp, evaluateAsset(inp)).vsIdgt.deltaOpt);
    g.cells.forEach((row, i) => row.forEach((v, j) => {
      const verdict = g.verdicts[i][j];
      if (verdict === 'ING') expect(v).toBeGreaterThan(0);
      if (verdict === 'IDGT') expect(v).toBeLessThan(0);
    }));
  });
});
