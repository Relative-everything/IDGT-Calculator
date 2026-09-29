# Data layer

Static reference tables only. No calculations live in this folder (repo rule); the engine derives
everything it needs in `src/engine/`.

| File | Contents | Source | Status |
|---|---|---|---|
| `lifeTables/index.js` | Life-table **registry**: every selectable table with id, label, `basis` ('q' death rates or 'l' survivors), terminal age, radix, source URL, provenance, `verified`, `checkedOn`, published checksum survivors; `DEFAULT_LIFE_TABLE_ID` | — | Read by the engine (`lxFromLifeTable`), the UI selector, `mortality.test.js` and the eval suite |
| `lifeTables/ssaPeriod2023Tr2026.js` | SSA 2023 period life table, 2026 Trustees Report: q_x, l_x, e_x by age 0–119, male and female (published columns only) | SSA Office of the Chief Actuary, `https://www.ssa.gov/oact/STATS/table4c6.html`, via the print the builder supplied — `docs/sources/ssa-period-life-table-2023-tr2026.pdf` (SHA-256 in the registry), double-extracted to the CSV beside it | **VERIFIED 2026-09-27** — 720 values equal the extracted source (eval suite, L6); the default table |
| `mortalityTable.js` | `SSA_2021_LX` — l_x (survivors per 100,000) by age 0–119, male/female; `MORTALITY_TABLE_META` | SSA Office of the Chief Actuary, 2021 period life table (2024 Trustees Report) | **LEGACY, UNVERIFIED** — never checked against its source; kept only so earlier results can be reproduced; flagged in the UI when selected |
| `exclusionAmounts.js` | Basic exclusion amount by calendar year 2011–2026; `CURRENT_GIFT_YEAR` | IRC §2010(c)(3); OBBBA §70106 (P.L. 119-21); Rev. Proc. 2025-32 and prior annual revenue procedures | 2024–2026 confirmed; earlier years from the revenue procedures (not re-fetched) |
| `estateTaxRates.js` | IRC §2001(c) tentative-tax schedule | IRC §2001(c) | Confirmed. Used only by the flat-40% cross-check test. |

## Removed in the 2026-09-26 rebuild
- `afrRates.js` — stale (labelled January 2025, inverted curve that matched no published ruling) and
  unused by v1 (no installment sale). Re-add with dated values from the current Rev. Rul. when the
  installment-sale mechanism is built (September 2026: short 4.18% / mid 4.49% / long 5.12%,
  §7520 5.40%, Rev. Rul. 2026-17 — from search snippets, confidence M).
- `stateEstateTax.js` — wrong for at least eight jurisdictions (Oregon marked repealed — it is not;
  Massachusetts $1M vs $2M; Washington pre-2025 schedule; Nebraska coded as an estate tax with
  invented brackets). Deleted rather than kept stale; a verified 2026 table with each state's actual
  mechanics (NY cliff and 3-year add-back, CT gift tax, §2058 deduction) is a v2 item.
- The synthetic "Table 2000CM" annuity-factor grid (a linear ramp, not IRS data) and its interpolator.
  Table 2010CM (T.D. 9974, effective 2023-06-01) is the operative §7520 table; import the real
  l_x column from Reg. §20.2031-7(d)(7) / IRS Pub. 1457 when a §7520-valued interest is modelled.

## Maintenance
- Life tables: to add one, put its published columns in a new file under `lifeTables/`, add a registry entry with its
  source, check date, `verified` and three published checksum survivors per sex; `mortality.test.js` checks the
  checksums automatically. For the eval suite's value-by-value and sweep checks, also add its source to the oracle and
  the generator (`evals/README.md`, "Extending"). Keep `docs/sources/` copies of anything supplied by hand (file + SHA-256 + extraction script).
  Refresh the SSA table when a newer Trustees Report is preferred.
- Exclusion: add each year's amount when the IRS publishes the inflation-adjustment revenue procedure.
