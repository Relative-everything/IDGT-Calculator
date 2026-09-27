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

describe('life-table registry (src/data/lifeTables)', () => {
  it('every verified table matches its published checksum survivors, and the default table is verified', async () => {
    const { LIFE_TABLES, DEFAULT_LIFE_TABLE_ID, LIFE_TABLE_BY_ID } = await import('../../data/lifeTables/index.js');
    expect(LIFE_TABLE_BY_ID[DEFAULT_LIFE_TABLE_ID].verified).toBe(true);
    for (const t of LIFE_TABLES.filter((x) => x.verified)) {
      for (const sex of ['male', 'female']) {
        for (const [age, l] of Object.entries(t.checksum[sex])) {
          const published = t.basis === 'q' ? t.data[sex].l[Number(age)] : t.data[Number(age)][sex];
          expect(published, `${t.id} ${sex} ${age}`).toBe(l);
        }
      }
    }
  });
});

describe('SSA 2023 period table (2026 Trustees Report) — derived from the published death probabilities', async () => {
  const { LIFE_TABLE_BY_ID } = await import('../../data/lifeTables/index.js');
  const { lxFromLifeTable, survivorsFromDeathRates, lifeExpectancyYears } = await import('../mortality.js');
  const table = LIFE_TABLE_BY_ID['ssa-2023-tr2026'];
  it('survivors rebuilt from q match the published (rounded) survivors within one life at every age', () => {
    for (const sex of ['male', 'female']) {
      const l = lxFromLifeTable(table, sex);
      expect(l.length).toBe(121);
      expect(l[120]).toBe(0);
      for (let x = 0; x < 120; x += 1) expect(Math.abs(l[x] - table.data[sex].l[x]), `${sex} ${x}`).toBeLessThan(1);
    }
  });
  it('Σ q_t = 1 for every starting age 0–119, both sexes; horizon closes at 120', () => {
    for (const sex of ['male', 'female']) {
      const lx = lxFromLifeTable(table, sex);
      for (let age = 0; age <= 119; age += 1) {
        const m = deathProbabilities({ lx, age });
        expect(Math.abs(m.q.reduce((a, b) => a + b, 0) - 1), `${sex} ${age}`).toBeLessThanOrEqual(1e-12);
        expect(m.N).toBe(120 - age);
        expect(m.warnings).toEqual([]);
      }
    }
  });
  it('life expectancy implied by the engine equals the published column within 0.01 years at ages 1–110', () => {
    for (const sex of ['male', 'female']) {
      const lx = lxFromLifeTable(table, sex);
      for (let age = 1; age <= 110; age += 1) {
        const e = lifeExpectancyYears(deathProbabilities({ lx, age }).q);
        expect(Math.abs(e - table.data[sex].e[age]), `${sex} ${age}: ${e} vs ${table.data[sex].e[age]}`).toBeLessThan(0.01);
      }
    }
  });
  it('the first-year death probability equals the published q (male 65: 0.016455; female 85: 0.071752)', () => {
    expect(deathProbabilities({ lx: lxFromLifeTable(table, 'male'), age: 65 }).q[0]).toBeCloseTo(0.016455, 12);
    expect(deathProbabilities({ lx: lxFromLifeTable(table, 'female'), age: 85 }).q[0]).toBeCloseTo(0.071752, 12);
  });
  it('closure at the terminal age: a survivor at 119 dies within the year', () => {
    const m = deathProbabilities({ lx: survivorsFromDeathRates(table.data.male.q, 1, 120), age: 119 });
    expect(m.q).toEqual([1]);
  });
});

describe('second death of two independent lives', async () => {
  const { secondDeathDistribution } = await import('../mortality.js');
  it('two-year tables: q^G = (0.4, 0.6), q^S = (0.2, 0.8) → q^L = (0.4·0.2, 1 − 0.08) = (0.08, 0.92)', () => {
    const qL = secondDeathDistribution([0.4, 0.6], [0.2, 0.8]);
    expect(qL[0]).toBeCloseTo(0.08, 15);
    expect(qL[1]).toBeCloseTo(0.92, 15);
  });
  it('unequal horizons: the longer life decides the tail; sums to one; symmetric in the two lives', () => {
    const a = [0.1, 0.2, 0.7];
    const b = [0.5, 0.5];
    const qL = secondDeathDistribution(a, b);
    expect(qL.length).toBe(3);
    expect(qL.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 15);
    expect(secondDeathDistribution(b, a)).toEqual(qL);
    expect(qL[0]).toBeCloseTo(0.1 * 0.5, 15); // both die in year 1
    expect(qL[1]).toBeCloseTo(0.3 * 1 - 0.05, 15); // F_G(2) F_S(2) − F_G(1) F_S(1)
  });
  it('keeps full relative precision in the far tail (eval pass 3: the difference form lost 1e-7 at ages 115+)', async () => {
    const { LIFE_TABLE_BY_ID, DEFAULT_LIFE_TABLE_ID } = await import('../../data/lifeTables/index.js');
    const { lxFromLifeTable, deathProbabilities } = await import('../mortality.js');
    const table = LIFE_TABLE_BY_ID[DEFAULT_LIFE_TABLE_ID];
    const qG = deathProbabilities({ lx: lxFromLifeTable(table, 'male'), age: 78 }).q;
    const qS = deathProbabilities({ lx: lxFromLifeTable(table, 'female'), age: 75 }).q;
    const qL = secondDeathDistribution(qG, qS);
    // explicit double sum over the pairs, the definition
    const direct = new Array(qL.length).fill(0);
    qG.forEach((g, i) => qS.forEach((p, j) => { direct[Math.max(i, j)] += g * p; }));
    qL.forEach((x, t) => expect(Math.abs(x - direct[t])).toBeLessThanOrEqual(1e-13 * direct[t] + 1e-300));
    expect(direct[qL.length - 1]).toBeLessThan(1e-8); // the tail really is tiny: relative accuracy matters there
  });
});
