# Fix plan — eval findings F1–F8
Date: 2026-09-27. Input: [`findings.md`](findings.md). Status: implemented; results in [`handback.md`](handback.md).

Order: correctness of numbers a planner acts on first (F1, F2), then statements the UI makes about them (F3, F5), then
determinism (F4, F6), then corners (F7). Every fix follows the same gate:
1. a hand calculation or a closed form for the corrected behaviour, written before the code change;
2. a regression test that **fails on the pre-fix code** and passes after (verified by stashing the fix);
3. the full eval suite at 100% on the development seed **and** on an unseen seed;
4. `npm run lint`, `npm test`, `npm run build` clean; the UI checked in a browser for UI changes.

| # | Severity | Root cause | Fix | Files | Golden values that move | Verification |
|---|---|---|---|---|---|---|
| F1 | Critical | ING liquidation branch kept the spent yield cash in the holding; no gross-up for the slice's own gain | V = H − X with H = V(1+g), X = L/(1 − τ_cg·a), a = max(0, 1 − B/H); basis pro-rata on H. Branches now meet at D = 0 | `engine/ingModel.js`; ING model.md §3 amended; `reference/ing-ref.mjs` corrected and `ing-ref.out` regenerated | Fixture I5 only: NPV 22,528.62 → 14,910.94; feeNet −10,524.24 → −18,141.91 (locNet, ssNet unchanged). Year-1 value pinned to the hand calc 1,060,761.15 | HC09; `evalFindings.test.js` F1 (value, continuity at the threshold, NPV non-increasing in the fee); L4 continuity scans; L2 ING rows |
| F2 | Medium | §1015(d)(6) net appreciation taken on U_g instead of FMV of the gift; no cap at the tax paid | BT0 = B₀ + min(G, G·max(0, FMV(1−δ) − B₀)/U_g) | `engine/fedTax.js`; v1 model.md §2 amended; both reference scripts | None (no fixture combines gift tax with annual exclusions; Fixtures E and F re-asserted) | HC11; `evalFindings.test.js` F2 (formula, cap, E/F unchanged); L2 BT0 and downstream ledger |
| F3 | Medium | UI and contract called the deathbed-swap value an upper bound | Tile renamed "Deathbed-swap value"; sub-line states whether it beats the best fixed year; Methodology panel and model.md §6 corrected | `components/format.js` (`deathbedNote`), `results/AssetDetail.jsx`, `panels/MethodologyPanel.jsx`, v1 model.md §6 | None (display only) | L3 "tile text is true" on every scenario; `evalFindings.test.js` F3 (a scenario where an early swap wins) |
| F4 | Low | Exact float comparison of equal efficiencies | Efficiencies rounded to 12 significant digits (`RANK_EFFICIENCY_SIGNIFICANT_DIGITS`) before comparison, so equal ones fall to the NPV tie-break; rounding keeps the comparator transitive | `engine/ranking.js`, `engine/constants.js` | None | L5 portfolio ranking (both keys); `evalFindings.test.js` F4 (the pair that misordered) |
| F5 | High (UI) | "Customise the consideration" switch kept stale default field values | `toggleSwapCustom` seeds the neutral profile for the current rates on switch-on (12 significant digits); switch-off keeps the values. The pipeline exposes `swapRates` and `neutralSwap` | `hooks/settingsActions.js` (new), `hooks/computeModel.js`, `inputs/SwapProfilePanel.jsx`, `ModelSettingsPanel.jsx`, `App.jsx` | None | L5 controls "switched on at non-default rates / shrinking estate — must stay neutral"; `computeModel.test.js` F5; browser check (9.3% state: $1.82M before and after, no warning) |
| F6 | Low | Running "replace if better by > tol" instead of the contract's tie rule | Two passes: find the best NPV, then the first candidate (no swap, then earliest year) within tolerance of it; the chosen year is re-simulated for display | `engine/idgtModel.js` | None (Fixture C's three-way tie still picks year 1) | L2 s\* and ING Δ(best swap); full suite on both seeds |
| F7 | Low | Neutral consideration for r_E < 0 was a negative yield (tax refund on negative income), and rejected when typed in | `neutralSwapProfile`: for r_E < 0 the neutral holding depreciates at r_E with no income (after-tax return still exactly r_E) | `engine/validate.js`, `engine/idgtModel.js`, `hooks/computeModel.js`, `SwapProfilePanel.jsx` text; oracle and reference scripts | None (all fixtures have r_E ≥ 0) | L4 neutral-custom identity now runs for every r_E; `computeModel.test.js` F7; 0 validation rejections on both seeds |
| F8 | Blocked | SSA table unverifiable: `www.ssa.gov` denied by the environment network policy | No change. The eval reports the check as BLOCKED (never a pass) until `MORTALITY_TABLE_META.verified` is set from the published table | — | — | Unblock: add `www.ssa.gov` to the environment's allowed domains, load table4c6 for the period year, set `verified: true` and the checksum ages |

Supporting changes:
- **The app's pipeline is now a pure function** (`hooks/computeModel.js`), memoised by `useIdgtModel`. The evals and
  tests call exactly what the app runs instead of a copy of the hook body.
- **Two UI hints now state existing conventions:** after a scheduled sale both worlds earn the post-sale rates
  (return-neutral), whether or not the family would have sold; the heirs' NIIT toggle adds the NIIT rate entered in the
  Grantor panel.
- **CI:** `evals/evals.test.js` runs the quick suite inside `npm test` (≈ 9 s); `npm run eval` runs the full sweep.

Not changed, by decision:
- The flat top-bracket trust rates (N-1), fee not deductible (N-3), and return-neutral post-sale rates in both worlds are
  documented conventions. The eval confirms they are implemented as stated; changing them is a modelling choice, not a
  fix.
- The heirs' NIIT stays tied to the Grantor-panel NIIT rate (now stated in the hint). If a grantor is not subject to NIIT
  (e.g. material participation) but the post-death trust would be, add 3.8% to the heirs' state LTCG field; a separate
  heirs' NIIT input is a small follow-up if wanted.
