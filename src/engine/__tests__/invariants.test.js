// Model invariants (model.md §11): hold for arbitrary inputs, not just the golden fixtures.
import { describe, it, expect } from 'vitest';
import { evaluateAsset, simulate, aggregate } from '../idgtModel.js';
import { lxColumn } from '../mortality.js';
import { validateInputs } from '../validate.js';
import { rankAssets } from '../ranking.js';
import { SSA_2021_LX } from '../../data/mortalityTable.js';
import { BASE, FIXTURES } from './fixtures.js';

const male = lxColumn(SSA_2021_LX, 'male');
const REL = 1e-9;
const relClose = (a, b, scale) => Math.abs(a - b) <= REL * Math.max(1, Math.abs(scale ?? b));

const scenarios = [
  ['Fixture A', FIXTURES.A],
  ['Fixture E (gift tax)', FIXTURES.E],
  ['Fixture F (partial coverage)', FIXTURES.F],
  ['Fixture H (sale)', FIXTURES.H],
  ['65M full mortality, $20M estate', { ...BASE, deathYearOverride: null, lx: male, age: 65 }],
  ['65M full mortality, $12M estate (crosses the exclusion)', { ...BASE, deathYearOverride: null, lx: male, age: 65, E0: 12_000_000 }],
  ['non-neutral swap (8% growth consideration)', { ...BASE, deathYearOverride: null, lx: male, age: 70, gSw: 0.08, ySw: 0, tauSw: 0 }],
  ['discount at death', { ...BASE, delta: 0.3, discountAtDeath: true }],
];

describe('decomposition sums exactly to ΔH_t (Level A and Level B) for every year and swap year', () => {
  for (const [name, inp] of scenarios) {
    it(name, () => {
      const res = evaluateAsset(inp);
      const N = res.derived.N;
      for (const s of [0, 1, Math.min(2, N), Math.min(5, N), N]) {
        const sim = simulate(inp, s, N);
        for (const r of sim.rows) {
          expect(relClose(r.dTW + r.dET + r.dSU, r.dH, r.Hb), `Level A t=${r.t} s=${s}`).toBe(true);
          expect(relClose(r.freeze + r.burnC + r.giftTaxC + r.resid + r.stepUp, r.dH, r.Hb), `Level B t=${r.t} s=${s}`).toBe(true);
        }
        const agg = aggregate(sim.rows, res.q);
        const compSum = Object.values(agg.components).reduce((a, b) => a + b, 0);
        expect(relClose(compSum, agg.npv, 1e6)).toBe(true);
      }
    });
  }
});

describe('return neutrality: pre-tax family wealth is identical across scenarios when G = 0 and the consideration is neutral', () => {
  it('ΔTW_t = 0 (relative) for s = none and s = 1 on a 60-year full-mortality run', () => {
    const inp = { ...BASE, deathYearOverride: null, lx: male, age: 50 };
    const res = evaluateAsset(inp);
    for (const s of [0, 1, 10]) {
      const sim = simulate(inp, s, res.derived.N);
      for (const r of sim.rows) expect(Math.abs(r.dTW)).toBeLessThanOrEqual(REL * (r.Eb + r.V));
    }
  });
});

describe('swap search properties', () => {
  it('ΔH_t(s) = ΔH_t(none) for t < s; NPV(s*) ≥ NPV(none); infeasible years are not executed', () => {
    const inp = { ...BASE, deathYearOverride: null, lx: male, age: 65 };
    const res = evaluateAsset(inp);
    const none = simulate(inp, 0, res.derived.N);
    const s = 7;
    const sim = simulate(inp, s, res.derived.N);
    for (let t = 1; t < s; t += 1) expect(sim.rows[t - 1].dH).toBe(none.rows[t - 1].dH);
    expect(res.npvOpt).toBeGreaterThanOrEqual(res.npvNone);
    const sale = simulate({ ...inp, S: 3 }, 5, res.derived.N);
    expect(sale.infeasible).toBeTruthy();
    expect(sale.rows.every((r) => !r.swapped)).toBe(true);
  });
  it('sale after a swap with G = 0 does not change ΔH_t (Fixture H s=1 equals Fixture A s=1)', () => {
    const a = evaluateAsset(FIXTURES.A);
    const h = evaluateAsset(FIXTURES.H);
    const npvA = a.npvCurve.find((c) => c.s === 1).npv;
    const npvH = h.npvCurve.find((c) => c.s === 1).npv;
    expect(Math.abs(npvA - npvH)).toBeLessThanOrEqual(0.005);
  });
  it('a swap in a non-taxable estate with G = 0 exactly recovers the step-up (Fixture C deathbed swap = 0)', () => {
    const res = evaluateAsset(FIXTURES.C);
    expect(Math.abs(res.npvCurve.find((c) => c.s === 3).npv)).toBeLessThanOrEqual(0.005);
  });
  it('basis above FMV floors the built-in gain and ties resolve to "no swap"', () => {
    const res = evaluateAsset({ ...BASE, B0: 1_500_000 });
    expect(res.rows.none.every((r) => r.BIG === 0)).toBe(true);
    expect(res.sStar).toBe(0);
    expect(res.warnings.some((w) => w.code === 'BUILT_IN_LOSS')).toBe(true);
  });
  it('liquidity: a tiny other estate makes every swap infeasible and raises the illiquidity warning', () => {
    const res = evaluateAsset({ ...BASE, E0: 0 });
    expect(res.npvCurve.slice(1).every((c) => !c.feasible)).toBe(true);
    expect(res.warnings.some((w) => w.code === 'GRANTOR_ILLIQUID')).toBe(true);
  });
});

describe('validation', () => {
  it('rejects the out-of-range inputs of model.md §10.8', () => {
    const bad = { ...BASE, g: -1.2, X0: 900_000, delta: 1, tauE: 1.2, rE: -1.5, S: -1 };
    const { errors } = validateInputs(bad);
    const fields = errors.map((e) => e.field);
    for (const f of ['g', 'X0', 'delta', 'tauE', 'rE', 'S']) expect(fields).toContain(f);
    expect(() => evaluateAsset(bad)).toThrow();
  });
  it('accepts the fixture inputs without errors', () => {
    for (const inp of Object.values(FIXTURES)) expect(validateInputs(inp).errors).toEqual([]);
  });
  it('warns on a non-neutral consideration profile and on a pre-OBBBA exclusion', () => {
    const w = validateInputs({ ...BASE, gSw: 0.08, ySw: 0, tauSw: 0, X0: 13_990_000 }).warnings.map((x) => x.code);
    expect(w).toContain('NON_NEUTRAL_SWAP');
    expect(w).toContain('PRE_OBBBA_EXCLUSION');
  });
});

describe('ranking', () => {
  it('ranks by NPV per taxable-gift dollar, keeps rank independent of display sort, flags exclusion overflow', () => {
    const a = evaluateAsset({ ...BASE, deathYearOverride: null, lx: male, age: 65, g: 0.10 });
    const b = evaluateAsset({ ...BASE, deathYearOverride: null, lx: male, age: 65, g: 0.03, B0: 900_000 });
    const rows = rankAssets([{ id: 'x', name: 'slow', result: b }, { id: 'y', name: 'fast', result: a }], { key: 'opt', remainingExclusion: 1_500_000 });
    expect(rows[0].name).toBe('fast');
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[0].exceedsRemainingExclusion).toBe(false);
    expect(rows[1].exceedsRemainingExclusion).toBe(true);
  });
});
