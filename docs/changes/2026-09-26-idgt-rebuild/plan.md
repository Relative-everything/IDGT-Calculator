# Plan: IDGT calculator full rebuild (v1 — gift mechanism)
From: spec.md + model.md. Date: 2026-09-26. Tier: Full.
Status: implemented 2026-09-26 (accepted by builder the same day; scope: v1 gift-only; mortality: repo table provisional + banner; fixtures A–H confirmed; conventions C-1…C-9 and the CLAUDE.md amendment accepted).

## Reads (Gate 0)
- `src/CLAUDE.md` — governance: engine pure / data static / components no math / no localStorage / no stubs / cite IRC; TCJA-toggle mandate (stale post-OBBBA); commit ref stale (7168bd8 vs HEAD 8aa4f19).
- `src/engine/index.js` (818 lines) — 10 exported functions; gift model taxes income at the estate rate, no exemption reduction for the gift, 11 params never destructured; installment NPV = PV(note) − basis; synthetic 2000CM factors; GRAT/Monte Carlo/gift-vs-death unwired or broken.
- `src/data/mortalityTable.js` — `SSA_2021_LX` (0–119, monotone, male ω=111, female ω=113) + helpers (calculation in /data) + fabricated `IRS_2000CM_ANNUITY_FACTORS` (= 26 − 0.21·age).
- `src/data/estateTaxRates.js` — correct §2001(c) schedule; wrong usage (brackets applied above the exemption); stale constants 13,990,000 / 7,000,000.
- `src/data/afrRates.js`, `src/data/stateEstateTax.js` — stale/incorrect (OR "repealed", NE fabricated); unreferenced after rebuild.
- `src/App.jsx`, `src/components/**` — GrantorInputPanel imported but never rendered; Tailwind classes with no Tailwind; two columns read fields nothing sets; percent/decimal mismatch.
- `src/engine/__tests__/engine.test.js` — 7 tests, sign/typeof checks; the one numeric assert (0.361) enshrines the wrong bracket usage.
- `package.json`, `vite.config.js`, `index.html`, `src/index.css`, `eslint.config.js` — Vite 8 / React 19 / vitest 0.34.6; base `/IDGT-Calculator/`; template CSS.
- Original single-file build (user-pasted, saved to scratchpad) — additive three-bucket NPV; e² term; income never retained; tail mass dropped; different life table (male l_65 = 74,759 vs repo 77,402).
- No prior `docs/changes/*/handback.md` exists.
- Existing tests/validators/goldens for the area: none with sourced expected values.

## Files that change
new: `src/engine/idgtModel.js`, `src/engine/fedTax.js`, `src/engine/mortality.js`, `src/engine/swapSearch.js`, `src/engine/ranking.js`, `src/engine/validate.js`, `src/engine/constants.js`, `src/data/exclusionAmounts.js`, `src/hooks/useIdgtModel.js`, `src/components/inputs/{GrantorPanel,EstatePanel,ModelSettingsPanel,AssetsPanel,SwapProfilePanel}.jsx`, `src/components/results/{RankingTable,AssetDetail,SwapCurveChart,DecompositionChart,LedgerTable,WarningsList}.jsx`, `src/components/panels/{MethodologyPanel,DeferredPanel}.jsx`, `src/components/ui/{NumberField,PercentField,Toggle,Card,Tooltip}.jsx`, `src/engine/__tests__/{fedTax,mortality,invariants,golden,inputWiring}.test.js`, `docs/changes/2026-09-26-idgt-rebuild/{handback.md,screenshots/*}`.
modified: `src/engine/index.js` (re-exports only), `src/data/mortalityTable.js` (table + provenance only), `src/data/estateTaxRates.js` (schedule only), `src/data/README.md`, `src/App.jsx`, `src/components/layout/AppShell.jsx`, `src/index.css`, `src/main.jsx` (if needed), `index.html`, `package.json` + lockfile (add `tailwindcss`, `@tailwindcss/vite`), `vite.config.js`, `eslint.config.js` (flag unused capitalised imports), `README.md`, `src/CLAUDE.md` (only if the builder approves the amendment below).
deleted: `src/data/afrRates.js`, `src/data/stateEstateTax.js`, `src/components/inputs/{GrantorInputPanel,AssetInputPanel,EconomicAssumptionsPanel,GiftDeathComparisonPanel}.jsx`, `src/components/results/{ResultsTable,ProjectionsTable}.jsx`, `src/engine/__tests__/engine.test.js`, `src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`, `scripts/*`.

## Order of work (one edit class per step; one commit per step)
1. Data layer: add `exclusionAmounts.js` (BEA by year, sourced); strip `mortalityTable.js` to table + provenance banner (helpers move to engine); strip `estateTaxRates.js` to the §2001(c) schedule; delete AFR/state files; update `data/README.md`.
2. Engine: `mortality.js` (q_t, ω, deterministic mode), `fedTax.js` (base/FedTax + bracket cross-check), `idgtModel.js` (simulate, death valuation, Level A/B decomposition), `swapSearch.js`, `ranking.js`, `validate.js`, `constants.js`; `index.js` re-exports; delete legacy tests and `scripts/`.
3. Tests: `fedTax.test.js` (bracket cross-check goldens), `mortality.test.js` (Σq = 1, deterministic), `invariants.test.js` (decomposition sums, neutrality, NPV(s*) ≥ NPV(none), ΔH_t(s) = ΔH_t(none) for t < s, sale-after-swap symmetry), `golden.test.js` (Fixtures A–H — written only after Gate 2 confirmation).
4. Toolchain/styling: install Tailwind v4 + plugin; `index.css` = `@import "tailwindcss"` + tokens (light/dark); delete template CSS/assets; `index.html` title; eslint tweak.
5. Hook + input panels: `useIdgtModel.js` (params builder, validation, per-asset evaluate, rank, 200 ms debounce), five input panels, `ui/*`, `AppShell`, `App.jsx` layout.
6. Results: ranking table (fixed rank, sortable columns), asset detail (swap curve, decomposition, ledger, warnings) — inline SVG charts, dataviz guidance loaded first.
7. Methodology + Deferred panels, README, mortality banner, JSON copy/paste + CSV download; `src/CLAUDE.md` amendment if approved.
8. Verify: `npx vitest run`, `npx eslint .`, `npx vite build`, Playwright screenshots at 1280 px and 375 px saved to `docs/changes/…/screenshots/`.
9. Self-review (Bugs / Security / Compliance) → `handback.md` → push `claude/admiring-carson-qxka1z`. No PR.

## Golden values (Gate 2 — Level B: builder confirmation required before `golden.test.js` is written)
Derivation script and full per-year ledgers: `reference/fixtures-ref.mjs` and `reference/fixtures-ref.out`
(scratchpad reference, NOT the code under test; independently re-derived by a second agent from the
spec text with 0 disagreements over 271 numbers before corrections; corrections re-run here).
Common inputs unless stated: FMV 1,000,000; basis 200,000; g 7%; y 2%; no sale; no discount;
τ_ord 45.8%; τ_cg 28.8%; τ_bene 25% (Fixture G uses 28.8%); τ_e 40%; d 4%; k 1; E_0 20,000,000;
r_E 3%; X_0 15,000,000; π 2% (X_1 = 15,000,000, X_2 = 15,300,000, X_3 = 15,606,000); P 0;
swap consideration = cash-like default (basis 100%, growth 0, gross yield 3%/(1−0.458) = 5.5350553…%
taxed at 45.8%). Money tolerance 0.005; ratios 1e-9. Confidence M (hand-derived from primary-source
rules; arithmetic machine-checked). Status: **confirmed by builder on 2026-09-26** (all rows; the mortality row remains characterization).

| Fixture | Scenario | Expected |
|---|---|---|
| A | death end of yr 3 certain; s = none | NPV −115,086.293851; ΔH_3 −129,456.428846; components freeze 93,399.242837 / burn 11,512.639844 / stepUp −219,998.176532; Eff −0.115086293851 |
| A | s = 1 / 2 / 3 | NPV 76,099.376264 / 90,272.954818 / 104,911.882681; s* = 3; Eff(s*) 0.104911882681 |
| B | 2-yr synthetic table l = [1000, 700, 0] (q = 0.3, 0.7) | NPV(none) −148,468.170374; NPV(1) 49,301.949824; NPV(2) −1,248.150888; s* = 1; comps(none) freeze 52,874.502189 / burn 6,204.639822 / stepUp −207,547.312386 |
| C | E_0 = 10,000,000 (below exclusion); death yr 3 | NPV(none) −219,998.176532 (only stepUp non-zero); NPV(3) = 0 |
| D | δ = 30%; death yr 3; s = none | U_g 700,000; NPV −8,406.730810; freeze 200,078.805878; Eff −0.012009615443 |
| E | P = X_P = 15,000,000 (exhausted); death yr 3 | G 400,000; B^T_0 520,000; NPV −66,486.110253; giftTax comp −19,784.151684; stepUp −151,613.841249; NPV/G −0.166215275631 |
| E2 | as E, death yr 4 (outside §2035(b)) | NPV 87,338.955157; giftTax comp 111,020.160933; NPV/G 0.218347387892 |
| F | P = 13,990,000 made 2025 (X_P 13,990,000); FMV 2,000,000; basis 400,000; death yr 3 | R 1,010,000; U_c 1,010,000; G 396,000; B^T_0 716,800; NPV −182,058.405939; Eff −0.091029202970 |
| G | as A with τ_bene 28.8% | NPV(none) −148,526.016684; NPV(3) 104,911.882681 |
| H | sale in trust S = 2 (g_r 3%, y_r 0); death yr 3 | NPV(none) 71,945.738466 (freeze −27,473.069692 / burn 107,035.754603 / stepUp −7,616.946445); NPV(1) 76,099.376264; s = 2 infeasible ("post-sale swap not modelled"); s* = 1 |
| FedTax | tentative tax on 1,000,000 / 15,000,000; estate 16,390,000 vs exclusion 15,000,000 | 345,800 (H, §2001(c)) / 5,945,800 (by inspection) / 556,000 (by inspection) |
| Mortality | repo table, male 65: q_1 | 0.017893… — **characterization, not correctness** (table unverified) |

Plain-English derivation, Fixture A, s = none (death at end of year 3, probability 1):
Year 1: yield 2% × 1,000,000 = 20,000; value 1,000,000 × 1.07 + 20,000 = 1,090,000; income tax
45.8% × 20,000 = 9,160 paid from the other estate: 20,000,000 × 1.03 − 9,160 = 20,590,840; basis
220,000. Year 2: yield 21,800; value 1,188,100; tax 9,984.40; other estate 21,198,580.80; basis
241,800. Year 3: yield 23,762; value 1,295,029; tax 10,882.996; other estate 21,823,655.228; basis
265,562. Exclusion in the third calendar year (2028) = 15,000,000 × 1.02² = 15,606,000.
HOLD: taxable estate 21,823,655.228 + 1,295,029 = 23,118,684.228; tax 40% × (23,118,684.228 −
15,606,000) = 3,005,073.6912; §1014 step-up so heirs owe no CGT; heirs receive 20,113,610.5368.
GIFT: estate 21,823,655.228 plus adjusted taxable gift 1,000,000 in the base: tax 40% ×
(22,823,655.228 − 15,606,000) = 2,887,062.0912; trust holds 1,295,029 with carryover basis
265,562 → gain 1,029,467 → heirs' CGT 25% = 257,366.75 paid a year later, worth 247,468.028846
at death; heirs receive 21,823,655.228 + 1,295,029 − 2,887,062.0912 − 247,468.028846 =
19,984,154.107954. Difference −129,456.428846 (= estate tax saved 40% × (1,295,029 − 1,000,000)
= 118,011.60, minus lost step-up 247,468.03). Discounted three years at 4%: ÷ 1.124864 =
−115,086.293851. Decomposition: a trust paying its own tax would hold 1,000,000 × 1.08084³ =
1,262,653.614737 (rate 1 + 0.07 + 0.02 × (1 − 0.458)); freeze = 40% × (1,262,653.61 − 1,000,000)
= 105,061.445895; burn = 40% × (1,295,029 − 1,262,653.61) = 12,950.154105; step-up −247,468.03;
sum −129,456.43 ✓ (each × 0.888996359 gives the component NPVs in the table).
Deathbed swap (s = 3): grantor pays 1,295,029 cash from the other estate for the asset; the asset
is stepped up; the trust holds cash 1,295,029 (basis equal); estate tax unchanged at 2,887,062.09
(same total base); heirs 20,528,626.228 + 1,295,029 + 1,295,029 − 2,887,062.0912 =
20,231,622.1368; ΔH = +118,011.60 → NPV 104,911.882681.

## Risks
- **Mortality table unverified** (flag M1): ranks and s* shift with the tail. Mitigation: banner,
  deterministic mode, single data file, checksum test slot to fill when the builder supplies the SSA table.
- **Modelling conventions** (model.md §13) are defensible but not universal; a reader expecting
  "100% of tax burn" will see smaller NPVs. Mitigation: Methodology panel with the ledger visible.
- **Riskiest step: 2 (engine)** — the swap/sale/§2035(b)/anti-clawback interactions. Mitigation:
  invariants tests + fixtures A–H cover each interaction; edge-case probes from the audit re-run.
- **UI rebuild scale** (steps 5–6): largest diff; mitigated by the hook boundary (components never
  compute) and screenshot verification.
- Toolchain: Tailwind v4 on Vite 8 (peer dep satisfied); vitest 0.34.6 embeds Vite 5 (works today).
- Irreversible: deletion of the installment/GRAT/Monte Carlo/state code (recoverable from git history).

## Rejected options
- Patch the existing engine function by function — every function computes the wrong quantity; patching would keep the additive-bucket structure that double counts.
- Keep the original's additive PV buckets with fixes — cannot be made double-count-free; the heir-wealth ledger is the only form in which components are derived rather than summed.
- Include installment sale / GRAT / SLAT / state tax / Monte Carlo in v1 — AFR and state figures are M/unverified; §7520 factors need Table 2010CM values unobtainable here; each would ship unverifiable numbers.
- Use Table 2010CM for grantor mortality — values unobtainable in-session; population table is the standard for a personal projection anyway.
- Truncate NPV at "max projection years" — drops up to 49% of death probability; display-only truncation instead.
- Hand-written CSS instead of Tailwind — components already use the utility idiom; v4 plugin supports Vite 8; less code.
- A chart library (recharts) — inline SVG is sufficient for three charts and adds no dependency.
- Per-asset "exemption exhausted" checkbox — replaced by grantor-level prior gifts + year (the post-OBBBA common case: 2025 exhaustion still leaves $1,010,000 of 2026 exclusion).

## Proof
- `npx vitest run` → all files green including `golden.test.js` (Fixtures A–H within tolerance) and `invariants.test.js`.
- `npx eslint .` → `0 problems`. `npx vite build` → `✓ built`, CSS bundle > 10 kB containing utility rules.
- `docs/changes/2026-09-26-idgt-rebuild/screenshots/desktop.png` and `mobile-375.png` showing the ranked table, swap curve and ledger at defaults with no console errors (Playwright log attached in handback).
- `inputWiring.test.js` proves every schema field moves at least one output.

## Proposed `src/CLAUDE.md` amendment (apply only on approval)
- Replace "TCJA sunset (projected 2026) … must be a one-click toggle" with: "Legislative scenarios are modelled by editing the basic exclusion amount (X_0) and its indexing rate (π). OBBBA §70106 (P.L. 119-21) fixed the 2026 exclusion at $15,000,000, indexed thereafter; there is no sunset toggle."
- Add under Domain Knowledge: "Modelling convention: return-neutral heir-wealth ledger (see docs/changes/2026-09-26-idgt-rebuild/model.md). No benefit is ever added to NPV; components are derived from the ledger."
- Update "Current commit" to the handback commit; note `/src/hooks/` now exists.
- Add "Things Claude gets wrong here": fabricated reference tables presented as IRS data (the 2000CM ramp); sign/typeof tests presented as verification; unwired inputs left in the UI.

## Deferred to v2 (surfaced in-app under "Deferred")
Installment sale (freeze model: note at AFR, no grantor interest income per Rev. Rul. 85-13, note balance in estate, §7872 term validation) · GRAT (§2702, §7520 term-certain factor, §2036 inclusion by P(death in term)) · SLAT (spousal access, split gifts, joint-life mortality) · state estate/inheritance tax (verified 2026 table, NY cliff and 3-year add-back, CT gift tax, §2058) · Table 2010CM import · UHNW mortality adjustment (needs SOA source) · Monte Carlo · promissory-note swap consideration · DSUE · GST exemption tracking · multi-asset joint optimisation · post-death non-grantor trust taxation · PDF/Excel export · sensitivity tables · SSA table verification (blocked network) · vitest upgrade.

## Departures from plan
- 2026-09-26: steps 1 (data layer) and 2 (engine) are committed together — stripping the helpers from `mortalityTable.js` and deleting the AFR/state tables breaks the legacy engine's imports, so a separate step-1 commit would not build. Files touched are exactly those named for steps 1–2. Commits between the engine and the UI step do not `vite build` (App.jsx imported the removed legacy functions until the UI commit); engine tests and lint were green at each.
- Step 3: the golden test for Fixture C asserted `s* = 3` in its first draft; plan.md's Fixture C row specifies only NPV(none) and NPV(3) = 0. Under the accepted cash-like consideration every swap year in a non-taxable estate has NPV 0, so the tie rule (model.md §8) selects s* = 1. The assertion was corrected to encode that reasoning — no confirmed golden value moved.
- Steps 5–6 (committed together as one UI commit): file names differ from the plan's list — `ui/InfoTip.jsx` (for "Tooltip"), `ui/SelectField.jsx` and `ui/Button.jsx` added, `ui/PercentField.jsx` not needed (NumberField takes a suffix); `results/useContainerWidth.js` (ResizeObserver hook for the SVG charts) and `components/format.js` (formatting only) added; `hooks/scenarioIO.js` holds the JSON/CSV helpers named in step 7; the input-wiring test lives at `hooks/__tests__/buildInputs.test.js` (it tests the UI→engine mapping) instead of `engine/__tests__/inputWiring.test.js`. No behaviour beyond the plan's description was added.
- Step 7: `src/CLAUDE.md` amended as approved. Step 8: screenshots also include element captures of both charts and a hover state.
- `src/engine/swapSearch.js` was not created: the search is a 15-line loop inside `evaluateAsset` (`idgtModel.js`). `src/hooks/buildInputs.js` and `src/engine/__tests__/fixtures.js` were added unnamed (the params builder and the shared fixture inputs). The "200 ms debounce" became React's `useDeferredValue` (one per state part). Steps 3 and 4's `package.json` change landed in the engine commit; steps 4 and 7 files landed in the UI commit.
- Step 9 (self-review): run as an adversarial review workflow (4 lenses + 4 skeptics) in addition to the three passes; fixes touched `src/components/warnings.js` and `src/components/ui/ErrorBoundary.jsx` (new, unnamed) and added `eslint-plugin-react` as a dev dependency so the planned eslint tweak could be made (core `no-unused-vars` cannot see JSX usage). `docs/changes/…/reference/fixtures-ref.mjs` gained the `max(0, ·)` floor on U_g that the engine already applied (output unchanged).
