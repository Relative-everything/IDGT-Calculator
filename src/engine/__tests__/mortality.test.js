// Mortality: probabilities sum to one, deterministic mode, table guards.
// The SSA table itself is UNVERIFIED (see src/data/mortalityTable.js); numeric checks against it are
// characterization tests, not correctness tests, until MORTALITY_TABLE_META.verified is true.
import { describe, it, expect } from 'vitest';
import { lxColumn, validateLx, deathProbabilities, expectedDeathYear } from '../mortality.js';
import { SSA_2021_LX, MORTALITY_TABLE_META } from '../../data/mortalityTable.js';

describe('deathProbabilities', () => {
  it('two-year synthetic table gives q = [0.3, 0.7], N = 2, omega = 2', () => {
    const m = deathProbabilities({ lx: [1000, 700, 0], age: 0 });
    expect(m.q).toEqual([0.3, 0.7]);
    expect(m.N).toBe(2);
    expect(m.omega).toBe(2);
    expect(expectedDeathYear(m.q)).toBeCloseTo(1.7, 12);
  });
  it('deterministic override puts all mass in the chosen year and sets the horizon', () => {
    const m = deathProbabilities({ lx: null, age: 65, deathYearOverride: 3 });
    expect(m.q).toEqual([0, 0, 1]);
    expect(m.N).toBe(3);
    const far = deathProbabilities({ lx: [1000, 0], age: 0, deathYearOverride: 20 });
    expect(far.N).toBe(20);
  });
  it('a table that never reaches zero is closed at its end with a warning and still sums to one', () => {
    const m = deathProbabilities({ lx: [1000, 800, 500], age: 0 });
    expect(m.warnings).toContain('MORTALITY_TABLE_TRUNCATED');
    expect(m.q.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(m.q).toEqual([0.2, 0.3, 0.5]);
  });
  it('rejects non-monotone tables, ages beyond the table, and ages with no survivors', () => {
    expect(validateLx([1000, 1100, 0]).length).toBe(1);
    expect(() => deathProbabilities({ lx: [1000, 1100, 0], age: 0 })).toThrow();
    expect(() => deathProbabilities({ lx: [1000, 700, 0], age: 5 })).toThrow();
    expect(() => deathProbabilities({ lx: [1000, 700, 0], age: 2 })).toThrow();
  });
});

describe('SSA table (provisional) — structural invariants', () => {
  const male = lxColumn(SSA_2021_LX, 'male');
  const female = lxColumn(SSA_2021_LX, 'female');
  it('120 ages, radix 100,000, non-increasing', () => {
    expect(male.length).toBe(120);
    expect(female.length).toBe(120);
    expect(male[0]).toBe(100000);
    expect(validateLx(male)).toEqual([]);
    expect(validateLx(female)).toEqual([]);
  });
  it('Σ q_t = 1 within 1e-12 for every starting age with survivors (both sexes)', () => {
    for (const [sex, lx] of [['male', male], ['female', female]]) {
      for (let age = 0; age < lx.length && lx[age] > 0; age += 1) {
        const m = deathProbabilities({ lx, age });
        const sum = m.q.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 1), `${sex} age ${age}`).toBeLessThanOrEqual(1e-12);
        expect(m.N).toBe(m.omega - age);
      }
    }
  });
  it('characterization (not correctness): male ω = 111, female ω = 113, male 65 q_1 ≈ 0.017893', () => {
    expect(deathProbabilities({ lx: male, age: 65 }).omega).toBe(111);
    expect(deathProbabilities({ lx: female, age: 65 }).omega).toBe(113);
    expect(deathProbabilities({ lx: male, age: 65 }).q[0]).toBeCloseTo((77402 - 76017) / 77402, 12);
  });
  it.skipIf(!MORTALITY_TABLE_META.verified)('verified table matches the published checksum values', () => {
    const c = MORTALITY_TABLE_META.checksum;
    expect(SSA_2021_LX[65].male).toBe(c.male[65]);
    expect(SSA_2021_LX[85].male).toBe(c.male[85]);
    expect(SSA_2021_LX[65].female).toBe(c.female[65]);
    expect(SSA_2021_LX[85].female).toBe(c.female[85]);
  });
});
