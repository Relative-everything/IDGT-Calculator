# Intent: IDGT calculator full rebuild (v1 — gift mechanism)
Author: Jared (builder), captured by Claude. Date: 2026-09-26. Status: draft.

## Problem
The calculator exists in two generations and neither computes a defensible number. The original
single-file build sums three "benefit buckets" (tax burn, estate-tax impact, step-up impact) that
are measured against different baselines, credits 100% of income tax paid as heir wealth, applies
a fabricated `FMV × rate²` term, and drops survivorship mass beyond the projection horizon. The
React/Vite port kept the wrong quantities, taxes trust income at the 40% *estate* rate, never
reduces the exemption for the gift, leaves 11 of its own inputs unwired (the grantor panel is not
even rendered), ships a synthetic "Table 2000CM" factor grid, and has no styling because Tailwind
is used but not installed. Its 7 tests are sign/typeof checks; the build is green while the math
is wrong in kind.

## Proposed outcome
An advisor can enter a grantor, an estate, and N candidate assets and get, per asset: the
probability-weighted, discounted heir-wealth gain of gifting it to an IDGT versus holding it to
death (NPV), an exact decomposition of that NPV (freeze / tax burn / gift tax / step-up), the
best year to exercise the §675(4)(C) swap power, and a ranking by NPV per dollar of taxable gift
value. Every input on screen changes an output; every number is traceable to a per-year ledger
the advisor can read; every rule cites its authority. Anything that cannot be verified from
inside this session is visibly deferred, not silently approximated.

## Affected users and systems
UHNW estate-planning advisors (CFP/ChFC/attorneys) using the GitHub Pages deployment at
relative-everything.github.io/IDGT-Calculator. Touches every folder under `src/` (engine, data,
components, new hooks), the Vite/Tailwind toolchain, tests, README, and `src/CLAUDE.md`.

## Constraints
- Single session, single-threaded build; the plan is committed before any source edit.
- No client data; fixtures use round synthetic numbers.
- Statutory basis must be current law as of 2026-09-26 (OBBBA: $15,000,000 basic exclusion for
  2026, indexed after; no TCJA sunset). Every constant carries a source and confidence.
- Golden values are hand-derived and builder-confirmed before a test asserts them.
- Repo governance (`src/CLAUDE.md`): engine pure, data static, components with zero calculation
  logic, no localStorage, no stubs.
- Network: only WebSearch snippets are reachable; ssa.gov / irs.gov are egress-blocked, so the
  SSA life table cannot be verified here.

## Out of scope (v1)
Installment sale, GRAT, SLAT, state estate/inheritance tax, Table 2010CM / §7520 products, Monte
Carlo, DSUE, GST allocation, PDF/Excel export, multi-asset joint optimisation. Each is listed with
its reason in `spec.md` and surfaced in-app under "Deferred".

## Open questions
1. Scope: v1 gift-only as planned, or attempt the installment-sale freeze model as a stretch in
   the same session once v1 is green?
2. Mortality: proceed with the repo's `SSA_2021_LX` table provisionally (in-app "unverified"
   banner + deterministic death-year mode), halt until the builder supplies the SSA table, or use
   the original HTML's table (rejected on plausibility by the data audit)?
3. Golden fixtures A–H (plan.md): confirm now, or build the engine first and confirm before the
   golden tests are written?
4. Conventions bundle (return-neutral reinvestment, cash-like swap consideration, beneficiary
   NIIT on by default, §2035(b) window t ≤ 3, gift tax charged at t = 0, amend `src/CLAUDE.md`
   to drop the TCJA-toggle mandate): accept as recommended or amend?
