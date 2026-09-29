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
| Flags | Percent typed as a decimal (0.07, or 1 for a 100% share), decimal comma ("3,5" read as 35), irregular comma or point grouping, amounts or a whole schedule that look like thousands, duplicate names or figures, basis above value, sale after the horizon, and every validation error on each field that feeds it. Worst first, each with its reference; a slip in a field not in use is a "confirm" |
| Ticks | One per row. A tick records what it certified (the typed value, or a fingerprint of the asset row, numbered when rows are identical). It is hidden as soon as anything in the row changes and returns if the change is undone. Live ticks and reviewer initials are saved with Export JSON |
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
A five-lens adversarial review (97 agents, two skeptics per finding) raised 46 findings: 39 upheld, 4 split, 3 refuted.
All 39 upheld and all 4 split findings were fixed, most importantly:
- **Identical rows shared one tick.** Ticking one of two identical rows verified both. Tick keys now carry an occurrence
  number, so a double entry needs its own tick.
- **The totals row did not foot the cells shown.** Totals are now summed in whole cents of the rounded lines, so SUM()
  over a pasted column equals the totals row exactly.
- **Errors landed on the wrong field.** An error on a rate stack now shows on every rate in it; a prior-gift year with no
  exclusion on file is reported on the year; the ING value-factor error names its asset.
- **Paste and CSV hardening.** A leading quote can no longer start a formula or merge the pasted table; cells holding
  `;` are quoted for semicolon-locale Excel; numeric-looking source refs stay text.
- **Print and dates.** Tables are no longer clipped on paper; the flags list prints in full; tick dates are the
  reviewer's local date, not UTC.
- **Evals.** Derived rows, in-use statuses (metamorphically), error routing, twin ticks and footing are now checked on
  every fifth scenario; mutations M19–M21 cover the new mechanisms.

## Verification
| Check | Result |
|---|---|
| Unit tests (`npm test -- --run`) | 310 passed, 1 skipped |
| Lint (`npm run lint`) | clean |
| Quick eval (`node evals/run.mjs --quick`) | 673/673 checks, 32,681 assertions |
| Full eval, seed 20260927 (`results/pass4.json`) | 675/675 checks, 215,481 assertions |
| Hold-out eval, seed 4242, 2,000 scenarios (`results/holdout4.json`) | 677/677 checks, 285,201 assertions |

Browser check (Chromium, production build, reviewer time zone America/Los_Angeles):
- Ticking the first of two identical rows left the second unverified; progress rose by one.
- The tick date was the local date (2026-09-28) while UTC was already 2026-09-29.
- Changing a ticked value showed "1 tick hidden"; undoing it brought the tick back; Export JSON saved only live ticks.
- A burn share typed as 1 raised the "% typed as decimal" flag and the tab badge.
- The filtered view stated its row counts on screen and in the print header.
- The CSV download starts with the UTF-8 byte-order mark.
- Printed to PDF at Letter size: six landscape pages, all 18 register columns on the page, no row split across pages.
- No page-level horizontal scroll at 390 px; no console errors.

## Limits
- Flags are heuristics for the common slips. A wrong but plausible number is caught only by the control totals or the
  line-by-line tick. False positives are cheap by design: the message explains, and the value is not changed.
- Ticks are per asset row or per household field. The reviewer is free-text initials, not an authenticated sign-off.
- A tick certifies a row's content, so a row re-entered with exactly the content of a deleted ticked row shows as
  verified.
- No bulk import from Excel yet: a "paste assets" import in the register's column order is the natural next step.
