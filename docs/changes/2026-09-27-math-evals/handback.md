# Handback — math evals and fixes
Date: 2026-09-27. Branch: `claude/charming-euler-ekiy6n`. Findings: [`findings.md`](findings.md). Plan: [`plan.md`](plan.md).
Method: [`evals/README.md`](../../../evals/README.md).

## Result

| | Pass 1 (as found) | Pass 2 (fixed) | Hold-out (fixed, unseen seed 4242) |
|---|---|---|---|
| Scenarios evaluated | 1,515 (1 rejected) | 1,516 (0 rejected) | 2,016 (0 rejected) |
| Checks passing | 351 / 396 (88.6%) | **398 / 398** | **400 / 400** |
| Assertions passing | 162,521 / 167,297 | **168,001 / 168,001** | **222,650 / 222,650** |
| Scenarios with any failure | 754 (49.8%) | **0** | **0** |
| Blocked (cannot run here) | — | 1 (SSA table provenance) | 1 |

Pass 2 has three more checks (the F7 shrinking-estate switch probe) and one fewer (the SSA provenance check moved to
BLOCKED instead of failing); none was removed or loosened, and the neutral-swap identity now also runs for r_E < 0.
The first pass-2 run surfaced F6 (one scenario, $0.09) — fixed, then pass 2 was re-run from scratch.

Every UI control was exercised through the app's own pipeline: 58 control cases covering all 47 inputs and toggles
(plus the "exclusion fully used in {year}" shortcut), each on a state where it must move the
result and, where it applies, one where it must not; every moved state re-checked against the oracle.

## What changed
- `src/engine/ingModel.js` — F1 liquidation fix.
- `src/engine/fedTax.js` — F2 §1015(d)(6) per Reg. §1.1015-5(c).
- `src/engine/idgtModel.js` — F6 tie rule; F7 neutral profile via `neutralSwapProfile`.
- `src/engine/validate.js` — `neutralSwapProfile` (F7), used by the engine and validation.
- `src/engine/ranking.js`, `constants.js` — F4 `RANK_EFFICIENCY_SIGNIFICANT_DIGITS`.
- `src/hooks/computeModel.js` (new) — the pipeline as a pure function; `useIdgtModel` memoises it.
- `src/hooks/settingsActions.js` (new) — F5 `toggleSwapCustom`.
- `src/components/…` — F3 tile and methodology text; F5 switch wiring and default-profile text; two hints.
- Tests: `src/engine/__tests__/evalFindings.test.js`, `src/hooks/__tests__/computeModel.test.js` (each fails on the
  pre-fix code — checked by stashing the fixes); `evals/evals.test.js` (quick suite in `npm test`); Fixture I5 golden
  values updated.
- Contracts: v1 model.md §2 and §6, ING model.md §3 amended in place with dated notes; both reference scripts corrected
  (their outputs are unchanged except I5).
- `evals/` — oracle, scenarios, graders, runner, README; `npm run eval`.

## Verification
- `npm run lint` clean; `npm test -- --run`: 230 passed, 1 skipped (the mortality checksum test, skipped until the table
  is verified); `npm run build` clean.
- Browser (Vite preview, Chromium): the deathbed tile reads "swap in the death year where feasible; beats the best fixed
  year" on the defaults; with a 9.3% state rate, switching "Customise the consideration" on seeds 100 / 0 / 6.0120240481 /
  50.1 and NPV(s\*) stays $1.82M with no non-neutral warning; no console errors. Screenshots in `screenshots/`.

## Needs the builder
1. **Confirm the corrected I5 golden values** (ingGolden.test.js, already marked "awaiting builder confirmation"): year-1
   value 1,060,761.154856 by hand (HC09), NPV 14,910.938545, feeNet −18,141.914643 — reproduced by the corrected
   reference script and the clean-room oracle.
2. **Unblock the mortality check:** allow `www.ssa.gov` in the environment's network settings, then load the published
   l_x column and set `MORTALITY_TABLE_META.verified`. Until then, probability-weighted NPVs rest on an unverified table;
   the assumed-death-year mode does not. *Done 2026-09-27: the builder supplied the published SSA 2023 table, which is
   now the verified default ([life-tables handback](../2026-09-27-life-tables/handback.md)).*
3. Decide whether heirs' NIIT should become its own input (plan.md, "Not changed").
