// Shared fixture inputs for the golden and invariant tests.
// Golden expected values: docs/changes/2026-09-26-idgt-rebuild/plan.md (confirmed by builder 2026-09-26).
// Derivation: docs/changes/2026-09-26-idgt-rebuild/reference/fixtures-ref.mjs (NOT the code under test).
// ING comparison fixtures (I, J, …): docs/changes/2026-09-27-ing-comparison/plan.md "Golden values"
// (reference-derived; awaiting builder confirmation) — derivation reference/ing-ref.mjs (NOT the code under test).

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
  // ING comparison module fields at the contract defaults (ING model.md §1): the v1 goldens must not move.
  stateOrd: 0.05, // state component inside tauOrd
  stateCg: 0.05, // state component inside tauCg
  niit: 0.038,
  ingFedOrd: 0.37,
  ingFedLtcg: 0.20,
  ingStateRate: 0,
  ingAdminRate: 0,
  ingStateTaxOnGrantor: false,
  burnShare: 1,
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

// ING comparison fixtures (ING plan.md "Golden values"). τ^n_ord = 37% + 3.8% = 40.8%, τ^n_cg = 23.8%, fee 0.
export const ING_FIXTURES = {
  I: { ...BASE }, // ING on the Fixture A base; death end of year 3
  J: { ...BASE, burnShare: 0.5 }, // IDGT, grantor bears half the burn
  PHI0: { ...BASE, burnShare: 0 }, // IDGT, trust pays all of its own tax
  I2: { ...BASE, S: 2, gr: 0.03, yr: 0 }, // ING with a sale in year 2
  J2: { ...BASE, burnShare: 0.5, S: 2, gr: 0.03, yr: 0 }, // IDGT φ = 0.5 with the same sale
  I3: { ...BASE, ingAdminRate: 0.005 }, // ING with a 0.5% fee
  I4: { ...BASE, E0: 10_000_000 }, // ING in a non-taxable estate
  I5: { ...BASE, B0: 0, y: 0.005, ingAdminRate: 0.01, S: 3, gr: 0.03, yr: 0 }, // fee beyond the after-tax yield: pro-rata liquidation
  I6: { ...BASE, ingStateTaxOnGrantor: true }, // NY/CA: the home state taxes the grantor on the ING
  J3: { ...BASE, burnShare: 0, delta: 0.30, discountAtDeath: true }, // φ = 0, swap with discount at death: burn ≡ 0
};

export const MONEY_TOL = 0.005;
export const RATIO_TOL = 1e-9;

// Both helpers throw on a non-finite actual, so a missing or renamed row key can never pass vacuously
// (Math.abs(undefined − x) > tol is false because NaN comparisons are false).
export function expectMoney(actual, expected) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > MONEY_TOL) {
    throw new Error(`money mismatch: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

export function expectRatio(actual, expected) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > RATIO_TOL) {
    throw new Error(`ratio mismatch: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}
