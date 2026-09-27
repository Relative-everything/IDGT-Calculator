# IDGT Calculator — Claude Code Instructions

## Project Purpose
This is a professional-grade IDGT (Intentionally Defective Grantor Trust) asset optimization
calculator built in React/Vite, targeting UHNW estate planning advisors. Portfolio piece
benchmarked against Holistiplan and Tax Status. Future enterprise migration planned.

## Architecture Rules — NEVER VIOLATE

### Folder Responsibilities (Strict Separation)
- /src/engine/     → Pure calculation functions ONLY. No React imports. No UI logic.
                     Every function: inputs in, numbers out.
- /src/data/       → Static reference tables ONLY (SSA mortality, §2001 rates, exclusion amounts).
                     No calculations. No UI. Every table carries a source, a checked-on date and
                     a confidence/verification flag.
- /src/components/ → React UI ONLY. Components call engine functions through hooks.
                     Components contain ZERO calculation logic (formatting only).
- /src/hooks/      → State management ONLY. Wire components to engine (`useIdgtModel`,
                     `buildInputs`, `scenarioIO`).

### Absolute Prohibitions
- NEVER put calculation logic inside a component file
- NEVER put UI rendering inside an engine file
- NEVER use a single mega-component — decompose into focused pieces
- NEVER use localStorage (not supported in this environment)
- NEVER truncate or stub code — every function must be fully implemented; unbuilt features are
  listed in the in-app "Not modelled" panel, not left as dead code or "coming soon" tabs
- NEVER present a reference table as IRS/SSA data unless it was loaded from the published source

### Code Standards
- Every engine function must have an inline comment citing its IRC section,
  actuarial source, or mathematical derivation
- All calculation assumptions must be explicit constants with named variables,
  never magic numbers
- Input validation must reject values that would produce IRC non-compliant results
- Expected values in tests are hand-derived and builder-confirmed before they are asserted
  (see docs/changes/*/plan.md "Golden values"); sign/typeof checks are not verification

## Domain Knowledge
- This calculator evaluates assets for transfer to an IDGT. v1 models the outright gift with the
  §675(4)(C) swap; installment sale, GRAT, SLAT and state taxes are documented deferrals
- Primary output: ranked asset table by NPV per dollar of taxable gift value (exclusion-equivalent)
- Secondary outputs: optimal swap timing, exact NPV decomposition, per-death-year ledger
- Modelling convention: return-neutral heir-wealth ledger — HOLD vs GIFT[s] simulated per death
  year; no benefit is ever added to NPV, every component is derived from the ledger. Contract:
  docs/changes/2026-09-26-idgt-rebuild/model.md
- Key technical dependencies: IRC §§671–679 (grantor trust), §675(4)(C) (swap), §1014/§1015 and
  Rev. Rul. 2023-2 (basis), §2001(b)/(c) with flat 40% above the exclusion, §2010(c) as amended by
  OBBBA §70106 ($15,000,000 for 2026, indexed after), Reg. §20.2010-1(c) (anti-clawback), §2035(b),
  Rev. Rul. 85-13, SSA period life table (provisional until verified)
- Legislative scenarios are modelled by editing the basic exclusion amount (X_0) and its indexing
  rate (π). OBBBA fixed the 2026 exclusion at $15,000,000 with no sunset; there is no TCJA toggle
- ING comparison (docs/changes/2026-09-27-ing-comparison/model.md): a third world on the same ledger —
  incomplete gift, non-grantor trust paying its own tax and fee, included in the estate and stepped up.
  Exact four-way decomposition (location / state-rate saving / fee / step-up); breakevens re-run the full
  swap search and report readings from the signs, never an assumed direction
- Burn share φ (`burnShare`): the IDGT holding path splits into V^b (row key `V`) and V^s (`Vs`); φ = 1 must
  stay bit-identical to v1 (`ingInvariants.test.js` snapshot; regenerate only via
  `docs/changes/2026-09-27-ing-comparison/reference/make-v1-snapshot.mjs` if the v1 contract changes)

## Conflict Handling
If you encounter an irreconcilable trade-off between calculation accuracy and
implementation complexity, surface it explicitly with your recommended resolution.
Do not resolve silently.

## Things Claude gets wrong here
- Fabricating reference tables and presenting them as IRS data (a synthetic "Table 2000CM" factor
  grid shipped once). Load published values or mark the table UNVERIFIED.
- Presenting sign/typeof tests as verification of financial math.
- Writing a "reference" that transcribes the spec's formulas: it inherits the spec's errors (the ING liquidation bug
  passed such a reference). Verify against `evals/` — a clean-room oracle built from the statute and cash flows — and
  run `npm run eval` after any engine change; add a hand case and a control row for any new mechanism or field.
- Leaving UI inputs unwired to the engine. `src/hooks/__tests__/buildInputs.test.js` asserts every
  input moves an output; extend it when adding a field.
- Summing "benefit buckets" measured against different baselines (double counting). Use the ledger.
- Treating the ING's state-tax saving as a benefit without netting the estate tax on the extra wealth, or
  its "location" effect (tax paid from the trust instead of the estate) as a tax benefit. The ledger nets
  both; the location line is a return-differential effect, not tax.
- Assuming an ING bears 0% state tax. That holds only for intangibles in a no-tax situs; source income,
  grantor-domicile resident-trust states and the NY/CA grantor-level rules change it.

## Current commit
See docs/changes/2026-09-27-math-evals/handback.md (latest: eval suite and seven math/UI fixes),
docs/changes/2026-09-27-ing-comparison/handback.md (ING comparison),
docs/changes/2026-09-27-pages-branch-source/handback.md and docs/changes/2026-09-26-ci-deploy/handback.md
(deploy pipeline) and
docs/changes/2026-09-26-idgt-rebuild/handback.md (model and engine rebuild)

## NEXT SESSIONS ROADMAP
Follow docs/ROADMAP.md phase by phase (Phase 1: verify the SSA life table; Phase 2: installment
sale; Phase 3: GRAT — term-certain §7520 factor, no Table 2010CM needed; Phase 4: state tax with a
verified 2026 table; then SLAT/DSUE, sensitivity/exports, toolchain upgrade, UX polish). Each phase runs under the
sdlc-loop: plan accepted and golden values builder-confirmed before source edits.
