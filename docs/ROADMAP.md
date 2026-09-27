# IDGT Asset Analyzer — execution roadmap (v2 and beyond)

Written 2026-09-26 for a **fresh Claude Code session that has not seen the conversation that built v1**.
Each phase below is sized for one session and is written so that session can go from Gate 0 to a
committed handback without asking what the project is. Run phases in order unless a prerequisite
says otherwise; Phase 0 and Phase 1 first.

## How to run a phase (paste as the session's first message)

```
Read docs/ROADMAP.md, docs/changes/2026-09-26-idgt-rebuild/model.md and
docs/changes/2026-09-26-idgt-rebuild/handback.md, then execute Phase <N> of the roadmap under the
sdlc-loop skill: Gate 0 named reads; create docs/changes/<YYYY-MM-DD>-<slug>/; write plan.md (Full
tier also intent.md and spec.md) and STOP for my acceptance before editing any source file. Golden
values must be hand-derived, shown to me in plain English, and confirmed by me before a test asserts
them. Work on branch <branch-name>; commit per step; push; write handback.md; do not open a PR.
```

## Ground rules every phase inherits
- Governance: `src/CLAUDE.md` (engine pure and cited; `/src/data` static with provenance; components
  format only; hooks wire state; no localStorage; no stubs; no fabricated reference data).
- Model contract: `docs/changes/2026-09-26-idgt-rebuild/model.md`. Extensions are written as new
  sections of a `model.md` in the phase's change folder, in the same notation, before code.
- Verification commands: `npm ci` · `npx vitest run` · `npx eslint .` · `npx vite build` · Playwright
  screenshots at 1280 px (light + dark) and 375 px with console-error capture (driver: install
  `playwright` in a scratch folder; launch Chromium with `executablePath: '/opt/pw-browsers/chromium'`
  if the default launch fails; serve with `npx vite preview --port 4173`).
- Definition of done for any phase: plan accepted → goldens confirmed → tests green → lint 0 →
  build OK → screenshots with 0 console errors → three-pass self-review → `handback.md` committed
  → branch pushed. A phase that cannot source a number it needs halts and says so (never estimates
  a statutory figure silently).
- Network: cloud sessions usually **cannot reach ssa.gov, irs.gov or state DOR sites** (egress
  policy); only web-search snippets work. Any phase that needs a published table must receive the
  file from the builder (paste, upload, or a commit) — the plan for that phase says so up front.
- Where things are: engine `src/engine/` (`idgtModel.js` ledger, `fedTax.js`, `mortality.js`,
  `validate.js`, `ranking.js`, `constants.js`); data `src/data/`; UI state → engine in
  `src/hooks/useIdgtModel.js` via `src/hooks/buildInputs.js`; components under `src/components/`;
  tests in `src/engine/__tests__/` and `src/hooks/__tests__/`; fixtures reference
  `docs/changes/2026-09-26-idgt-rebuild/reference/`.

---

## Phase 0 — Merge v1 and deploy (owner actions; no session needed)
Status of the branch `claude/admiring-carson-qxka1z` at handback: contains `main`, fast-forward
mergeable, no conflicts; fresh clone → `npm ci`, 97 tests green, lint 0, build OK.
1. Merge the branch into `main` (fast-forward or merge commit; both are clean).
2. Deploy: superseded by `docs/changes/2026-09-26-ci-deploy` and
   `docs/changes/2026-09-27-pages-branch-source`. Every push to `main` publishes itself under either
   Pages source (`gh-pages` branch or GitHub Actions). `npm run deploy` stays removed; CI writes `gh-pages`.
3. Smoke-check the live site: ranking renders, the mortality banner shows, "Download CSV" works.
Acceptance: live URL shows the v1 build; `main` == the handback commit or its merge.

## Phase 1 — Verify the SSA life table (Lite; data)
Why first: every probability-weighted number depends on `src/data/mortalityTable.js`, which is
labelled UNVERIFIED (flag N1 in the v1 handback). The deterministic mode is unaffected.
Prerequisite (builder): download the table and hand it to the session — either the HTML page
`https://www.ssa.gov/oact/STATS/table4c6.html` (currently the 2023 period table) or the archived
2021 table `table4c6_2021_TR2024.html`, or the CSV files under
`https://www.ssa.gov/oact/HistEst/PerLifeTables/…` (male/female l_x by single age). Decide the
vintage: recommendation is the **latest period table** (2021 embeds pandemic-peak mortality).
Steps:
1. Gate 0 reads: `src/data/mortalityTable.js`, `src/engine/mortality.js`,
   `src/engine/__tests__/mortality.test.js`, `src/components/panels/MethodologyPanel.jsx`.
2. Add `scripts/import-ssa-table.mjs` (not shipped) that converts the supplied file to the
   `{age: {male, female}}` object, asserts 120 rows, radix 100,000, monotone non-increasing.
3. Replace the table; fill `MORTALITY_TABLE_META` (periodYear, publishedIn, sourceUrl, checkedOn,
   `checksum` for ages 65 and 85 both sexes taken from the published page), set `verified: true`.
4. Golden values (H — primary source): the four checksum l_x values and e₆₅ if shown; the
   builder confirms them from the page before the test asserts them.
5. Run the suite: `mortality.test.js`'s checksum test un-skips; the characterization assert for
   male 65 q₁ must be updated to the verified table (it is labelled characterization, so this is
   the one permitted move — record it in plan.md).
6. Re-run the default screenshots; the banner disappears; Methodology "Data status" reads Verified.
Acceptance: `verified: true`, checksum test green, banner gone, handback lists the vintage.
Optional in the same session: a `mortalityAdjustment` input (multiplier on q_t or an age setback)
only if the builder supplies an actuarial source (SOA annuitant tables); otherwise leave deferred.

## Phase N — ING trust comparison (Full; engine + UI) — DONE 2026-09-27
Shipped on branch `claude/ing-trust-idgt-comparison-rzas5s`; change folder
`docs/changes/2026-09-27-ing-comparison/` (model, plan, handback). An ING (incomplete non-grantor trust) runs
as a third world on the v1 ledger; the IDGT gains a burn-share input (trustee reimbursement); the selected
asset gets a comparison card with an exact bridge, a crossover chart, three breakevens (burn share, grantor
state rate, other estate) and a state-rate × burn-share grid.
Open: builder confirmation of Fixtures I and J (the golden test is annotated until then).
Follow-ups, each a candidate phase:
- **N.1 Toggle-off year** — completed-gift non-grantor trust: grantor-trust status released at the end of
  year τ, search τ like the swap year. The expert alternative to both vehicles; needs a regime switch in
  `simulate` and a τ search (O(N²) → cap the grid).
- **N.2 Distributions and DNI** — a distribution policy for the ING, beneficiaries' rates, throwback.
- **N.3 State fiduciary-tax table** — source and resident-trust rules per state (needs builder-supplied,
  verified data, as Phase 4).
- **N.4 Compressed brackets** — exact §1(e)/§1(h)/§1411 trust schedules from the Rev. Proc. of the year.

## Phase 2 — Installment sale to the IDGT (Full; engine + UI)
Goal: a second transfer mechanism per asset, on the same ledger, so gift and sale rank together.
Model extension (write as `model.md` §S in the phase folder before code):
- Inputs per asset: mechanism = `sale`; sale price = FMV·(1−δ) (transfer-tax value); seed gift
  fraction σ (default 10% of the price — flag: convention, not law); note principal
  P_n = price·(1−σ); note term n; note rate r_n; structure = interest-only with balloon (default)
  or level amortisation; §7872 bucket: short ≤ 3 yrs, mid > 3 and ≤ 9, long > 9 — r_n must be ≥
  the AFR for the bucket, else a field error (no silent compute).
- Rev. Rul. 85-13: no gain on the sale and no interest income to the grantor; the note is NOT
  taxed. Grantor still pays the trust's income tax (§671) on the holding's yield and on any gain
  the trust realises to fund payments.
- Ledger (GIFT[s] world becomes SALE[s]): trust holds the asset; owes the note. Each year: yield
  reinvested; payment due = interest (and principal if amortising) → paid from the trust's cash
  yield first, then by liquidating a pro-rata slice of the holding (gain on carryover basis taxed
  to the grantor from E; basis of the slice consumed); the payment lands in E^s. Note balance
  B_n(t) declines by principal paid; balloon at n.
- Death at end of year t: trust value T = holding − B_n(t) (net of the note); estate TE^s = E^s +
  B_n(t) (note at face — flag: assumes r_n ≥ AFR so face ≈ FMV) + swapped·incl; adjusted taxable
  gift = seed gift σ·price. Convention to confirm: **no gain recognised at death on the note**
  (unsettled law; state the alternative in the Methodology panel). Heirs' CGT on the holding's
  un-stepped-up gain as in the gift model.
- Exclusion used U_g = seed gift; efficiency = NPV / U_g (very high by construction — that is the
  point of a sale); the ranking must label sale rows.
- Swap: still available on the holding; consideration must cover the holding's value; the note
  stays.
- Warnings: interest coverage (yield < interest → liquidation each year; §2036 exposure if the
  trust is thin — warn when seed < 10% or when the holding must be liquidated in year 1).
Data: `src/data/afrRates.js` (new): monthly AFR table with the Rev. Rul. number per month; seed
with September 2026 (Rev. Rul. 2026-17: short 4.18%, mid 4.49%, long 5.12%; §7520 5.40%) and
August 2026 (Rev. Rul. 2026-13: 4.10 / 4.35 / 4.92; §7520 5.20%) — **M confidence, from search
snippets; re-fetch from irs.gov before shipping** (builder supplies if the sandbox is blocked).
Golden fixture (deterministic, death end of year 3, same base inputs as Fixture A): price
1,000,000; seed 100,000; note 900,000 interest-only 3 years at 4.49%; yield 2% on 1,000,000 →
interest 40,410 exceeds year-1 yield 20,000 → liquidation of the shortfall with gain on carryover
basis; hand-derive every year (the plan shows the arithmetic; the builder confirms before the test).
UI: mechanism select on the asset card (gift / sale); note fields shown for sale; ranking column
"mechanism"; detail tiles add note balance at expected death.
Tests: goldens; invariants (note balance ≥ 0; payments ≤ trust cash + liquidation; sale reduces to
the gift model when σ = 100%); wiring test cases for every new field.
Open questions for the builder (answer in plan acceptance): default σ; interest-only vs
amortising default; note at face at death; whether a balloon the trust cannot pay should be
refinanced (roll) or flagged as infeasible.

## Phase 3 — GRAT (Full; engine + UI)
Goal: §2702 grantor retained annuity trust as a mechanism, valued with the §7520 rate.
Model: term n, annuity A per year (or "zeroed-out": A = FMV / a(n, r₇₅₂₀)), optional 20%/yr
increasing annuities; term-certain annuity factor a(n, r) = (1 − (1+r)^−n)/r for end-of-year
payments (Reg. §25.2702-3; Table B — no mortality table needed, so no Table 2010CM dependency);
taxable gift = FMV − A·a(n, r) (floored at 0); annuity payments flow to E; trust income taxed to
the grantor (§671) as in the gift model; death during the term → §2036 inclusion of the portion
needed to produce the annuity: min(trust value, A / r₇₅₂₀ at death) (Reg. §20.2036-1(c)(2)) —
convention to confirm; after the term the remainder continues as a grantor trust (the gift ledger).
Swap applies. Efficiency = NPV / taxable gift (zeroed-out → ratio undefined → rank by NPV, as the
U_g = 0 rule already does).
Data: §7520 rate input (monthly; September 2026 5.40%, M — re-fetch). Goldens: a 2-year GRAT with
death in year 3 (deterministic) and one with death in year 1 (inclusion), hand-derived. Tests:
zeroed-out gift = 0; annuity factor vs closed form; inclusion cap.
Open questions: increasing annuities default; treatment of the "exhaustion test"; whether a GRAT
that fails (asset return < r₇₅₂₀) should show the simple loss (it should — no floor).

## Phase 4 — State estate and inheritance tax (Full; data-heavy)
Prerequisite (builder): a verified 2026 table for each state to be supported, from the state DOR,
because the sandbox cannot fetch them. The v1 audit produced **unverified starting points (M)**
from search snippets — treat as a checklist, not data: NY $7,350,000 with the 105% cliff and the
3-year gift add-back (§954(a)(3), extended to decedents dying before 2032); WA $3,000,000 from
2026-07-01 (10–20% after ESB 6347; $3,076,000 and 10–35% for deaths in Jan–Jun 2026); MA $2,000,000
via a $99,600 credit; OR $1,000,000 10–16%; IL $4,000,000 (old federal credit table); MN
$3,000,000 13–16% with a 3-year add-back; CT $15,000,000 flat 12% with a gift tax; MD $5,000,000
flat 16% + inheritance tax; ME $7,160,000 8/10/12%; VT $5,000,000 flat 16%; RI $1,838,056; HI
$5,490,000 10–20%; DC $4,988,400 11.2–16%; NE/PA/NJ inheritance taxes by beneficiary class; no tax
elsewhere.
Model: ET_t = ST(TE_t, addbacks_t, domicile) + FedTax(TE_t − ST, …) with the §2058 deduction;
mechanics classes: exclusion-with-cliff, credit, graduated-on-full-estate, flat-on-excess,
inheritance-by-class (heir class input); gift add-backs (NY/MN) and CT gift tax at t = 0. Add a
sixth component "state tax" to the decomposition (Level A gains ΔST; Level B places it before
Freeze). Data file `src/data/stateEstateTax.js` with per-state `asOf`, `sourceUrl`, `mechanics`,
`verified`. UI: domicile selector (only verified states enabled), state line in tiles and ledger.
Goldens: one hand-computed case per mechanics class (builder-confirmed). Deliver in two sessions if
needed: 4a mechanics + two states; 4b the remaining states.

## Phase 5 — SLAT and DSUE (Full)
SLAT: spouse as beneficiary; joint-life mortality from two l_x columns (independent lives —
convention); optional spousal distributions (consumption, taxed as the gift ledger's yield);
reciprocal-trust warning text only. DSUE: unindexed amount applied before the basic exclusion for
gifts (Reg. §25.2505-2(b)) and at death; extend `fedTax.js` bases and the anti-clawback floor;
one golden with DSUE = 5,000,000. Split-gift election (§2513) as an input that halves U_g per
spouse.

## Phase 6 — Sensitivity, scenario compare, exports (Lite/Full)
Sensitivity table/tornado: ±1 pp on g, y, r_E, d and ±5 years of age, reusing `evaluateAsset`;
scenario compare: load two JSON scenarios side by side (no storage); Monte Carlo: lognormal g and y
with a seed (deterministic tests on the sample mean); PDF: print stylesheet + `window.print()`
(cheap, verifiable); Excel: SheetJS export of the ledger (optional). Goldens: sensitivity deltas
equal direct re-evaluation; Monte Carlo mean within tolerance of the analytic mean.

## Phase 7 — Toolchain and CI (Lite)
CI half done in `docs/changes/2026-09-26-ci-deploy` and `docs/changes/2026-09-27-pages-branch-source`:
test + lint + build on every push, and `main` publishes through the configured Pages source: the
GitHub Actions source (`deploy-pages`) or the `gh-pages` branch (commit, then an API build request,
since GitHub's docs say `GITHUB_TOKEN` pushes start no Pages build). Remaining: `vitest` 5.x (drops the embedded Vite 5),
`vite` ≥ 8.0.16, `npm audit` clean, optional Playwright smoke screenshot artifact. Acceptance: green
workflow on `main`, site updated by CI.

## Phase 8 — UX polish backlog (Lite; pick items)
- Ranking/ledger tables: sticky first column and a "fit to width" density toggle.
- Asset presets (low-basis stock, FLP interest, operating business with sale, cash) and a
  "duplicate with tweaks" flow.
- A note in the detail panel when an inert asset shows "best swap year 1" (flag N3 in the v1
  handback) explaining that the swap makes it a cash IDGT.
- Glossary drawer for the tooltip terms; keyboard shortcuts; axe accessibility pass.
- Optional "results first" ordering on mobile.

## Phase dependency map
0 → 1 → (2 | 3 | 5 | 6 | 8 in any order) ; 4 needs its data first ; 7 any time after 0.
N (ING comparison) is done; N.1–N.4 follow it in any order; N.3 shares Phase 4's data prerequisite.
