# Handback — SSA 2023 life table, life-table registry, married couples
Date: 2026-09-27. Branch: `claude/charming-euler-ekiy6n`. Contract: [`model.md`](model.md). Plan: [`plan.md`](plan.md).
Eval method: [`evals/README.md`](../../../evals/README.md). Source file: [`docs/sources/`](../../sources/).

## Result

| | Pass 2 (single-life suite, before this change) | **Pass 3** (this change) | **Hold-out 3** (unseen seed 4242) |
|---|---|---|---|
| Scenarios evaluated | 1,516 | 1,527 | 2,027 |
| … of which married couples | — | 666 (161 with the full swap curve) | 904 (197 full curve) |
| Hand calculations | 13 | 29 (13 single, 10 married, 6 mortality) | 29 |
| Checks passing | 398 / 398 | **661 / 661** | **663 / 663** |
| Assertions passing | 168,001 / 168,001 | **206,013 / 206,013** | **272,633 / 272,633** |
| Scenarios with any failure | 0 | **0** | **0** |
| Blocked (cannot run here) | 1 (SSA table provenance) | **0** — now an ordinary check | **0** |

Every control was exercised through the app's own pipeline: 89 control cases (31 new for the life table and married
couples), each on a state where it must move the result and, where it applies, one where it must not; every moved state
re-checked against the oracle.

**Mutation testing** (new — grades the suite itself; `node evals/mutation.mjs`): 14 realistic defects injected one at a
time into the married-couple and mortality code. First round: the eval suite caught 12, the unit tests 9 (together 14).
The gaps were closed (below); final round: **eval 14 / 14, unit tests 14 / 14** — each defect is caught by both
independently. Table in `evals/README.md`.

## How the table's odds reach the result (default couple: grantor 65 M, spouse 63 F)
| Quantity | Published SSA 2023 | Engine | Where checked |
|---|---|---|---|
| q₆₅ male, first-year death | 0.016455 | 0.016455 | HC-L1; every age 0–119 both sexes (L6, 240 checks) |
| q₆₃ female | 0.008881 | 0.008881 | L6 |
| Life expectancy, grantor / spouse | 18.12 / 22.27 | 18.12 / 22.27 (panel: 18.1 / 22.3) | HC-L4, HC-L5; panel check (L5) |
| P(second death in year 1) = q^G₁·q^S₁ | — | 0.0146% (ledger row 1: 0.01%) | joint grid, 11 × 11 ages × 4 sex pairings (L6) |
| Second death: expectancy / median year | — | 25.6 yrs / year 27 | L2 on 666 couples |
| P(grantor dies first) | — | 64.6% | rows' `grantorFirst`, L2 |

## What the eval work found in this change, and what was done
| # | Finding | Found by | Effect | Fix |
|---|---|---|---|---|
| L1 | The second-death distribution, computed as F_G(t)F_S(t) − F_G(t−1)F_S(t−1), cancels where both lives are almost surely dead | married oracle vs engine (row values at ages 115+) | ledger rows at the far tail off by up to 1e-7 relative ($14 on a $135M row); NPVs unaffected (≤ 3e-10) | sum-of-products form q^G_t q^S_t + q^G_t F_S(t−1) + q^S_t F_G(t−1), exactly symmetric; unit test on the tail |
| L2 | `FIRST_DEATH_TAX` warned when the spouse is certain to die first (assumed deaths spouse yr 1, grantor yr 2) | writing the eval's warning condition | false warning; numbers were right | require P(T_S ≥ i) > 0; unit test; persona P26 |
| L3 | Married: `ING_FEE_EXCEEDS_YIELD` looked at post-sale years after the grantor's death, when the ING no longer exists (M-9) | same | possible false warning | fee test over the grantor's life only; unit test; persona P27 |
| L4 | The married ledger showed the basic exclusion but not the ported DSUE, so a $26M estate with a "$16M exclusion" and no tax looked wrong | browser review | clarity | "DSUE ported · keep / gift" column (engine now also emits the DSUE on ING rows), "Basic exclusion" label, footnote |
| L5 | Unit tests missed 4 / 14 mutations: the spouse's own gifts in the DSUE, the step-up of a swapped-back asset at the first death, the survivor's rate on the ING property, same-year double counting; the eval missed the two warning conditions above | mutation testing | test gaps | hand cases HC-M7…M10 (eval and unit tests), personas P26, P27 |
| L6 | Eval harness: the sweep kept every oracle table in memory (4.5 GB); the new married continuity scan pushed X₀ below the valid domain on seed 4242 and crashed | running pass 3 / hold-out | eval only | tables dropped after grading; scan range bounded by the indexing rate; scan errors now recorded as failures, not crashes |

## What changed
- **Data:** `docs/sources/` (the SSA page as supplied, SHA-256 `8f9a6c21…c8f3f5`; double-extracted CSV; extraction
  script; README). `src/data/lifeTables/` — registry and the SSA 2023 (2026 TR) module (published q, l, e only);
  `src/data/mortalityTable.js` marked legacy.
- **Engine:** `mortality.js` (`lxFromLifeTable`, `survivorsFromDeathRates`, `lifeExpectancyYears`,
  `secondDeathDistribution`); `marriedModel.js` (new — pair ledger for the IDGT at every swap year and for the ING);
  `idgtModel.js`, `ingModel.js` (married dispatch; ING fee warning horizon), `validate.js` (spouse fields, joint
  horizon, warnings), `index.js`.
- **Hooks / UI:** `buildInputs.js`, `scenarioIO.js`, `computeModel.js` (mortality summary), `breakeven.worker.js`
  (new) and `useIngBreakeven.js` (breakevens off the main thread); `GrantorPanel`, `EstatePanel`, `LedgerTable`,
  `CrossoverChart`, `IngComparison`, `AssetDetail`, `warnings.js`, `MethodologyPanel`, `DeferredPanel`, `App.jsx`.
- **Tests:** `married.test.js` (new, 14), `mortality.test.js` (SSA 2023 table, closure, second death incl. the tail),
  `buildInputs.test.js` (life table and spouse wiring).
- **Evals:** `oracle/couple.js`, `oracle/lives.js` (new); `statute.js` (DSUE, interrelated marital deduction);
  `worlds.js` (spouse and post-death trust owners); `ui.js`, `evaluate.js`, `graders/views.js`, `suite.js`,
  generator (≈ 45% couples, 15% legacy table), 11 new personas, 16 new hand cases, `run.mjs`, `mutation.mjs` (new),
  README. Committed records: `evals/results/pass3.json`, `holdout3.json`, `mutation.json`.
- **Docs:** `model.md`, `plan.md`, this handback, `screenshots/`; `README.md`, `src/data/README.md`,
  `docs/ROADMAP.md` (Phase 1 done), `src/CLAUDE.md`.

## Verification
- `npm run lint` clean; `npm test -- --run`: 264 passed, 1 skipped — the legacy 2021 table's checksum test, skipped by
  design because that table stays unverified; `npm run build` clean.
- Browser (Vite preview, Chromium, 1440 px and 390 px): defaults single — NPV(best) $1.85M, swap year 20, "grantor
  18.1 yrs"; Married on — $1.68M, year 18, "grantor 18.1 · spouse 22.3 · second death 25.6 yrs"; portability off —
  $2.19M, year 21, `PORTABILITY_OFF` shown; married on the legacy table — $1.59M, year 17, unverified banner; married
  with assumed deaths 20 / 25 — $2.59M, year 20; 20 / 12 (spouse first) — $1.79M, year 10. No console errors; no horizontal scroll at 390 px.
  Screenshots in `screenshots/`.

## Limits (stated in the app, not modelled)
1. **Period, not cohort:** 2023 death rates applied to every future year; a cohort table would lengthen a 65-year-old's
   life by roughly one to two years (medium confidence, not re-checked this session).
2. **General population:** wealth and longevity are linked (Chetty et al., JAMA 2016: 14.6-year gap for men, 10.1 for
   women between the top and bottom income percentiles). For UHNW clients the table likely places death too early,
   which understates the freeze and burn and moves the best swap year earlier. A select/annuitant table or a
   multiplier can be added to the registry once an actuarial source is chosen.
3. **Independent lives:** the elevated mortality of a recently widowed spouse is ignored.
4. Not modelled: gift-splitting (§2513), community-property double step-up (§1014(b)(6)), QTIP / credit-shelter
   drafting, remarriage, SLAT.
5. Observed, unchanged: prior-gift exclusions entered below $1,000,000 (custom mode — e.g. 1990s gifts) sit in the
   graduated part of §2001(c), where the engine's flat-rate algebra differs from the statute by a constant. The year
   picker starts at 2011 ($5M), so only a custom entry reaches it; it shifts both worlds equally and changes an NPV
   only when an estate straddles the exclusion. Not exercised by the sweep.

## Needs the builder
1. **Confirm the golden values** HC-M1…M10 and HC-L1…L6 (`evals/scenarios/handcalc.js`, mirrored in
   `married.test.js`) — hand-derived and reproduced by engine and oracle; repo rule is builder confirmation.
2. Keep or retire the **legacy 2021 table** (unverified; kept only to reproduce earlier results).
3. **Next tables:** hand over the source file (PDF/CSV) for each; adding one is a data file plus a registry entry,
   and the suite checks it automatically (module = source, checksums, death-year probabilities at every age).
4. Optional: choose an actuarial source for a **UHNW mortality adjustment** (e.g. SOA annuitant/select tables).
