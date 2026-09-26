# Handback: IDGT calculator full rebuild (v1 — gift mechanism)
Branch: `claude/admiring-carson-qxka1z`. Change: `docs/changes/2026-09-26-idgt-rebuild`. Tier: Full. Status: complete.

## Summary
Asked: analyse the original single-file calculator and the React port, plan a full rebuild, fix the
math, make every described variable work where it can be verified, defer the rest, and deliver a
polished working calculator. Done: a 15-agent audit (63 findings, 0 refuted) established that both
builds computed the wrong quantity, so the engine was rebuilt from a written model contract
(`model.md`) as a per-death-year heir-wealth ledger with an exact decomposition and a real swap
search; the data layer was reduced to sourced tables; the UI was rebuilt on Tailwind 4 with every
input wired; 9 builder-confirmed golden fixtures and 97 tests are green; an adversarial review
(4 lenses + 4 skeptics, 27 findings, 0 important in the engine) drove a hardening pass. Remaining:
the SSA life table could not be verified from the sandbox (flag N1); installment sale, GRAT, SLAT,
state tax, Table 2010CM and Monte Carlo are deferred and listed in-app. No PR was opened.

## What changed
- The calculator now answers one question per asset: how much more heirs receive, in today's
  dollars and weighted by when the grantor is likely to die, if the asset is gifted to the IDGT
  rather than kept until death — and in which year exercising the swap power adds the most.
- Every result is read off a year-by-year ledger of two worlds (keep vs gift); nothing is added to
  the NPV as a separate "benefit". The five components shown (freeze, tax burn, gift tax, residual,
  step-up) sum exactly to the NPV in every year.
- Federal transfer tax is computed as the Code does it: a flat 40% above the applicable exclusion
  ($15,000,000 for 2026 under OBBBA, indexed from 2027 at a rate you set), the gift added back as an
  adjusted taxable gift, prior gifts measured against the exclusion of *their* year, anti-clawback,
  gift tax paid now added back for a death within three years, and the §1015(d)(6) basis increase.
- The swap is simulated for every feasible year (the estate must be able to fund the consideration;
  a swap after a scheduled sale is excluded) with a cash-like, return-neutral consideration by
  default; the results show the NPV curve, the best year, and a labelled deathbed-swap value.
- A scheduled sale of the holding is taxed to the grantor on carryover basis wherever the holding
  sits, and by default also happens if the asset is kept (a toggle restores hold-to-death).
- Mortality runs to the end of the life table (probabilities sum to one); the display horizon only
  truncates the table. An assumed-death-year mode gives a table-independent answer.
- Assets are ranked by NPV per dollar of taxable gift value (exclusion-equivalent consumed), by
  default with the optimal swap year; a cumulative column shows where the remaining exclusion
  runs out in rank order.
- The old estate-tax "cliff", the `FMV × rate²` term, the 100%-of-tax-paid "burn" credit, the
  synthetic Table 2000CM factor grid, the $7,000,000 "TCJA sunset" toggle, the stale AFR and
  state tables, and the sign-only tests are gone.
- Inputs that were dead or unreachable now work and are tested field by field: grantor age/sex,
  every tax-rate stack, other-estate size and growth, exclusion and indexing, prior gifts and
  their year, heirs' rates (NIIT on by default), valuation discount, annual exclusions, sale year
  and post-sale returns, the swap consideration profile, and the model toggles.
- Scenarios move as JSON files and the ranking exports as CSV (both hardened against hostile
  files); no localStorage.

## What to watch for
- Enter an asset with FMV $1 and basis $1: NPV should be cents (defaults give $0.37 no swap,
  $0.56 best swap). Anything larger means a fixed term is leaking in.
- Set appreciation 0%, yield 0%, basis = FMV: NPV (no swap) must be exactly $0 — an inert asset
  gifted with no growth, no income and no built-in gain changes nothing. The "best swap year 1"
  result of about +$288,000 that appears alongside is correct and worth understanding: swapping
  cash in turns the gift into a cash IDGT whose gross yield compounds outside the estate while the
  grantor pays its tax; that is the grantor-trust benefit on the consideration, not on the asset.
- Set the other estate to $5,000,000 (never taxable at any plausible age): NPV (no swap) must be
  approximately minus the heirs' capital-gains tax on the un-stepped-up gain (defaults: −$538,589,
  of which −$545,889 is the step-up line; a small positive freeze appears only because in the far
  tail of the table estate + asset does exceed the indexed exclusion). A deathbed swap should
  recover the loss almost exactly.
- Enter prior gifts of $13,990,000 made in 2025 and a $1,500,000 gift: exclusion used must read
  $1,010,000 and gift tax $196,000 (40% × $490,000). Switch the prior-gift exclusion to a custom
  $15,000,000 and gift tax becomes $600,000. The old per-asset "exemption exhausted" checkbox would
  have charged $600,000 in the first case, which is wrong under §2001(g)(2).
- Default 65-year-old male, $20,000,000 estate, $1,000,000 growth stock (7% / 2%, basis
  $200,000): NPV no swap $252,725; best swap year 17, $485,988. The ranking's default third asset
  (business interest sold in year 5) shows swap years ≥ 5 as infeasible dots — expected.
- Fixture A hand check (deterministic death at end of year 3, same asset, $20M estate): NPV no
  swap −$115,086.29, deathbed swap +$104,911.88; the derivation is in plan.md.
- Toggle "assumed death year" on and off: numbers move because the mortality weighting changes,
  but the year-by-year ledger rows for a given year must be identical in both modes.
- The illiquidity warning on the default LP-interest and business-interest rows refers to age 105
  with 0.1% survival probability; it is informational (the tax burn outgrows a 3% estate only in
  the far tail). If it appears at a plausible age, the gift is too large for the estate.

## How to read the result
- Inputs echoed: taxable gift, exclusion used, gift tax paid, trust basis — arithmetic on your
  entries (H).
- Computed under the model contract: NPV (no swap / best swap), the swap-year curve, the five
  components, the ledger. They are exact consequences of the inputs and the conventions in
  model.md §13; change a convention and they move.
- Estimates with stated confidence: the death-year probabilities (SSA 2021 period table,
  UNVERIFIED — see N1; use the assumed-death-year mode for a table-free view), the 2027+ exclusion
  (your indexing rate; the IRS had not published 2027 as of 2026-09-26), and the "deathbed-swap
  value", which is an upper bound only when every swap year is feasible (the tile says which).
- Be skeptical of: any NPV that depends mostly on years beyond the display horizon (the ledger
  footnote shows the share), results with a non-neutral consideration (the residual line is not a
  tax benefit), and comparisons across assets when cumulative taxable gifts exceed the remaining
  exclusion (the row is flagged; joint optimisation is deferred).

## Verification output
`npx vitest run` — Test Files 6 passed (6); Tests 97 passed | 1 skipped (98) — the skipped test is the
mortality checksum, gated on `MORTALITY_TABLE_META.verified`.
`npx eslint .` — 0 problems (with `react/jsx-uses-vars`; a probe file importing an unrendered
component now reports 1 error).
`npx vite build` — ✓ built in 206 ms; `dist/assets/index-*.css` 22.37 kB (utilities emitted),
`dist/assets/index-*.js` ≈ 260 kB.
Playwright (Chromium, production preview): desktop 1280 px light and dark, mobile 375 px — console
errors 0, warnings 0, `scrollWidth === clientWidth` at every width (no horizontal page scroll),
91 table rows rendered, first tile `$1.76M`. Screenshots in `screenshots/` (desktop, dark, mobile,
row-2 detail, both chart elements and a hover state).
Reference cross-check (review agent): 400 seeded random scenarios × 3 swap years, 867,084 ledger
values compared between `src/engine` and `reference/fixtures-ref.mjs` — worst relative difference 0.

## Self-review findings
Three passes were run on the diff and, in addition, an adversarial review workflow (engine-vs-model,
UI/hooks, security, compliance; each report verified by a skeptic). All important findings were
fixed in the final commit; the remainder are recorded here.

### Important (all fixed)
- [Security] `src/hooks/scenarioIO.js` — imported JSON was spread unchecked (an object-valued asset
  name blanked the app; string booleans flipped toggles; duplicate ids made removal delete several
  assets). Fixed: per-field type coercion against a whitelist, fresh ids, caps, error boundary.
- [Security] `src/hooks/scenarioIO.js` — CSV formula injection via asset names. Fixed: formula-
  leading text cells are prefixed and quoted; numbers stay raw; tested.
- [Bugs] `src/hooks/buildInputs.js` — non-integer age/death year/sale year were silently rounded and
  the ledger's Age column was computed in a component. Fixed: strict integers with field errors;
  the engine emits the age on each row.
- [Security] `src/engine/validate.js` — unbounded assumed death year allowed an O(N²) tab freeze.
  Fixed: capped at 120 years (named constant); age ≤ 120 in that mode.
- [Compliance] `src/engine/validate.js` — hard-coded 120-year horizon over-rejected negative
  indexing rates; hard-coded 15,000,000. Fixed: horizon from the table (ω − age) or the override;
  statutory amount read from `src/data/exclusionAmounts.js`.
- [Compliance] `eslint.config.js` — the planned unused-import tweak had been dropped. Fixed with
  `eslint-plugin-react`'s `jsx-uses-vars` (core ESLint cannot see JSX usage).

### Nits (showing 5 of 7)
- [Bugs] `src/engine/__tests__/invariants.test.js` — the decomposition-sum invariant is an
  algebraic identity; labelled as a smoke test and the attribution is pinned by golden row values
  (freeze 105,061.445895 / burn 12,950.154105 at Fixture A year 3).
- [Compliance] `src/engine/__tests__/golden.test.js` — 9 component asserts (E2 ×3, F ×5, G ×1) come
  from the reference derivation, not from the builder-confirmed table; annotated in the test.
- [Bugs] `src/engine/ranking.js` — assets fully covered by annual exclusions ranked last; now first
  when NPV > 0 (rule added to model.md §9).
- [Compliance] engine warning strings carried formatted numbers; warnings are now `{code, data}`
  and `src/components/warnings.js` composes the text.
- [Security] `package.json` — dev-only advisories (vitest 0.34.6 embeds Vite 5; vite 8.0.0 range).
  Not fixed: the vitest fix is a semver-major upgrade (5.x); recorded under Next session.
Remaining 2: `useDeferredValue` recompute on unrelated re-renders (fixed by deferring each state
part); per-field error attribution (fixed).

### Looked for and did not find
- Divergence between the engine and the reference implementation: none across 867,084 values.
- Golden asserts derived from the code under test: none; the only characterization assert is
  labelled (`mortality.test.js`).
- Calculation logic in components or hooks beyond formatting/geometry: none after the fixes
  (neutral swap yield comes from `engine.resolveSwapProfile`; ledger age from the engine).
- React imports in `src/engine` or `src/data`; functions in `src/data`: none.
- localStorage/sessionStorage, network calls, `dangerouslySetInnerHTML`, prototype pollution via
  import: none (tested).
- Baseline, snapshot or threshold movement: none exist; the only asserted values are the confirmed
  fixtures and the §2001(c) statute figures.
- Client data: fixtures use round synthetic numbers and generic asset names.
- Tax characterisations asserted as settled: the model states its conventions (C-1…C-9) and the
  Methodology panel cites the authorities; the open questions below are posed as questions.

## Rejected options
Carried from plan.md: patching the legacy engine; keeping additive benefit buckets; installment /
GRAT / SLAT / state tax / Monte Carlo in v1; Table 2010CM for grantor mortality; truncating NPV at
the display horizon; hand-written CSS; a chart library; a per-asset "exemption exhausted" checkbox.
Decided during the build:
- Manufacturing built-in gain on cash by defaulting the consideration to 3% unrealised growth
  (the judge's draft) — rejected for a cash-like profile whose gross yield is taxed to the grantor;
  it is return-neutral and keeps the swapped trust's basis equal to value.
- Silently rounding fractional years — rejected in favour of field errors.
- Keeping the swap search in its own module — a 15-line loop in `evaluateAsset` was clearer.
- `varsIgnorePattern: '^_'` alone for eslint — impossible without a JSX-aware rule; added the plugin.

## Flags
### Blocking
None.

### Non-blocking
- **N1 — Mortality table unverified.** `src/data/mortalityTable.js` carries what the prior commit
  called the SSA 2021 period life table (male l₆₅ = 77,402). The sandbox could not reach ssa.gov
  and the original single-file build carried a different table (male l₆₅ = 74,759; rejected on
  plausibility — 10.7% of women alive at 100). Every probability-weighted number depends on it;
  the deterministic mode does not. Action: download
  `https://www.ssa.gov/oact/STATS/table4c6_2021_TR2024.html` (or the 2023 table now on
  `table4c6.html`), replace the l_x column, fill `MORTALITY_TABLE_META.checksum`, set
  `verified: true`; `mortality.test.js` then asserts the checksum. Recommendation: prefer the
  latest period table — 2021 embeds pandemic-peak mortality at every age.
- **N2 — Convention choices move numbers** (model.md §13): return-neutral reinvestment, cash-like
  consideration, heirs' NIIT on, §2035(b) window counting year 3, gift tax charged at the gift,
  no $10,000 rounding of the indexed exclusion, post-death growth ignored, no DSUE. Each is a
  one-line switch; the fixtures regenerate from `reference/fixtures-ref.mjs`. Question for you:
  should the heirs' NIIT default stay on (post-death non-grantor trust hits §1411 at ~$16,000 of
  undistributed NII)? The model currently says yes.
- **N3 — Inert-asset presentation.** A 0%-growth, 0%-yield asset shows "best swap year 1" with a
  positive NPV because a cash gift to a grantor trust has value. Correct, but a reader may find it
  surprising; a one-line note in the detail panel is an option.
- **N4 — 9 golden component values are reference-derived**, not in the builder-confirmed table
  (annotated in `golden.test.js`). Confirm them or leave annotated.
- **N5 — Dev-toolchain advisories** (`npm audit`: vitest 0.34.6 → 5.x is a major; vite 8.0.0 →
  ≥ 8.0.16). Runtime bundle unaffected.
- **N6 — Governance files updated**: `src/CLAUDE.md` now states the ledger convention, drops the
  TCJA-toggle mandate, and records "Things Claude gets wrong here"; `src/data/README.md` rewritten.
  `README.md` rewritten. The `homepage` in `package.json` still points at the GitHub Pages site;
  `npm run deploy` publishes `dist/` — not run this session.
- **N7 — Pre-existing, out of scope**: `public/icons.svg` (Vite template social icons) is unused.
- **N8 — Planning used a multi-agent workflow** although the sdlc skill's standing rule prefers a
  single thread; the session's ultracode setting was treated as the opt-in. The build itself was
  single-threaded; the review used a workflow again.
- **N9 — Older open PR #1 is superseded.** `claude/fix-calculator-compute-IcIjX` → `main`
  ("Fix: make Calculate reachable and fix asset % input convention", May 2026) patches the legacy
  `App.jsx` / `AssetInputPanel.jsx` that this rebuild deleted; merging it after this branch would
  conflict and reintroduce removed code. Recommendation: merge this branch, then close PR #1 as
  superseded (your action — not done here).
- **N10 — Merge readiness (checked 2026-09-26 from a fresh clone of the pushed branch):** branch
  contains `main` (`8aa4f19`), fast-forward mergeable, merge dry-run clean; `npm ci` → 384
  packages; 97 tests green; lint 0; build OK; `homepage`/`base` aligned with the `gh-pages`
  deploy (`npm run deploy`); no CI workflows exist yet (Phase 7 of `docs/ROADMAP.md`).

## Next session should
The phased, session-sized plan for all remaining work is `docs/ROADMAP.md` (kickoff prompt at the
top). In order:
1. Verify the mortality table (read `src/data/mortalityTable.js` and flag N1 above first): replace
   the l_x column from SSA, set `verified: true`, run `npm test`, and note the vintage in the
   Methodology "Data status" line (it reads from `MORTALITY_TABLE_META`).
2. Plan the installment-sale freeze model (read `model.md` §4–§5 first): note at the AFR with no
   grantor interest income (Rev. Rul. 85-13), note balance in the estate, §7872 term validation;
   September 2026 AFRs 4.18% / 4.49% / 5.12%, §7520 5.40% (Rev. Rul. 2026-17, search snippets —
   M confidence, re-fetch before use). Its fixture needs builder confirmation before tests.
3. Upgrade the test toolchain (vitest 5.x, vite ≥ 8.0.16) in its own commit; `npm audit` is the
   check.
