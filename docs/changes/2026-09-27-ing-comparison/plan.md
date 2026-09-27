# Plan: ING trust versus IDGT — comparison module
From: intent.md, spec.md, model.md. Date: 2026-09-27. Tier: Full.
Status: executed in an autonomous session on 2026-09-27 (see "Acceptance" — the builder did not see this
plan before source edits; every gate that needs the builder is recorded as open in handback.md).

## Acceptance
The roadmap's kickoff asks the session to stop for plan acceptance and for golden-value confirmation.
This session was started with a direct build request and ran without a builder in the loop, so:
- the model contract was reviewed by an adversarial workflow (five lenses, each finding verified by a
  skeptic) in place of the builder's acceptance — the confirmed corrections are listed under
  "Design-review corrections" below and were applied to model.md before any source edit;
- the new golden values (Fixtures I and J) are hand-derived below and machine-checked by an
  independent reference script; the golden test asserts them **annotated "reference-derived; awaiting
  builder confirmation"** (the same status v1's handback flag N4 gave nine of its values).
To accept after the fact: read "Golden values", confirm or correct each row, remove the annotation.

## Reads (Gate 0)
- `src/CLAUDE.md` — governance; `docs/ROADMAP.md` — ground rules and verification commands.
- `docs/changes/2026-09-26-idgt-rebuild/{model.md, plan.md, handback.md}` — v1 contract, fixture
  derivations and open flags (N1 mortality unverified; N4 reference-derived values precedent).
- `src/engine/idgtModel.js` (simulate/aggregate/evaluateAsset; V shared between HOLD and GIFT — the
  point the φ extension must split), `fedTax.js` (bases affine in TE — the property the ING
  decomposition relies on), `validate.js`, `constants.js`, `mortality.js`, `ranking.js`.
- `src/hooks/{buildInputs, useIdgtModel, scenarioIO}.js` and their tests — the wiring pattern and the
  per-field wiring test to extend.
- `src/components/results/{LedgerTable, DecompositionChart, SwapCurveChart, AssetDetail, RankingTable}.jsx`,
  `components/warnings.js`, `panels/*` — conventions for charts (inline SVG, container width hook,
  table view, hover), warning text composition, panel structure.
- `src/engine/__tests__/{fixtures, golden, invariants}.test.js` — fixture style and tolerances.
- Timing probe (this session): `evaluateAsset` 1.8 ms at age 65 (N = 46), 5.1 ms at age 45 (N = 66),
  0.7 ms at age 80; `simulate` 0.02–0.04 ms — sizes the breakeven grid (model.md §7).

## Files that change
new: `src/engine/ingModel.js`, `src/engine/breakeven.js`, `src/hooks/useIngBreakeven.js`,
`src/components/inputs/IngPanel.jsx`, `src/components/results/{IngComparison, BridgeChart,
CrossoverChart, BreakevenGrid}.jsx`, `src/engine/__tests__/{ingGolden, ingInvariants, breakeven}.test.js`,
`docs/changes/2026-09-27-ing-comparison/{intent, spec, model, plan, handback}.md`,
`docs/changes/2026-09-27-ing-comparison/reference/{ing-ref.mjs, ing-ref.out}`, screenshots.
modified: `src/engine/{idgtModel, validate, constants, index}.js`, `src/hooks/{buildInputs,
useIdgtModel, scenarioIO}.js`, `src/hooks/__tests__/{buildInputs, scenarioIO}.test.js`,
`src/components/results/{LedgerTable, RankingTable, AssetDetail}.jsx`, `src/components/warnings.js`,
`src/components/panels/{MethodologyPanel, DeferredPanel}.jsx`, `src/App.jsx`, `README.md`,
`src/CLAUDE.md`, `docs/ROADMAP.md`.
deleted: none.

## Order of work (one edit class per step; one commit per step)
1. Contract: model.md reviewed and corrected; intent.md, spec.md, this plan (golden section filled
   after step 2).
2. Reference: `reference/ing-ref.mjs` written from model.md by an agent that has not seen the engine
   change; Fixtures I and J derived and shown in plain English below.
3. Engine: φ in `idgtModel.js` (V^s path; v1 goldens bit-identical at φ = 1); `ingModel.js`;
   `breakeven.js`; `validate.js` rules and warnings; `constants.js`; `index.js` re-exports.
4. Tests: goldens (annotated), invariants, breakeven, wiring, JSON round-trip.
5. Hooks and UI: inputs mapping; `useIdgtModel` attaches `ing`; `useIngBreakeven`; input card;
   comparison card with tiles, bridge, crossover, grid; ledger ING view; ranking columns; warnings.
6. Panels and docs: Methodology, Deferred, README, `src/CLAUDE.md`, ROADMAP.
7. Verify: engine-vs-reference random cross-check; adversarial review workflow (engine vs model,
   UI/hooks, security, compliance; skeptics); `npx vitest run`; `npx eslint .`; `npx vite build`;
   Playwright 1280 px light/dark and 375 px with console capture.
8. handback.md; push `claude/ing-trust-idgt-comparison-rzas5s`. No PR.

## Design-review corrections
(filled in after the review workflow; each line: finding → change made to model.md)

## Golden values (Gate 2 — Level B; awaiting builder confirmation)
Derivation script and full per-year ledgers: `reference/ing-ref.mjs` and `reference/ing-ref.out`
(written from model.md before the engine change; NOT the code under test). Common inputs = v1 Fixture A
(FMV 1,000,000; basis 200,000; g 7%; y 2%; no sale; no discount; τ_ord 45.8% of which state 5%; τ_cg
28.8% of which state 5%; NIIT 3.8%; τ_bene 25%; τ_e 40%; d 4%; k 1; E_0 20,000,000; r_E 3%; X_0
15,000,000; π 2%; P 0; death at the end of year 3 with probability 1). ING: federal 37% ordinary, 20%
LTCG, NIIT 3.8%, state 0% → τ^n_ord 40.8%, τ^n_cg 23.8%; fee 0. Money tolerance 0.005; ratios 1e-9.
Confidence M (hand-derived from the contract; arithmetic machine-checked; independently reproduced by
the engine under test at build time). **Status: NOT yet confirmed by the builder** (autonomous session).

| Fixture | Scenario | Expected |
|---|---|---|
| I | ING; s n/a; death end of yr 3 | NPV^n +1,076.010384; ΔH^n_3 +1,210.365344; components locNet −795.089858 / ssNet +1,871.100242 / feeNet 0 / stepUp 0; NPV^n/FMV 0.001076010384 |
| I | year-3 ING ledger | V^n 1,266,161.503574; B^n 238,506.258582; E^n 21,854,540; TE^n 23,120,701.503574; ET^n 3,005,880.601429; H^n 20,114,820.902144; V^{same} 1,262,653.614737 (= v1 T^self); loc −1,490.613263; ss 3,507.888837 |
| I vs A | comparison | Δ_none = +116,162.304234; Δ_opt (s* = 3) = −103,835.872297 → verdict IDGT |
| J | IDGT φ = 0.5; s = none | NPV −121,047.460419; components freeze 93,399.242837 / burn 5,732.030901 / giftTax 0 / resid −398.113766 / stepUp −219,780.620391; Eff −0.121047460419 |
| J | year-3 ledger, s = none | V^s 1,278,773.002756; B^s 250,324.042408; E^s 21,839,164.852172; ET^s 2,893,265.940869; SU^s 247,223.307776; H^s 19,977,448.606283; ΔH_3 −136,161.930517; freeze_3 105,061.445895; burn_3 6,447.755208; resid_3 −447.823843 |
| J | s = 1 / 2 / 3 | NPV 63,757.925604 / 80,825.529573 / 98,733.159973; s* = 3 |
| φ = 0 check | IDGT φ = 0; s = none | burn component exactly 0 in every year; T_t = T^self_t exactly; NPV −126,959.538847 |
| I2 (machine) | ING with a sale in year 2 (g_r 3%, y_r 0) | NPV^n 27,001.861098 (ssNet 27,156.258250; locNet −154.397152) |
| J2 (machine) | IDGT φ = 0.5 with the same sale | NPV(none) 19,263.263580; NPV(1) 63,944.031426 |
| I3 (machine) | ING with a 0.5% fee | NPV^n −8,244.931766 (feeNet −9,320.942150) |
| I4 (machine) | ING, E_0 = 10,000,000 | ΔH^n_t = ΔTW^n_t every year; NPV^n 1,793.350639 |

Plain-English derivation, Fixture I (ING, death at the end of year 3):
Year 1: yield 2% × 1,000,000 = 20,000. The ING pays its own tax at 40.8%: 8,160 (the grantor would have
paid 45.8% = 9,160 — the 1,000 difference is the state tax saved). Trust value 1,000,000 × 1.07 +
20,000 − 8,160 = 1,081,840; basis 200,000 + 11,840 = 211,840. The other estate is untouched:
20,000,000 × 1.03 = 20,600,000 (in HOLD it is 20,590,840 after paying 9,160). Estate 20,600,000 +
1,081,840 = 21,681,840 versus HOLD's 21,680,840: the family is 1,000 richer (the state tax), all of it
in the taxable estate, so estate tax is 400 higher (2,672,736 vs 2,672,336) and heirs net +600. The
trust is stepped up (§1014(b)(9)), so no capital-gains cost. Attribution: location 0 in year 1 (the
same 9,160 paid from either pool has not compounded yet), state saving 1,000 → net 600.
Year 2: yield 21,636.80; tax 8,827.8144; value 1,170,377.7856; basis 224,648.9856; other estate
21,218,000. HOLD: value 1,188,100, other estate 21,198,580.80. Family wealth difference 1,696.9856 =
location −465.6944 (the year-1 tax of 9,160 would have grown 3% in the estate but 9% in the trust:
9,160 × (1.09 − 1.03) = −549.60, plus the yield-base effect) + state saving 2,162.68 (1,000 × 1.09 +
0.05 × 21,636.80 = 1,090 + 1,081.84 − 9.16 … exact figure from the ledger). Exclusion 15,300,000;
estate tax 2,835,351.11424 vs 2,834,672.32; heirs +1,018.19136 = 0.6 × 1,696.9856.
Year 3: yield 23,407.555712; tax 9,550.282730; value 1,266,161.503574; basis 238,506.258582; other
estate 21,854,540; a trust paying the grantor's own 45.8% would hold 1,262,653.614737 (v1's T^self),
so the state saving is 3,507.888837 and the location effect (21,854,540 − 21,823,655.228) +
(1,262,653.614737 − 1,295,029) = −1,490.613263. Family wealth +2,017.275574; exclusion 15,606,000;
estate tax 3,005,880.601429 vs 3,005,073.6912 (+806.910229); heirs +1,210.365344 = 0.6 ×
2,017.275574. Discounted three years at 4% (÷ 1.124864): +1,076.010384 = −795.089858 (location) +
1,871.100242 (state saving). Against Fixture A: the IDGT without a swap loses 115,086.29 (mostly the
lost step-up), so the ING is 116,162.30 better; with the deathbed swap the IDGT gains 104,911.88, so
the IDGT is 103,835.87 better — verdict IDGT.

Plain-English derivation, Fixture J (IDGT, grantor bears half the burn, no swap):
Year 1: yield 20,000; tax 9,160; the trustee reimburses half, 4,580, from the trust: trust value
1,070,000 + 20,000 − 4,580 = 1,085,420; basis 215,420; the other estate pays only 4,580:
20,600,000 − 4,580 = 20,595,420. HOLD unchanged from Fixture A. Death: taxable base 20,595,420 +
1,000,000 − 15,000,000 = 6,595,420 → estate tax 2,638,168; built-in gain 870,000 → heirs' tax
209,134.615385; heirs 18,833,537.384615 vs 19,008,504 → −174,966.615385 (Fixture A: −173,134.615385;
the 1,832 difference is 40% of the 4,580 the estate no longer burned). Attribution: freeze 32,336
(unchanged); burn 1,832 (half of A's 3,664); residual 0 (family wealth is identical in year 1); step-up
−209,134.615385.
Year 3 (after year 2: value 1,178,136.5764, basis 232,157.1764, estate 21,208,311.3764): yield
23,562.731528; burn 10,791.731040, half from each pool; value 1,278,773.002756; basis 250,324.042408;
estate 21,839,164.852172; base 7,233,164.852172 → tax 2,893,265.940869; gain 1,028,448.960348 → heirs'
tax 247,223.307776; heirs 19,977,448.606283 vs 20,113,610.5368 → −136,161.930517. Attribution:
freeze 105,061.445895 (T^self 1,262,653.614737 − 1,000,000, × 40%); burn 6,447.755208 (40% of the
gross compounding the grantor still funded: 1,278,773.002756 − 1,262,653.614737); residual
−447.823843 (family wealth is 746.373072 lower because the reimbursed tax left the 9%-growth trust
rather than the 3%-growth estate, offset by 40% of it in estate tax); step-up −247,223.307776.
Discounted: NPV −121,047.460419 = 93,399.242837 + 5,732.030901 − 398.113766 − 219,780.620391.
With the trust paying all of its tax (φ = 0) the burn line is exactly zero and the trust value equals
v1's T^self in every year (checked: max |T − T^self| = 0).

## Risks
- **Golden values not builder-confirmed** — mitigated by an independent reference derivation and the
  annotation; listed as the first open flag in handback.md.
- **Riskiest step: 3 (engine)** — splitting the shared V path in `simulate` touches every downstream
  symbol (consideration, inclusion, step-up, Level A/B); mitigated by the bit-identity test at φ = 1
  against the v1 fixtures and the φ = 0 zero-burn identity.
- **Breakeven solvers on non-monotone f** — the solver reports only a bracketed root or the sign
  pattern; a coarse scan reports multiple crossings when present (model.md §6 after review).
- **Performance** — grid and breakevens for the selected asset only, deferred; measured.
- **Tax-law citations from memory** (PLR numbers, NY/CA statute sections) — labelled M in spec.md and
  the Methodology panel; verify before client use.

## Rejected options
- Comparing the ING against the deathbed-swap bound NPV_PF — an upper bound, not a plan; the fixed
  optimal swap year is the fair benchmark (no-swap also shown).
- Modelling "burn management" as toggling grantor status off in year τ — the expert alternative, but
  it needs a second tax regime mid-ledger and a τ search; deferred with its reasoning (model.md §12).
- A state-by-state fiduciary-tax table — cannot be sourced from the sandbox (roadmap ground rule);
  the ING's state rate is an input with NY/CA named in the tooltip.
- Fixing s* during the bisections for speed — measured unnecessary (≤ 5 ms per full evaluation).
- A separate `ing` UI state section — the five fields live in `settings` so scenarioIO, import
  coercion and the shared-error path need no new section kind.
- Ranking assets by the better of ING and IDGT — the ranking allocates exclusion; the ING consumes
  none, so its efficiency is undefined; shown as a column and a badge instead.

## Proof
- `npx vitest run` → all green including `ingGolden.test.js`, `ingInvariants.test.js`,
  `breakeven.test.js`, extended wiring and scenario tests; v1 golden and invariant files untouched
  and green.
- `npx eslint .` → 0 problems. `npx vite build` → ✓ built.
- Screenshots at 1280 px (light, dark) and 375 px with 0 console errors and no horizontal scroll.
- Reference cross-check: random scenarios × (ING ledger, IDGT with random φ) compared between
  `src/engine` and `reference/ing-ref.mjs`; worst relative difference reported in handback.md.

## Deferred (surfaced in-app)
See model.md §12.
