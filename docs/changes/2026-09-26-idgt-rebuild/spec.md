# Spec: IDGT calculator full rebuild (v1 — gift mechanism)
From: intent.md, model.md. Date: 2026-09-26. Status: draft.

## Requirements
R1. `simulate(inputs, s)` returns the per-year ledger of model.md §4–§7 for HOLD and GIFT[s];
    every symbol is present on every row; no React imports.
R2. `evaluateAsset(inputs)` returns NPV(none), the NPV(s) curve with feasibility reasons, s*,
    NPV(s*), NPV_PF, Eff, components for none and s*, warnings — the output shape of model.md §11.
R3. Level A and Level B components sum to ΔH_t within relative 1e-9 for every row of every fixture.
R4. Σ q_t = 1 within 1e-12 for every (age, sex) in the table; deterministic mode sets N = t_D.
R5. FedTax equals tentative-tax-minus-credit computed from the §2001(c) bracket table for 20
    random (TE, adjusted gifts, exclusion ≥ 1,000,000) triples.
R6. Golden fixtures A–H (plan.md) reproduce within 0.005 dollars / 1e-9 ratios.
R7. Every UI input reaches the engine and changes at least one displayed number (a test walks the
    input schema and asserts a non-zero delta for each field on a taxable-estate scenario).
R8. Validation rejects every out-of-range input in model.md §10.8 with a field-level message; the
    app never throws to the console on any input the UI accepts.
R9. Ranking table: rank is computed once from the rank key and stays fixed while the table sorts.
R10. Styling applies (built CSS contains the utilities) at phone width and desktop; no horizontal
     page scroll at 375 px.
R11. `npm run lint` → 0 problems; `npx vitest run` → all green; `npx vite build` → success.
R12. Methodology panel cites every authority in model.md §12; a Deferred panel lists every
     deferred feature with its reason; the mortality banner states the table's provisional status.
R13. No localStorage; scenario portability via JSON copy/paste and CSV download only.

## Design
Files (all under `src/`): `engine/idgtModel.js` (simulate, evaluateAsset, decompose),
`engine/fedTax.js` (base/FedTax + bracket cross-check helper), `engine/mortality.js`
(deathProbabilities, omega), `engine/swapSearch.js`, `engine/ranking.js`, `engine/validate.js`,
`engine/index.js` (re-exports only); `data/mortalityTable.js` (table + provenance only),
`data/exclusionAmounts.js` (BEA by year 2011–2026), `data/estateTaxRates.js` (§2001(c) schedule
only); `hooks/useIdgtModel.js` (inputs → validate → evaluate per asset → rank; debounced 200 ms);
components: `layout/AppShell`, `inputs/{GrantorPanel, EstatePanel, ModelSettingsPanel, AssetsPanel,
SwapProfilePanel}`, `results/{RankingTable, AssetDetail, SwapCurveChart, DecompositionChart,
LedgerTable, WarningsList}`, `panels/{MethodologyPanel, DeferredPanel}`, `ui/{NumberField,
PercentField, Toggle, Card, Tooltip}`; `App.jsx` composes. Charts are inline SVG (no chart lib).
Tailwind v4 via `@tailwindcss/vite` (peer dep `vite ^8` confirmed) replaces the template CSS.
Data flow: UI state (percent strings) → params builder in the hook → engine (decimals) → results
props. Components contain no arithmetic beyond formatting.

## Statutory and data basis (domain)
| Item | Value used | Source | Currency | Conf. |
|---|---|---|---|---|
| Basic exclusion 2026 | 15,000,000 | §2010(c)(3) as amended by OBBBA §70106 (P.L. 119-21, 2025-07-04); Rev. Proc. 2025-32 | 2026 | H |
| 2027+ exclusion | user π (default 2%) | indexing begins 2027; IRS has not announced 2027 as of 2026-09-26 | projection | M |
| BEA by year 2018–2025 | 11.18M, 11.40M, 11.58M, 11.70M, 12.06M, 12.92M, 13.61M, 13.99M | Rev. Procs. 2017-58 … 2024-40 | historical | H (2024–25 snippet-confirmed; earlier from memory, builder to confirm) |
| §2001(c) schedule | 18% … 40% over $1M; $345,800 on $1M | IRC §2001(c) | current | H |
| Top ordinary 37%, LTCG 20%, NIIT 3.8% | defaults | §1, §1(h), §1411; OBBBA made 37% permanent | 2026 | H |
| §2035(b) 3-year gross-up | modelled | IRC §2035(b) | current | H |
| Anti-clawback | modelled | Reg. §20.2010-1(c) (T.D. 9884) | current | H |
| No step-up in trust | modelled | Rev. Rul. 2023-2 | current | H |
| Swap tax-free | modelled | Rev. Rul. 85-13; Rev. Rul. 2008-22 | current | H |
| SSA 2021 period life table l_x | repo table, provisional | ssa.gov table4c6_2021_TR2024 — UNREACHABLE from sandbox | 2021 | UNVERIFIED (plausibility favours repo table over original HTML table) |
| Table 2010CM | not used in v1 | T.D. 9974, eff. 2023-06-01 | — | H (citation), values unobtainable |
| AFRs Sept 2026 | not used in v1 | Rev. Rul. 2026-17: 4.18 / 4.49 / 5.12; §7520 5.40% | Sept 2026 | M (snippets) |
| State estate tax | not used in v1 | repo table stale/wrong for ≥ 8 states, NE entry fabricated | — | deleted |

## Flagged concerns
| # | Severity | Concern | Evidence | Recommendation |
|---|---|---|---|---|
| M1 | High | SSA life table cannot be verified in-session; swap timing is sensitive to the tail | data audit: both candidate tables differ at every age; egress blocked | ship repo table behind an "unverified" banner + deterministic mode; builder swaps the data file after downloading `table4c6_2021_TR2024` (or the 2023 table) |
| M2 | High | Return-neutral convention is a modelling choice practitioners may not expect (many tools credit 100% of tax burn) | judge decisions; verifier upheld | adopt; explain in Methodology; Level B still shows a "tax burn" line that is exact |
| M3 | Med | `src/CLAUDE.md` mandates a TCJA-sunset toggle; the sunset never happened | OBBBA §70106 | propose amendment (plan.md); apply only if builder approves |
| M4 | Med | `src/CLAUDE.md` says `/src/data` holds no calculations, but `mortalityTable.js` has helpers | file read | move helpers to `engine/mortality.js` |
| M5 | Med | "Never stub" vs. installment/GRAT/SLAT/Monte Carlo/state code that computes wrong quantities | engine audit F05/F06/F10/F12/F16 | delete in v1; list under Deferred |
| M6 | Med | Golden values are model-derived (independently reproduced by a second agent) but not yet builder-confirmed | verification protocol Level B | no golden test written until confirmed |
| M7 | Low | `vitest@0.34.6` bundles Vite 5 inside a Vite 8 project | `npm ls` | works today; upgrade deferred |
| M8 | Low | Efficiency denominator when the exclusion is partially covered | edge verifier AF-4 | use U_g (continuous); show NPV/G separately |
| M9 | Low | Conventions C-1…C-9 in model.md §13 each move numbers | verifiers | listed for builder decision; defaults as recommended |
| M10 | Low | The sdlc-loop single-thread rule was overridden during planning by the session's ultracode setting (workflow of 15 agents) | this session | build itself is single-threaded |

## Open questions carried forward
Q1–Q4 from intent.md (scope, mortality, fixture confirmation, conventions) — unresolved until the
builder answers.
