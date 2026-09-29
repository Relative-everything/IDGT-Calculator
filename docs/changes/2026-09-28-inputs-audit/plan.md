# Plan: Inputs audit page
Date: 2026-09-28. Branch: `claude/charming-euler-ekiy6n`. Result: [`handback.md`](handback.md).

## Request
A summary "inputs" page for auditing large asset inputs against source documents: a systematic listing of bare data
that can be checked against Excel cells or an eMoney-style balance sheet.

## Design
| Need | Decision |
|---|---|
| One place to check everything | An **Inputs audit** tab next to Analysis. The input sidebar stays, so a correction shows up in the register at once |
| Match Excel cells | The asset register is laid out like a sheet: column letters A–R, one row per asset. A mode switch shows the values **as typed** (exactly what was entered) or **as the model reads them**: bare numbers, no $ or separators, percentages as decimals (Excel stores 7% as 0.07). The CSV export and the copied table use the same columns in the same order, so every column keeps its letter; asset #n is on row n + 1 (row 1 is the header) |
| Match a balance sheet | **Control totals** (count, Σ FMV, Σ basis, Σ unrealized gain, Σ discount, Σ gift value, Σ annual exclusions, Σ taxable gift) and a tie-out: other estate + Σ candidate FMV, to compare with the client's net worth, with the note that each asset is priced against other estate + that asset only |
| Every other input | A household register grouped by section, each input with a stable reference (`G.age`, `E.otherEstate`, …), the value, its unit and its status: in use, not used (and why), display only. Derived model inputs (the rate stacks, the resolved prior-gift exclusions) are listed too |
| Catch data-entry errors | Flags: a percentage typed as a decimal (0.07 in a percent field), a decimal comma (7,5 is read as 75), irregular thousands grouping, duplicate names and duplicate rows, basis above FMV, a sale year beyond the horizon, blank or invalid fields (the app's own validation) |
| Track progress | A tick per row. A tick records what was checked (the value, or a fingerprint of the asset row), stays with its row, and is hidden as soon as anything in that row changes or the row goes out of use. Live ticks and the reviewer's initials are saved in the scenario JSON, asset ticks keyed by content (numbered when rows are identical) and mapped back onto the rows in file order on import |
| Tie rows to their source | A per-asset **Source ref** field (e.g. "Excel B7", "eMoney · Schwab …1234"); a label only, never used in the math |
| Evidence | Download CSV (asset register, totals and household register in one file), copy the asset table as tab-separated text, print |

## Architecture (repo rules)
- Engine (`src/engine/inputAudit.js`): per-asset facts (gift value, discount amount, taxable gift, unrealized gain) and
  control totals — the only arithmetic.
- Hooks (`src/hooks/inputRegister.js`): the field catalog, in-use rules, flags, fingerprints, CSV/TSV. Model values are
  read from `buildEngineInputs` itself, so the page can never show a value the engine does not use.
- Components (`src/components/audit/`): formatting only.

## Verification
- Unit tests: the catalog lists every UI field exactly once; model values equal the engine inputs; totals; flags; tick
  invalidation; CSV layout and formula neutralisation; JSON round-trip of ticks and source refs.
- Eval suite (L5): on every scenario, the register's model values equal the engine's inputs and its taxable gift equals
  the engine's; `asset.source` is a label only. Added after the pre-merge review: the derived rows equal the oracle's, the
  "in use" statuses are checked metamorphically, rate-stack errors reach every part, identical rows need a tick each, and
  the totals row foots the cells shown.
- Browser check with screenshots.
