# Source documents

Published reference data the calculator loads, kept with the evidence of how it was transcribed.

## SSA period life table, 2023 (2026 Trustees Report)

| File | What it is |
|---|---|
| `ssa-period-life-table-2023-tr2026.pdf` | Print of https://www.ssa.gov/oact/STATS/table4c6.html ("Period Life Table, 2023, as used in the 2026 Trustees Report"), supplied by the builder on 2026-09-27. 4 pages, ages 0–119, male and female: death probability, number of lives, life expectancy. SHA-256 `8f9a6c21b3010408028eeebb02a1f9529e213df7cefac0ce3d21c64723c8f3f5`. |
| `extract_ssa_life_table.py` | Extracts every row twice — with pdfplumber and with pypdf — and fails unless both extractions agree on all 720 values. |
| `ssa-period-life-table-2023-tr2026.csv` | The extraction: published strings, thousands separators removed. |

Loaded as `src/data/lifeTables/ssaPeriod2023Tr2026.js`; the eval suite (`evals/`, layer L6) checks that file against this
CSV value by value on every run.

**Consistency checks on the extraction** (a misread digit would break them):
- Survivors rebuilt from the death probabilities, l₀ = 100,000 and l₍ₓ₊₁₎ = lₓ(1 − qₓ), match the published survivors within
  0.54 lives (male) and 0.62 lives (female) at every age. The published q has more precision inside SSA than the 6
  decimals shown, which explains the sub-life differences.
- Life expectancy rebuilt from those survivors with deaths spread evenly within each year, closing the table at 120,
  matches the published column within 0.005 years at every age from 1 to 110. At 119 the rebuild gives 0.50 years
  against the published 0.58: SSA's own calculation continues past 119, while the calculator closes the table at 120.
  The probability a 65-year-old reaches 119 is about 10⁻¹⁰, so the closure has no effect on any result.

**How the calculator uses it:** the engine derives survivors from the death probabilities (q), not from the rounded
survivor column, because rounding to whole lives distorts advanced ages (male survivors are 2 at 110 and 0 at 112 in the
published column). Everyone alive at 119 is assumed to die before 120.

**What it is and is not:** a *period* table for the whole Social Security area population. It uses 2023 death rates for
every future year (no mortality improvement), and it is not adjusted for income or wealth. Both effects understate the
longevity of a typical UHNW client; see `docs/changes/2026-09-27-life-tables/model.md` §7.

To re-run the extraction: `pip install pdfplumber pypdf && python3 extract_ssa_life_table.py ssa-period-life-table-2023-tr2026.pdf out.csv`.
