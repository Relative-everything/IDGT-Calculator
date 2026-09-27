# Spec: ING trust versus IDGT — comparison module
From: intent.md, model.md. Date: 2026-09-27. Status: draft (see plan.md "Acceptance").

## Requirements
R1. `simulate(inp, s, N)` accepts `burnShare` φ ∈ [0, 1] (default 1) and implements model.md §2; with
    φ = 1 every v1 golden fixture (A–H) and every v1 invariant reproduces exactly (bit-identical rows).
R2. With φ = 0 and no swap the Level B burn component is exactly zero in every year; with any φ the
    Level A and Level B identities hold to relative 1e-9 for every row and swap year.
R3. `simulateIng(inp, N)` / `evaluateIng(inp, idgt)` implement model.md §3–§5 and return the output
    shape of §9; the four net components sum to ΔH^n_t (relative 1e-9) and their NPVs sum to NPV^n.
R4. `solveRoot` (model.md §6) never returns a value without a bracketed sign change; the three
    breakevens return either a root at which |f| is within tolerance or a `reason`; a test proves the
    verdict flips across each returned root.
R5. `comparisonGrid` (model.md §7) returns Δ_opt for every cell; the cell at the input's own state rate
    and φ equals the headline Δ_opt when the input lies on the lattice.
R6. Golden Fixture I (ING; model.md §3 on the v1 Fixture A base with the grantor's state rate 5% on both
    stacks, ING state rate 0, fee 0, death end of year 3) and Fixture J (IDGT with φ = 0.5, same base)
    are hand-derived in plan.md, machine-checked by `reference/ing-ref.mjs`, and asserted in
    `ingGolden.test.js` (tolerance 0.005 money / 1e-9 ratio) with the annotation "reference-derived;
    awaiting builder confirmation".
R7. Every new UI field (burnShare, ingFedOrd, ingFedLtcg, ingStateRate, ingAdminRate) reaches the engine
    and moves at least one output; `buildInputs.test.js` gains a case per field. The existing
    `stateOrd`/`stateLtcg` fields are passed to the engine additionally as `stateOrd`/`stateCg`.
R8. Validation rejects every out-of-range value of model.md §8 with a field-level message; the three
    warnings are emitted with `{code, data}` and the text lives in `src/components/warnings.js`.
R9. UI: an "ING trust vs IDGT" input card; the ranking table gains "NPV · ING" and a structure badge; an
    ING comparison card under the asset detail with tiles, a bridge chart, a crossover chart, the
    breakeven grid (diverging colour scale, frontier drawn, keyboard-reachable cells, table view), and a
    third ledger view "ING"; the Methodology panel gains an ING section citing model.md §10; the
    Deferred panel lists model.md §12. Components contain no arithmetic beyond formatting/geometry.
R10. Scenario JSON round-trips the new settings (version unchanged; missing fields take defaults); the
     ranking CSV gains the ING columns.
R11. `npx vitest run` green; `npx eslint .` 0 problems; `npx vite build` succeeds; Playwright at 1280 px
     (light and dark) and 375 px: 0 console errors, no horizontal page scroll.
R12. Performance: for the selected asset the breakevens plus the grid complete within about 0.5 s at
     age 45 (N = 66) on the build machine; they run only for the selected asset and are deferred.

## Design
Files (all under `src/`): `engine/ingModel.js` (simulateIng, evaluateIng, ING decomposition),
`engine/breakeven.js` (solveRoot, breakevens, comparisonGrid, withStateRate / withBurnShare /
withOtherEstate input transforms), `engine/idgtModel.js` (φ; V^s path), `engine/validate.js` (new
rules and warnings), `engine/index.js` (re-exports), `engine/constants.js` (breakeven lattices and
tolerances), `hooks/buildInputs.js` (new fields), `hooks/useIdgtModel.js` (attach `ing` per asset),
`hooks/useIngBreakeven.js` (selected asset: breakevens + grid, deferred), `hooks/scenarioIO.js`
(fields, CSV columns), `components/inputs/IngPanel.jsx`, `components/results/IngComparison.jsx`,
`components/results/BridgeChart.jsx`, `components/results/CrossoverChart.jsx`,
`components/results/BreakevenGrid.jsx`, `components/results/LedgerTable.jsx` (ING view),
`components/results/RankingTable.jsx` (columns), `components/panels/{MethodologyPanel,DeferredPanel}.jsx`,
`components/warnings.js`, `App.jsx`. Tests: `engine/__tests__/ingGolden.test.js`,
`engine/__tests__/ingInvariants.test.js`, `engine/__tests__/breakeven.test.js`, extended
`hooks/__tests__/{buildInputs,scenarioIO}.test.js`. Docs: this folder plus README, `src/CLAUDE.md`,
`docs/ROADMAP.md`.

## Statutory and data basis (domain)
| Item | Value used | Source | Conf. |
|---|---|---|---|
| ING incomplete gift | retained testamentary LPOA + consent power | Reg. §25.2511-2(b), (e) | H |
| ING estate inclusion | full trust value at death | §2036(a)(2), §2038(a)(1) | H |
| ING step-up | basis = included value | §1014(b)(9) | H |
| Non-grantor status | adverse-party committee | §672(a); §§674, 675, 677; PLRs 201310002–006, 201410001–010 (no precedent, §6110(k)(3)) | M-H (PLR numbers from memory) |
| Trust income tax | flat top federal rate + NIIT | §1(e), §1(h), §1411(a)(2); compressed brackets ignored | H (rule) / M (threshold figure) |
| Home-state override | NY, CA tax INGs as grantor trusts | N.Y. Tax Law §612(b)(41); Cal. R&TC §17082 (SB 131) | H (existence) / M (citations) |
| Reimbursement | discretionary, no inclusion; mandatory or by understanding → §2036(a)(1) | Rev. Rul. 2004-64 | H |
| Trust admin cost deductibility | not modelled | §67(e); Reg. §1.67-4 | H |

## Flagged concerns
| # | Severity | Concern | Recommendation |
|---|---|---|---|
| S1 | High | Golden values cannot be builder-confirmed in an autonomous session | assert with the "reference-derived; awaiting builder confirmation" annotation (v1 precedent, flag N4); list in handback |
| S2 | Med | The φ lever is one reading of "tax burn management"; the toggle-off alternative may be what an expert reaches for first | implement φ; name the toggle-off (completed-gift non-grantor trust) as deferred with reasoning; state in the handback |
| S3 | Med | Flat trust rate overstates the ING's federal tax by up to ~$2,000/yr (M) | document; immaterial at UHNW income levels |
| S4 | Low | PLR numbers and state statute citations from memory | labelled M; verify before client use |
| S5 | Low | Breakeven grid costs ≤ 48 full evaluations per selected asset | deferred value + selected asset only; measured |
