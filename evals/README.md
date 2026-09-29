# Eval suite — IDGT calculator math

```
npm run eval                                   # full: 27 personas + 1,500-scenario sweep, ≈ 1.5 min
node evals/run.mjs --label holdout4 --seed 4242 --n 2000
node evals/run.mjs --quick                     # ≈ 30 s; also runs inside `npm test` (evals/evals.test.js)
node evals/mutation.mjs                        # grade the suite: 24 injected defects, ≈ 50 min
```
Results land in `evals/results/<label>.json` (scorecard, every failing check with its first examples, blocked
checks, discontinuities found, per-tag failure rates, the control-by-control wiring table). Committed runs:
`pass1.json` (the build as found), `pass2.json` (after the fixes), `holdout.json` (fixed build, unseen seed) —
single-life only, 2026-09-27 morning; `pass3.json` and `holdout3.json` — after life tables and married couples were
added; `pass4.json` and `holdout4.json` — after the inputs audit page (the suite below). Findings and fixes: [`docs/changes/2026-09-27-math-evals/`](../docs/changes/2026-09-27-math-evals/)
and [`docs/changes/2026-09-27-life-tables/`](../docs/changes/2026-09-27-life-tables/).

## Why this design

A financial calculator is deterministic, so every grade here is **code-based** (numeric tolerance or exact
match). There is no model or human judgement in the loop, which makes the suite cheap enough to run thousands of
client files on every push. The design follows the principles in Anthropic's evaluation guidance ("Define your success
criteria", "Create strong empirical evaluations" in the Claude docs; not re-fetched this session because the
environment blocks docs.anthropic.com). Each principle maps to a mechanism here:

| Principle | How it is applied here |
|---|---|
| Specific, measurable success criteria, set before running | money within $0.01 + 1e-11 × scale; ratios within 1e-9; s\* equal or a documented tie; every toggle moves exactly the outputs it should |
| Task-specific cases that mirror the real distribution, edge cases included | 27 named client files (founder pre-IPO, exhausted-exclusion widow, NY/CA ING, terminal diagnosis, illiquid grantor, and ten married couples: portability elected or not, same-sex, a spouse who funded a SLAT, assumed deaths inside §2035(b) either way round, an older spouse, an ING outliving its sale year, …) plus a seeded, stratified sweep over estate bands, prior-gift histories, 9 asset archetypes, every toggle, both life tables, and ≈ 45% married couples (spouse age, sex, prior gifts, portability) |
| Many automatically graded cases beat a few hand-graded ones | ≈ 200,000 assertions per full run; hand calculations reserved for anchoring the oracle |
| The reference must be independent of the system under test | clean-room oracle (below). The repo's earlier "independent" reference scripts transcribed the same spec, so they inherited its error; finding F1 went undetected until a structurally different oracle was used |
| Grade the graders | the hand calculations grade the oracle as well as the engine; grader expectations that were wrong were fixed and recorded (findings.md, "Grader calibration") |
| Guard against overfitting | fixes were made against seed 20260927 and confirmed on an unseen seed (4242, 2,000 scenarios) |
| Regressions stay caught | each finding is pinned by a unit test that fails on the pre-fix code; a quick run of this suite is part of `npm test` |
| Never report a check you could not run as a pass | the mortality-table provenance check was reported BLOCKED until the builder supplied the published SSA table; it is now an ordinary check (source PDF digest, 720 published values, derived columns) |
| Grade the suite itself | mutation testing: realistic defects are injected one at a time into the married-couple, mortality and inputs-audit code; every one must turn the suite red (results below) |

## The six layers

| Layer | What it checks | Grader |
|---|---|---|
| **L1 hand calculations** (`scenarios/handcalc.js`) | 25 cases small enough to do on paper. Single grantor (13): fully taxable / below exclusion / deathbed swap / gift tax with and without §2035(b) / two-year life table / ING rate saving / ING fee liquidation / burn share 0% / §1015(d)(6) with annual exclusions / discount at death / unfundable swap. Married (HC-M1…M6): the gift's cost in DSUE, the burn stopping at the grantor's death, the spouse's DSUE ported, two exclusions sheltering a $20M estate, portability not elected, the interrelated first-death tax on the §2035(b) add-back. Mortality (HC-L1…L6): published q₆₅ and q₈₅, 20-year survival from the published survivors, published e₆₅ and e₆₃, a two-year joint-life toy. Each has its derivation written out line by line | engine AND oracle vs the closed form |
| **L2 oracle agreement** (`oracle/`) | every scenario: derived gift facts, horizon, q_t, the NPV-by-swap-year curve and feasibility, s\*, NPV(none), NPV(s\*), deathbed value, efficiency ratios, 14 ledger columns per death year for no swap and s\*, and the ING NPV, Δ versus the IDGT, verdict and ledger. Married couples add both lives' horizons and death-year probabilities, the second-death distribution, and four more ledger columns (first-death tax, DSUE with and without the gift, probability the grantor died first) — every row an expectation given the year of the second death | engine vs oracle |
| **L3 invariants & theorems** | NPV(s\*) ≥ NPV(none); components sum to NPV; rows reproduce the NPV; the ING bridge closes; a swap cannot affect earlier deaths; Σq = 1; warnings fire iff their condition holds (illiquidity, built-in loss, fee-driven liquidation, portability off, first-death tax, spouse's gift tax, …); what the UI says about the deathbed value is true. Married: Σq^G = Σq^S = Σq^L = 1; E[second death] ≥ each life's; the gift never raises the DSUE; 0 ≤ P(grantor first) ≤ 1 | logical |
| **L4 metamorphic** | ×3 every dollar input ⇒ ×3 every NPV; toggles that must be inert in a configuration are inert (discount-at-death with no discount, sale toggles with no sale, prior-gift exclusion with no prior gifts, neutral custom swap ≡ default, ING fields never touch the IDGT, display horizon never touches NPVs, NY/CA flag at 0% state, spouse fields for a single grantor); married ≡ single identities (spouse certain to die first without portability ≡ the single ledger; with portability ≡ a single grantor whose exclusion is raised by the spouse's DSUE); **discontinuity scans**: NPV(none) and the ING NPV are continuous in 14 continuous inputs (married: 12, incl. the spouse's gifts and their exclusion) — a jump that survives bisection to an interval a few ulps wide, and exceeds 8× the change over the same width just outside it, is a defect | relational |
| **L5 UI wiring** | every UI field mapped to the engine exactly as its label and tooltip say (independent mapping in `oracle/ui.js`, the default life table derived from the source CSV); ≈ 90 controls each moved on a state where it should matter (or must not) through the app's own pipeline (`src/hooks/computeModel.js`), and the moved state re-checked against the oracle; the life expectancies and table flag the grantor panel shows; portfolio ranking under both rank keys, single and married. **Inputs audit page** (2026-09-28): on every scenario the value it shows for each field equals the engine input and the planner-facing meaning, its derived rows (rate stacks, resolved prior-gift exclusions) equal the oracle's, and its taxable gift equals the engine's U_g; the source-ref field is a label only. On every fifth scenario: every in-use / not-used / display-only status is checked metamorphically (a not-used field moves no engine input; an in-use one moves a model input beyond the display, save listed no-ops; a display-only one moves only display inputs); fourteen injected validation errors each show on exactly the fields behind them; a tick holds on its row's values, stays with its row when an identical row is edited or deleted, and never shows on a row not in use; totals foot the cells shown in both views, on rows with sub-cent parts; unreadable cells are counted, never read as 0 | sensitivity + oracle |
| **L6 breakevens & data** | each breakeven's final bracket straddles a sign change of the oracle's Δ and the reported winning side matches (single and married); grid cells equal the oracle's Δ; the basic exclusion table against the revenue procedures. **Life tables:** the shipped module equals the extracted CSV value for value (720), the source PDF matches the digest the registry records, survivors rebuilt from the published q stay within one life of the published l, life expectancy from q matches the published e_x within 0.01 (ages 1–110), registry checksums; engine death-year probabilities equal the product of the published death rates at **every age 0–119, both sexes**; the second-death distribution equals the explicit double sum on a grid of 11 × 11 ages × all four sex pairings; the legacy table is flagged and the app says so | oracle + reference data |

## The clean-room oracle (`oracle/`)

Written from the Internal Revenue Code and regulations, not from `docs/changes/*/model.md` and importing nothing from
`src/engine`:

- **Statute layer** (`statute.js`): §2001(c) tentative tax from the full bracket schedule; §2502/§2505 gift tax period by
  period with the credit of each gift year; §2001(b) estate tax with gift tax payable at date-of-death rates
  (§2001(g)(1)) and the Reg. §20.2010-1(c) anti-clawback credit; §1015(d)(6) per Reg. §1.1015-5(c). The engine instead
  uses an algebraic "taxable base" (flat τ_e above the exclusion, constants cancelled). Agreement on thousands of
  scenarios, including prior gifts from 2011–2025, gift-tax-paid histories and legislative exclusions, is the proof
  that the shortcut is exact.
- **Worlds** (`worlds.js`): keep / gift to the IDGT / ING as sets of lots (value, basis, owner). The owner decides who
  pays the tax on each lot's income (grantor, grantor trust with a reimbursement share, non-grantor trust) and how death
  values it (§1014 step-up vs Rev. Rul. 2023-2 carryover). Where the calculator has a documented convention (C-1…C-9,
  N-1…N-8) the oracle implements it from its plain-English statement and says so, so a difference is either an error
  or a convention worth revisiting — never ambiguous.
- **Evaluation** (`evaluate.js`): life-table death distribution, NPV, the stated swap tie rule, deathbed value,
  efficiency, ING comparison, ranking.
- **Life tables** (`lives.js`): the default table read from the extracted source file
  (`docs/sources/ssa-period-life-table-2023-tr2026.csv`), not from `src/data`; death-year probabilities both from a
  survivors column and straight from the death rates (product form); the second death by explicit double sum.
- **Married couples** (`couple.js`): every pair of death years (grantor i, spouse j) is played out on the same lots.
  Spouse first (j < i): DSUE from the spouse's gift sequence (Reg. §20.2010-2(c)), the grantor's estate taxed at i with
  it. Grantor first (i ≤ j, same year = grantor first): the §2035(b) add-back taxed at the first death with the tax
  paid from the marital share — solved by fixed-point iteration (§2056(b)(4)(A)), where the engine uses a closed form;
  the grantor's DSUE; the grantor's lots change owner (stepped up to the spouse; the IDGT becomes a non-grantor trust
  paying its own tax); the survivor's years run to j and the spouse's estate is taxed with the ported exclusion. Rows
  are expectations given the second-death year. On the married sweep the swap curve is sampled (no swap, the engine's
  s\* and its neighbours, years 1, 2 and N_G, three random years); personas and every eighth married scenario get the
  whole curve (O(N_G² N_S) pair valuations).

## Tolerances
Money: |engine − oracle| ≤ $0.01 + 1e-11 × (other estate + FMV + largest heir wealth). Ratios: 1e-9 relative.
Probabilities: 1e-15 absolute + 1e-12 relative (the joint distribution's far tail, ~1e-9 and below, must keep its
digits). s\*: equal, or the engine's year is within the documented tie tolerance (1e-6 × |NPV|) of the oracle's optimum
(sampled curve: no sampled year beats it). Discontinuity: a jump > max($1, 8× the change over the same width beside it) that survives bisection to a few ulps
(calibrated 2026-09-29: a fixed 1e-12 width flagged a smooth NPV of $2.7e10 rising $1.2e12 per unit of growth). A
breakeven bracket end within the money tolerance of 0 counts as a root (an oracle Δ of 9e-9 dollars had been read as a
sign). Both were found on the unseen seed 31 × 400, which now passes 679/679.

## Mutation testing — grading the suite (`node evals/mutation.mjs`)
A suite that passes proves little until it has been seen to fail. `mutation.mjs` injects one realistic defect at a
time (an exact-string replacement in the source), runs the quick suite and the engine/hook unit tests, records which
turned red, and restores the file byte for byte. It first checks that both are green without any mutation, and refuses
to grade otherwise: a red baseline would make every mutation look caught. A target that no longer exists in the source
is reported STALE, never as caught. Record: `results/mutation.json`.

| # | Injected defect (married couples and life tables) | 1st round: eval / unit | Final: eval / unit |
|---|---|---|---|
| M01 | spouse's table column wired to the grantor's sex | ✓ / ✓ | ✓ / ✓ |
| M02 | the legacy-table choice silently falls back to the default table | ✓ / ✓ | ✓ / ✓ |
| M03 | table not closed at 120 (published q₁₁₉ kept, one extra year) | ✓ / ✓ | ✓ / ✓ |
| M04 | second-death distribution in the cancelling difference form | ✓ / ✓ | ✓ / ✓ |
| M05 | the gift does not reduce the grantor's DSUE | ✓ / ✓ | ✓ / ✓ |
| M06 | first-death tax not grossed up (§2056(b)(4)(A)) | ✓ / ✓ | ✓ / ✓ |
| M07 | the IDGT stays a grantor trust after the grantor's death | ✓ / ✓ | ✓ / ✓ |
| M08 | the spouse's DSUE ignores the spouse's own gifts | ✓ / **✗** | ✓ / ✓ (HC-M7) |
| M09 | portability election ignored | ✓ / ✓ | ✓ / ✓ |
| M10 | swapped-back asset not stepped up at the first death | ✓ / **✗** | ✓ / ✓ (HC-M8) |
| M11 | survivor taxed at the wrong rate on the ING property | ✓ / **✗** | ✓ / ✓ (HC-M9) |
| M12 | `FIRST_DEATH_TAX` although the spouse surely dies first | **✗** / ✓ | ✓ (persona P26) / ✓ |
| M13 | married ING fee warning looks past the grantor's death | **✗** / ✓ | ✓ (persona P27) / ✓ |
| M14 | same-year deaths double-counted in the NPV | ✓ / **✗** | ✓ / ✓ (HC-M10) |
| | **caught** | **12 / 9** of 14 | **14 / 14** of 14 |

The first round's misses were coverage gaps, not blind spots of method: the unit tests had no case with a spouse's own
gifts, a post-death sale of a swapped asset, a post-death ING yield or same-year deaths; the sweep had no scenario in
which the spouse surely dies first inside the §2035(b) window or the ING would outlive the grantor's sale year. Each gap
got a hand case or persona, and the mutation was re-run to confirm it is now caught.

| # | Injected defect (inputs audit page, 2026-09-28/29) | 1st run: eval / unit | Final: eval / unit |
|---|---|---|---|
| M15 | the page shows the wrong engine input for the income yield | **✗** / ✓ | ✓ / ✓ |
| M16 | the page's taxable gift ignores the annual exclusions | ✓ / ✓ | ✓ / ✓ |
| M17 | an asset tick survives edits (fingerprint covers the name only) | **✗** / ✓ | ✓ / ✓ |
| M18 | control totals count an unreadable cell as zero | **✗** / ✓ | ✓ / ✓ |
| M19 | an asset tick is keyed by content, so it passes to an identical row | — | ✓ / ✓ |
| M20 | the totals row sums unrounded values, so it does not foot the cells shown | — | ✓ / ✓ |
| M21 | an error on the grantor ordinary stack is flagged on the federal rate only | — | ✓ / ✓ |
| M22 | a ticked household row stays verified after it goes out of use | — | ✓ / ✓ |
| M23 | the prior-gift year is marked in use although the custom exclusion is | ✓ / **✗** | ✓ / ✓ |
| M24 | the grantor's age is marked in use beside assumed death years (display only there) | — | ✓ / ✓ |
| | **caught** | | **24 / 24** of 24 |

The eval misses on M15, M17 and M18 came from a circular check (the page's own catalog was used as the expected
mapping) and from mechanisms no scenario exercised; the suite now reads the expected meaning from an independent table
(`oracle/ui.js`) and drives ticks and unreadable cells directly. M19–M24 were added during the pre-merge reviews; the
unit tests first missed M23, and a status test was added. In the final run (`results/mutation.json`, green baseline)
each of the 24 is caught by both layers, each audit mutation by the check written for it.

## Extending
Add a hand case to `scenarios/handcalc.js` for any new mechanism before building it; add its inputs to the generator's
archetypes or toggles; add a control row to `CONTROLS` in `suite.js` for any new UI field (on a state where it must
matter, and one where it must not); add a mutation to `mutation.mjs` for the defect you most fear in it. A new life
table goes in the registry (`src/data/lifeTables/`) with its source file in `docs/sources/`; the registry checks
(source, check date, verification flag) and `mortality.test.js`'s checksums then cover it automatically. To bring it
into the value-by-value, every-age and sweep checks, also give the oracle its source (`oracle/lives.js`, and the table
map in `oracle/ui.js`) and add it to the generator's table draw (`scenarios/generator.js`); until then the suite does
not exercise it.
