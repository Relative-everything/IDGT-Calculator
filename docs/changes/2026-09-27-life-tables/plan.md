# Plan (as executed): selectable life tables, the SSA 2023 period table, married couples
Date: 2026-09-27. Branch: `claude/charming-euler-ekiy6n`. Contract: [`model.md`](model.md). Result: [`handback.md`](handback.md).

## Request
Add the SSA life table the builder supplied (print of `https://www.ssa.gov/oact/STATS/table4c6.html`, 2023 period table,
2026 Trustees Report) as a mortality option, with room for more tables the builder will supply; confirm with a full eval
run that every toggle and input works and that the table's death probabilities are applied correctly for male, female
and joint lives.

## Decisions
| Question | Decision | Why |
|---|---|---|
| Where tables live | A registry, `src/data/lifeTables/index.js`: one entry per table with provenance, `verified`, published checksums and a `basis` | Adding a table = one data file + one entry; the engine, UI selector, eval suite and tests read the registry |
| Which column the engine uses | The published one-year death probabilities q_x (`basis: 'q'`), survivors derived l₍ₓ₊₁₎ = lₓ(1 − qₓ) | The published l_x is rounded to whole lives: at age 100+ (999 male survivors) the rounding moves q by up to 0.1%; q has six significant decimals throughout |
| Last age | Close at 120: everyone alive at 119 dies within the year (M-8) | The table stops at 119 with survivors; any closure is a convention — this one is the smallest change (the l_x at 120 is < 0.0001 of the radix) |
| Default table | SSA 2023 period (verified) | The legacy 2021 column was never checked against its source; it stays selectable (flagged) to reproduce earlier results |
| "Joint lives" | A second-death ledger over every pair of death years, not a last-survivor distribution in the single-life ledger | The IDGT's mechanics end at the grantor's death (burn, swap, grantor-trust status), the estate tax at the second death, with the marital deduction and portability in between. model.md §0 lists the four errors the shortcut makes |
| Dependence between spouses | Independent lives (J-1) | Standard for joint functions built from single-life tables (IRS two-life §7520 factors); no published dependence adjustment was supplied |
| Couples with the same sex | Supported: each life uses its own sex column | Nothing in the model depends on the spouses' sexes beyond the column |
| Performance | Pair records in typed buffers, index maps; breakevens in a Web Worker | Married evaluation is O(N_G² N_S); a 45/43 couple evaluates in ≈ 14 ms warm, breakevens ≈ 0.7 s off the main thread |

## Steps
1. Extract the PDF twice (pdfplumber and pypdf), require identical results, write `docs/sources/…csv`, record the PDF's
   SHA-256; check the columns' internal consistency (survivors rebuilt from q within one life; e_x from q within 0.01).
2. Registry and data module (published columns only, never derived ones); engine helpers `lxFromLifeTable`,
   `survivorsFromDeathRates`, `lifeExpectancyYears`, `secondDeathDistribution`.
3. Contract `model.md` (Case A / Case B conventions, M-1…M-10), hand calculations HC-M1…M6 before code.
4. `marriedModel.js`: pair ledger for the IDGT (every swap year) and the ING; `validate.js` (spouse fields, horizon =
   max of both lives), warnings `PORTABILITY_OFF`, `FIRST_DEATH_TAX`, `SPOUSE_PRIOR_GIFT_TAX`.
5. UI: life-table selector; "Married" switch with the spouse's age, sex, assumed death year, portability election and
   prior gifts; life expectancies shown under the grantor panel; married labels in the ledger and charts; Methodology
   and "Not modelled" text; scenario JSON import/export.
6. Evals: clean-room married oracle (`evals/oracle/couple.js`), life tables from the CSV (`evals/oracle/lives.js`), UI
   mapping, generator (≈ 45% couples, 15% legacy table), 9 personas, 12 hand cases, ≈ 30 control rows, life-table data
   checks; full pass, hold-out seed, then mutation testing of the suite itself.

## Golden values
HC-M1…M6 (evals/scenarios/handcalc.js, mirrored in `src/engine/__tests__/married.test.js`) and HC-L1…L6 are derived by
hand from the statute, the conventions and the published columns; the engine and the oracle both reproduce them.
**Awaiting builder confirmation** (repo rule: golden values are builder-confirmed before they are treated as final).
