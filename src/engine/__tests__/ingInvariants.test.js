// ING comparison invariants (docs/changes/2026-09-27-ing-comparison/model.md §2–§5; spec R1–R3).
// These hold for arbitrary inputs; the golden values live in ingGolden.test.js.
import { describe, it, expect } from 'vitest';
import { evaluateAsset, simulate, aggregate } from '../idgtModel.js';
import { evaluateIng, simulateIng } from '../ingModel.js';
import { lxColumn } from '../mortality.js';
import { SSA_2021_LX } from '../../data/mortalityTable.js';
import { BASE, FIXTURES } from './fixtures.js';
import { V1_ROW_KEYS, V1_SNAPSHOT } from './v1RowSnapshot.js';

const male = lxColumn(SSA_2021_LX, 'male');
const REL = 1e-9;
const relClose = (a, b, scale) => Math.abs(a - b) <= REL * Math.max(1, Math.abs(scale ?? b));

// The snapshot scenarios, rebuilt exactly as reference/make-v1-snapshot.mjs builds them (φ = 1 by default).
const SNAPSHOT_INPUTS = {
  ...Object.fromEntries(Object.entries(FIXTURES).map(([k, inp]) => [`Fixture ${k}`, inp])),
  '65M full mortality, $20M estate': { ...BASE, deathYearOverride: null, lx: male, age: 65 },
  'discount at death': { ...BASE, delta: 0.3, discountAtDeath: true },
  'non-neutral swap (8% growth consideration)': { ...BASE, deathYearOverride: null, lx: male, age: 70, gSw: 0.08, ySw: 0, tauSw: 0 },
};

describe('φ = 1 reproduces the v1 engine row for row (bit-identical; spec R1)', () => {
  // The one intended change: model.md §2 amends v1 §7 so that after a swap with discountAtDeath the haircut on
  // the consideration is booked in Resid, not Burn. Their sum — and every other key — is unchanged.
  const amended = (inp, row) => inp.discountAtDeath && row.swapped;
  for (const snap of V1_SNAPSHOT) {
    it(`${snap.name}, s = ${snap.s}`, () => {
      const inp = SNAPSHOT_INPUTS[snap.name];
      const sim = simulate(inp, snap.s, snap.N);
      expect(sim.infeasible).toBe(snap.infeasible);
      sim.rows.forEach((row, i) => {
        const want = snap.rows[i];
        for (const key of V1_ROW_KEYS) {
          if (amended(inp, row) && (key === 'burnC' || key === 'resid')) continue;
          // numbers: === is bit identity except that it equates −0 and +0 (JSON cannot store −0)
          if (typeof want[key] === 'number') expect(row[key] === want[key], `${key} t=${row.t}: ${row[key]} vs ${want[key]}`).toBe(true);
          else expect(row[key], `${key} t=${row.t}`).toEqual(want[key]);
        }
        if (amended(inp, row)) expect(relClose(row.burnC + row.resid, want.burnC + want.resid, row.Hb)).toBe(true);
        expect(row.Vs).toBe(row.V);
        expect(row.inclS).toBe(row.incl);
      });
    });
  }
});

const IDGT_SCENARIOS = [
  ['Fixture A', FIXTURES.A],
  ['Fixture E (gift tax)', FIXTURES.E],
  ['Fixture H (sale in year 2)', FIXTURES.H],
  ['discount at death', { ...BASE, delta: 0.3, discountAtDeath: true }],
  ['65M full mortality', { ...BASE, deathYearOverride: null, lx: male, age: 65 }],
  ['non-neutral consideration', { ...BASE, deathYearOverride: null, lx: male, age: 70, gSw: 0.08, ySw: 0, tauSw: 0 }],
];

describe('burn share φ: identities for every φ and swap year (spec R2)', () => {
  for (const [name, base] of IDGT_SCENARIOS) {
    for (const phi of [0, 0.35, 0.5]) {
      it(`${name}, φ = ${phi}: Level A and Level B sum exactly to ΔH`, () => {
        const inp = { ...base, burnShare: phi };
        const N = evaluateAsset(inp).derived.N;
        for (const s of [0, 1, Math.min(2, N), N]) {
          const sim = simulate(inp, s, N);
          if (sim.infeasible) continue;
          for (const r of sim.rows) {
            expect(relClose(r.dTW + r.dET + r.dSU, r.dH, r.Hb), `A t=${r.t} s=${s}`).toBe(true);
            expect(relClose(r.freeze + r.burnC + r.giftTaxC + r.resid + r.stepUp, r.dH, r.Hb), `B t=${r.t} s=${s}`).toBe(true);
            expect(relClose(r.trustPaid + r.grantorPaid, r.burnS + r.burnSw + r.CGs, r.Hb), `paid t=${r.t}`).toBe(true);
          }
          const agg = aggregate(sim.rows, evaluateAsset(inp).q);
          const sum = Object.values(agg.components).reduce((a, b) => a + b, 0);
          expect(relClose(sum, agg.npv, 1e6)).toBe(true);
        }
      });
    }
  }
  it('φ = 0: burn component zero for every swap year, with and without discount at death', () => {
    // Exactly 0 before the swap (V^s and T^self are the same operations); after it the consideration and T^self
    // compound through differently associated products, so zero holds to relative 1e-12 of the row's scale.
    for (const [, base] of IDGT_SCENARIOS) {
      const inp = { ...base, burnShare: 0 };
      const N = evaluateAsset(inp).derived.N;
      for (const s of [0, 1, Math.min(2, N)]) {
        const sim = simulate(inp, s, N);
        if (sim.infeasible) continue;
        for (const r of sim.rows) {
          if (!r.swapped) expect(r.burnC, `s=${s} t=${r.t}`).toBe(0);
          else expect(Math.abs(r.burnC), `s=${s} t=${r.t}`).toBeLessThanOrEqual(1e-12 * r.Hb);
        }
      }
    }
  });
  it('φ = 0 before any swap: the trust is exactly the self-taxed counterfactual T^self', () => {
    for (const [, base] of IDGT_SCENARIOS) {
      const sim = simulate({ ...base, burnShare: 0 }, 0, 5);
      for (const r of sim.rows) expect(r.T).toBe(r.Tself);
    }
  });
  it('HOLD never depends on φ', () => {
    const a = simulate({ ...FIXTURES.H, burnShare: 1 }, 1, 3);
    const b = simulate({ ...FIXTURES.H, burnShare: 0.2 }, 1, 3);
    a.rows.forEach((r, i) => { for (const k of ['V', 'Eb', 'Bb', 'ETb', 'SUb', 'Hb']) expect(b.rows[i][k]).toBe(r[k]); });
  });
  it('the IDGT result carries BURN_REIMBURSED only when φ < 1', () => {
    expect(evaluateAsset({ ...BASE, burnShare: 0.9 }).warnings.map((w) => w.code)).toContain('BURN_REIMBURSED');
    expect(evaluateAsset(BASE).warnings.map((w) => w.code)).not.toContain('BURN_REIMBURSED');
  });
});

const ING_SCENARIOS = [
  ['Fixture A base', BASE],
  ['gift tax paid, sale in year 2 (G > 0, S ≥ 1)', { ...FIXTURES.E, S: 2, gr: 0.03, yr: 0 }],
  ['sale in year 2', FIXTURES.H],
  ['discount at death', { ...BASE, delta: 0.3, discountAtDeath: true }],
  ['fee beyond the after-tax yield, sale in year 4', { ...BASE, B0: 0, y: 0.004, ingAdminRate: 0.012, S: 4, gr: 0.05, yr: 0.01, deathYearOverride: 8 }],
  ['home state taxes the grantor (NY/CA)', { ...BASE, ingStateTaxOnGrantor: true, S: 2, gr: 0.03, yr: 0.01 }],
  ['source-state rate on the trust', { ...BASE, ingStateRate: 0.04, ingAdminRate: 0.003 }],
  ['65M full mortality', { ...BASE, deathYearOverride: null, lx: male, age: 65 }],
  ['65M, $12M estate (crosses the exclusion)', { ...BASE, deathYearOverride: null, lx: male, age: 65, E0: 12_000_000 }],
];

describe('ING ledger identities (spec R3)', () => {
  for (const [name, inp] of ING_SCENARIOS) {
    it(`${name}: Level A, the four components and their NPVs sum exactly; basis never negative`, () => {
      const idgt = evaluateAsset(inp);
      const ing = evaluateIng(inp, idgt);
      for (const r of ing.rows) {
        expect(relClose(r.dTW + r.dET + r.dSU, r.dH, r.Hb), `A t=${r.t}`).toBe(true);
        expect(relClose(r.locNet + r.ssNet + r.feeNet + r.stepUp, r.dH, r.Hb), `components t=${r.t}`).toBe(true);
        expect(relClose(r.loc + r.ss + r.fee, r.dTW, r.Hb), `wealth split t=${r.t}`).toBe(true);
        expect(r.Bn).toBeGreaterThanOrEqual(0);
        expect(r.Vn).toBeGreaterThan(0);
      }
      const sum = Object.values(ing.components).reduce((a, b) => a + b, 0);
      expect(relClose(sum, ing.npv, 1e6)).toBe(true);
      // bridge: IDGT components removed reach zero, ING components added reach NPV^n
      const { steps, start, end } = ing.vsIdgt.bridge;
      expect(steps[0].from).toBe(start);
      expect(relClose(steps[4].to, 0, 1e6)).toBe(true);
      expect(relClose(steps[steps.length - 1].to, end, 1e6)).toBe(true);
      expect(relClose(end - start, ing.vsIdgt.deltaOpt, 1e6)).toBe(true);
      // the crossover column is the IDGT's ΔH at its optimal swap year
      ing.rows.forEach((r, i) => expect(r.dHIdgt).toBe(idgt.rows.opt[i].dH));
    });
  }
  it('the other estate is untouched unless the home state taxes the grantor on the ING', () => {
    const { rows } = simulateIng({ ...BASE, deathYearOverride: 6 }, 6);
    rows.forEach((r) => expect(relClose(r.En, BASE.E0 * Math.pow(1 + BASE.rE, r.t), r.En)).toBe(true));
    const flagged = simulateIng({ ...BASE, ingStateTaxOnGrantor: true }, 3).rows;
    flagged.forEach((r) => expect(r.grantorStateTax).toBeGreaterThan(0));
  });
  it('a non-taxable estate: heirs gain exactly the family-wealth difference', () => {
    const inp = { ...BASE, E0: 5_000_000, deathYearOverride: 10 };
    for (const r of evaluateIng(inp).rows) expect(relClose(r.dH, r.dTW, r.Hb)).toBe(true);
  });
  it('no rate differential → state saving exactly offset; no fee → fee component exactly zero', () => {
    // trust stack equal to the grantor's: 37% + 3.8% + 5% = 45.8%; 20% + 3.8% + 5% = 28.8%
    const inp = { ...BASE, ingStateRate: 0.05, S: 2, gr: 0.03, yr: 0.01 };
    for (const r of evaluateIng(inp).rows) {
      expect(Math.abs(r.ssNet)).toBeLessThanOrEqual(1e-6);
      expect(r.feeNet).toBe(0);
    }
  });
  it('V^same equals v1 T^self when no gift tax was paid; differs by τ_cg·(B^T_0 − B_0) at a sale when it was', () => {
    const plain = { ...FIXTURES.H };
    const ingRows = simulateIng(plain, 3).rows;
    const tself = simulate(plain, 0, 3).rows;
    ingRows.forEach((r, i) => expect(relClose(r.Vsame, tself[i].Tself, r.Vsame)).toBe(true));
    // negative control: Fixture E (gift tax 400,000; B^T_0 = 520,000) with a sale in year 2
    const taxed = { ...FIXTURES.E, S: 2, gr: 0.03, yr: 0 };
    const r2 = simulateIng(taxed, 3).rows[1];
    const t2 = simulate(taxed, 0, 3).rows[1];
    expect(Math.abs((t2.Tself - r2.Vsame) - 0.288 * (520_000 - 200_000))).toBeLessThanOrEqual(1e-6);
  });
  it('verdict follows Δ_opt with the v1 tie tolerance; the ING leads years match ΔH', () => {
    for (const [, inp] of ING_SCENARIOS) {
      const ing = evaluateIng(inp);
      const { deltaOpt, verdict, ingLeadsYears, firstIngYear } = ing.vsIdgt;
      if (verdict === 'ING') expect(deltaOpt).toBeGreaterThan(0);
      if (verdict === 'IDGT') expect(deltaOpt).toBeLessThan(0);
      for (const t of ingLeadsYears) expect(ing.rows[t - 1].dH).toBeGreaterThan(ing.rows[t - 1].dHIdgt);
      expect(firstIngYear).toBe(ingLeadsYears.length ? ingLeadsYears[0] : null);
    }
  });
  it('warnings belong to the ING result only and fire on their triggers', () => {
    const fee = evaluateIng({ ...BASE, ingAdminRate: 0.02 });
    expect(fee.warnings.map((w) => w.code)).toContain('ING_FEE_EXCEEDS_YIELD');
    expect(evaluateAsset({ ...BASE, ingAdminRate: 0.02 }).warnings.map((w) => w.code)).not.toContain('ING_FEE_EXCEEDS_YIELD');
    expect(evaluateIng({ ...BASE, ingStateRate: 0.05 }).warnings.map((w) => w.code)).toContain('ING_NO_STATE_SAVING');
    expect(evaluateIng(BASE).warnings).toEqual([]);
    expect(evaluateIng(BASE).derived.zeroStateRateAssumption).toBe(true);
    expect(evaluateIng({ ...BASE, ingStateRate: 0.01 }).derived.zeroStateRateAssumption).toBe(false);
  });
  it('evaluateIng requires the grantor state components and NIIT; validation reports ING fields, never throws', async () => {
    const { validateInputs, validateIngInputs } = await import('../validate.js');
    const { stateOrd: _s, ...noState } = BASE;
    expect(validateIngInputs(noState).map((e) => e.field)).toEqual(['stateOrd']);
    expect(() => evaluateIng(noState)).toThrow(/stateOrd/);
    const bad = { ...BASE, burnShare: 1.2, ingAdminRate: -0.01, ingStateRate: 0.7, stateOrd: 0.5 };
    const fields = validateInputs(bad).errors.map((e) => e.field);
    for (const f of ['burnShare', 'ingAdminRate', 'ingFedOrd', 'stateOrd']) expect(fields).toContain(f);
    // value factor must stay positive: −30% growth, no yield, 80% fee
    expect(validateInputs({ ...BASE, g: -0.3, y: 0, ingAdminRate: 0.8 }).errors.map((e) => e.field)).toContain('ingAdminRate');
  });
});
