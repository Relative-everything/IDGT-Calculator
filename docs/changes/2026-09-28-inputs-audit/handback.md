# Handback — Inputs audit page
Date: 2026-09-28/29. Branch: `claude/charming-euler-ekiy6n`. Plan: [`plan.md`](plan.md). Screenshots: [`screenshots/`](screenshots/).

## What was built
An **Inputs audit** tab next to Analysis (bookmark `…/#audit`). It lists every input as bare data for checking against
source documents, such as an Excel sheet or an eMoney-style balance sheet, when many assets are keyed in.

| Part | What it shows |
|---|---|
| Asset register | One row per asset, columns lettered A–R like a sheet: #, name, **source ref**, FMV, basis, discount, annual exclusions, appreciation, yield, sale year, post-sale rates, then derived unrealized gain, gift value after discount, taxable gift, share of Σ FMV, flags, tick. A totals row that foots the cents shown on each row. **As typed** (exactly what was entered) or **Model values** (what the calculation uses; percentages as decimals, the way Excel stores them). Pinned name and tick columns; **Full width** hides the input panels |
| Control totals | Record count, Σ FMV, Σ basis, Σ annual exclusions, Σ unrealized gain, Σ gift value, Σ taxable gift, Σ discount. The bare figure comes first (to match a SUM cell), formatted beside it. Unreadable cells are counted and left out, never read as 0 |
| Balance-sheet tie-out | Other estate + Σ candidate FMV = the figure to compare with the client's net worth, with what the other-estate convention changes |
| Household register | Every other input with a stable reference (`G.` grantor, `E.` estate, `S.` settings), its unit and status (in use / not used and why / display only), grouped as on the input panels, plus the derived rate stacks and resolved prior-gift exclusions |
| Flags | Percent typed as a decimal (0.07, or 1 for a 100% share), decimal comma ("3,5" read as 35), irregular comma or point grouping, amounts or a whole schedule that look like thousands, duplicate names or figures, basis above value, sale after the horizon, and every validation error on exactly the fields behind it. Worst first, each with its reference; a slip in a field not in use is a "confirm" |
| Ticks | One per row. A tick records what it certified (the typed value, or a fingerprint of the asset row) and stays with its row: it is hidden as soon as anything in the row changes or the row goes out of use, returns if the change is undone, and never passes to an identical row. Live ticks and reviewer initials are saved with Export JSON; the file keys asset ticks by content and import maps them back onto the rows in order |
| Exports | Copy asset table (tab-separated, to paste beside the source), Download audit CSV (asset block with the same letters, control totals, household block; UTF-8 with a byte-order mark for Excel), Print (landscape, header and panels hidden, the row filter stated) |
| Source ref | A free-text field on each asset card ("Excel B7", "eMoney · Schwab …1234"); a label only, never used in the math |

## How to use it
1. Put each asset's source location in **Source ref** while keying (or import a scenario JSON).
2. Open **Inputs audit** and clear the flags list first: the flags are the likely keying slips.
3. Compare the **control totals** with the source's column totals (count, Σ FMV, Σ basis). Matching totals make a
   keying error in those columns unlikely. The tie-out total should equal net worth on the balance sheet.
4. Tick rows as they match the source. For Excel, switch to **Model values**, **Copy asset table**, paste beside the
   source sheet and compare cell by cell. For eMoney or printed schedules, use **As typed**.
5. **Export JSON** saves the ticks and reviewer. **Download audit CSV** or **Print** for the file.

## Pre-merge review
Three adversarial review rounds ran before merge, each finding tried by independent skeptics.

| Round | Scope | Raised | Upheld | Split | Refuted |
|---|---|---|---|---|---|
| 1 (97 agents) | the page as first committed | 46 | 39 | 4 | 3 |
| 2 (73 agents) | the round-1 fixes, plus a regression hunt | 43 | 33 | 1 | 9 |
| 3 (37 agents) | the round-2 fixes, plus a regression hunt | 20 | 13 | 3 | 4 |

Every upheld and split finding of all three rounds was fixed. The most important:
- **Ticks.** In round 1, ticking one of two identical rows verified both. The round-1 fix numbered identical rows, but
  round 2 showed the numbering let a tick pass to the other twin when one was edited or deleted. Ticks now follow the
  row id within a session and hold only while the row's content is unchanged. The file keeps content keys, since ids
  are regenerated on import. A household row that goes out of use is no longer shown as verified anywhere. The Clear
  ticks confirmation is armed for the exact tick set it was shown for, so it cannot reappear by itself.
- **Footing.** Every total now equals the sum of the cells shown above it, in both views. Money shown to the cent is
  totalled in whole cents, typed inputs are totalled as typed (to 15 significant digits, so large typed amounts keep
  their cents), and the tie-out foots its two lines. In the "as typed" view the control totals use the same figures.
- **Error placement.** An error now shows on exactly the fields behind it: every rate in a stack, including the trust
  stacks. A negative federal rate is reported on the federal rate: it is the only way a state component can exceed its
  stack less NIIT. A prior-gift year with no exclusion on file is reported on the year. The ING value-factor error
  names its asset and shows on the fee, the asset's growth and the trust's ordinary stack. A negative indexing rate
  that breaks the $1M floor also shows on the exclusion it indexes. An exclusion error no longer spills onto unused
  prior-gift rows.
- **Paste and CSV hardening.** Formula injection is blocked in the pasted table and in CSV, including after a `;`
  that a semicolon-locale Excel splits on. Free text that a spreadsheet would read as a number, date or boolean stays
  text. A signed or formatted number in a numeric column (-2%, +2,500,000) stays a number. An amount grouped with
  spaces is flagged, because a spreadsheet pastes it as text.
- **Print and dates.** Pages are landscape, and the audit tables are not clipped. The print rule is scoped to the audit
  page, so the Analysis print is unchanged. The flags list prints in full, and rows are not split across pages. Tick
  dates use the reviewer's local date.
- **Evals.** Five checks were added:
  - the derived rows are compared with the oracle;
  - every in-use, not-used and display-only status is checked metamorphically;
  - fourteen error-routing cases are checked by exact set equality;
  - ticks are checked to follow their row;
  - footing is checked in both views, on rows with sub-cent parts.

  The status check requires a real model input to move for a field marked in use, and footing is compared exactly.
  Mutations M19–M24 cover the new mechanisms.

## Verification
Final tree (after all three review rounds):

| Check | Result |
|---|---|
| Unit tests (`npm test -- --run`) | 329 passed, 1 skipped |
| Lint (`npm run lint`) | clean |
| Quick eval (`node evals/run.mjs --quick`) | 674/674 checks, 32,726 assertions |
| Full eval, seed 20260927 (`results/pass4.json`) | 676/676 checks, 215,786 assertions |
| Hold-out eval, seed 4242, 2,000 scenarios (`results/holdout4.json`) | 678/678 checks, 285,606 assertions |
| Mutation testing (`results/mutation.json`, baseline green) | 24/24 caught by the evals and 24/24 by the unit tests |

Browser check (Chromium, production build, reviewer time zone America/Los_Angeles):
- Ticking the first of two identical rows left the second unverified. Editing the ticked twin hid its tick without
  passing it to the other; undoing the edit brought it back.
- Export JSON saved the tick by content, and Import JSON put it back on the same row.
- Changing a ticked household value showed "1 tick hidden"; undoing it brought the tick back.
- The tick date was the reviewer's local date. In an earlier run at 17:00 Pacific it was 2026-09-28 while UTC was
  already 2026-09-29.
- A burn share typed as 1 raised the "% typed as decimal" flag and the tab badge.
- The filtered view stated its row counts on screen and in the print header.
- The CSV download starts with the UTF-8 byte-order mark.
- Printed to PDF at Letter size, the audit came out as five landscape pages: all 18 register columns fit, the totals
  row sits under the rows, and no row splits across pages.
- With the unverified legacy table selected, the warning banner prints on the first landscape page. The Analysis
  page still prints portrait.
- The Clear ticks confirmation appeared only when clicked. Ticking another row, unticking, or Reset disarmed it, and
  it did not come back by itself. Focus moved to Confirm when armed and back to Clear ticks on Cancel.
- A typed FMV of $12,345,678,901.23 kept its cents in the typed totals row and in the control totals.
- A negative federal rate was flagged on the federal rate only. An FMV typed as "3 000 000" raised the space-grouping
  flag.
- There was no page-level horizontal scroll at 390 px and no console errors.

## Limits
- Flags are heuristics for the common slips. A wrong but plausible number is caught only by the control totals or the
  line-by-line tick. False positives are cheap by design: the message explains, and the value is not changed.
- Ticks are per asset row or per household field. The reviewer is free-text initials, not an authenticated sign-off.
- An asset tick's fingerprint is a 32-bit FNV-1a hash of the row's typed values. It detects edits, not deliberate
  tampering with a saved file.
- No bulk import from Excel yet: a "paste assets" import in the register's column order is the natural next step.
