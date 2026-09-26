// Shared fixture inputs for the golden and invariant tests.
// Golden expected values: docs/changes/2026-09-26-idgt-rebuild/plan.md (confirmed by builder 2026-09-26).
// Derivation: docs/changes/2026-09-26-idgt-rebuild/reference/fixtures-ref.mjs (NOT the code under test).

export const BASE = Object.freeze({
  age: 0,
  lx: null,
  deathYearOverride: 3,
  FMV: 1_000_000,
  B0: 200_000,
  g: 0.07,
  y: 0.02,
  S: 0,
  gr: 0.07,
  yr: 0.02,
  delta: 0,
  annualExclusions: 0,
  tauOrd: 0.458, // 37% + 5% + 3.8%
  tauCg: 0.288, // 20% + 5% + 3.8%
  tauBene: 0.25, // 20% + 5% (fixtures keep the original tool's convention; the UI default adds NIIT)
  tauE: 0.40,
  d: 0.04,
  rE: 0.03,
  pi: 0.02,
  X0: 15_000_000,
  P: 0,
  XP: 15_000_000,
  E0: 20_000_000,
  k: 1,
  bSw: null,
  gSw: null,
  ySw: null,
  tauSw: null,
  discountAtDeath: false,
  saleAppliesToBaseline: true,
});

export const FIXTURES = {
  A: { ...BASE },
  B: { ...BASE, deathYearOverride: null, lx: [1000, 700, 0], age: 0 },
  C: { ...BASE, E0: 10_000_000 },
  D: { ...BASE, delta: 0.30 },
  E: { ...BASE, P: 15_000_000, XP: 15_000_000 },
  E2: { ...BASE, P: 15_000_000, XP: 15_000_000, deathYearOverride: 4 },
  F: { ...BASE, FMV: 2_000_000, B0: 400_000, P: 13_990_000, XP: 13_990_000 },
  G: { ...BASE, tauBene: 0.288 },
  H: { ...BASE, S: 2, gr: 0.03, yr: 0 },
};

export const MONEY_TOL = 0.005;
export const RATIO_TOL = 1e-9;

export function expectMoney(actual, expected) {
  if (Math.abs(actual - expected) > MONEY_TOL) {
    throw new Error(`money mismatch: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

export function expectRatio(actual, expected) {
  if (Math.abs(actual - expected) > RATIO_TOL) {
    throw new Error(`ratio mismatch: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}
