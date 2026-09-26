# Data layer

Static reference tables only. No calculations live in this folder (repo rule); the engine derives
everything it needs in `src/engine/`.

| File | Contents | Source | Status (2026-09-26) |
|---|---|---|---|
| `mortalityTable.js` | `SSA_2021_LX` — l_x (survivors per 100,000) by age 0–119, male/female; `MORTALITY_TABLE_META` | SSA Office of the Chief Actuary, 2021 period life table (2024 Trustees Report) | **UNVERIFIED** — the build sandbox could not reach ssa.gov; values carried forward and plausibility-checked only. Replace with the published column and set `verified: true`. |
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
- Mortality: verify against SSA, then refresh when a newer period table is preferred (the SSA
  "current" page shows the 2023 table as of the 2026 Trustees Report).
- Exclusion: add each year's amount when the IRS publishes the inflation-adjustment revenue procedure.
