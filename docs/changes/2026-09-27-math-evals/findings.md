# Eval pass 1 — findings on the build as found (main @ 60de7ff)
Date: 2026-09-27. Method: [`evals/README.md`](../../../evals/README.md). Raw results: [`evals/results/pass1.json`](../../../evals/results/pass1.json).

## Scorecard

| Layer | Checks passing | Assertions passing |
|---|---|---|
| L1 hand calculations | 51 / 54 | 51 / 54 |
| L2 oracle agreement | 21 / 55 | 79,040 / 83,325 |
| L3 invariants & theorems | 14 / 15 | 20,641 / 21,072 |
| L4 metamorphic | 31 / 34 | 1,911 / 1,963 |
| L5 UI wiring | 211 / 213 | 60,811 / 60,813 |
| L6 breakevens & data | 23 / 25 | 67 / 70 |
| **Total** | **351 / 396 (88.6%)** | **162,521 / 167,297 (97.1%)** |

1,515 of 1,516 scenarios evaluated (16 personas + 1,500 sweep, seed 20260927); **754 (49.8%) had at least one failing
assertion**. Every failure traces to one of the root causes below. The core v1 IDGT ledger — the §2001(b) "taxable
base" algebra, anti-clawback, §2035(b), prior gifts from any year 2011–2025, gift tax paid, sales, swaps, burn share,
mortality weighting — agreed with the statute-built oracle to the cent on every scenario that did not touch F2.

## Findings (most severe first)

### F1 — Critical: the ING spends its yield cash twice when the fee exceeds the after-tax yield
`src/engine/ingModel.js` `stepTrust`, and the contract it implements (ING model.md §3, revision 2).
When the trustee fee exceeds the after-tax yield (D < 0), the trust spends **all** of the yield cash Y on tax and fee
and sells part of the holding for the rest. The code set `V = V^pre + D − CGL` with `V^pre = V(1+g) + Y`, so the spent
yield Y stayed in the holding. The other branch is `V = V(1+g) + D`: at D = 0 the value jumped up by a full year's yield.
Raising the fee from 1.18400% to 1.18401% raised year-1 trust value by $20,000 (+$70,000 by year 3) on the app's default
asset.

- **Hand check (HC09):** $1M asset, zero basis, 0.5% yield, 1% fee. Cash needed 2,040 + 10,000; yield cash 5,000; the
  7,040 shortfall needs a 9,238.85 slice after 23.8% tax on its gain. V₁ = 1,060,761.15. The engine gave 1,066,284.48.
- **Reach:** 407 / 1,515 scenarios (26.9%) — every ING whose fee exceeds its after-tax yield in any year (low-yield
  growth assets with a 0.5–1.5% corporate-trustee fee).
- **Size (always an overstatement of the ING):** median $28,089 (1.9% of FMV); 90th percentile $1.16M (32.6% of FMV);
  worst case 33× FMV (the error compounds for decades). Persona P08 (CA founder, $6M, 0.8% yield, 1% fee): ING NPV
  overstated by $3.68M.
- **Decisions changed:** the ING-vs-IDGT verdict flipped (ING shown, IDGT correct) in 9 scenarios; 2 of 10 sampled
  estate-size breakevens were placed where the engine's Δ — not the true Δ — changed sign; discontinuity scans found
  jumps in the ING NPV along the fee (27/40 scans), the yield (23/40) and the ING state rate (2/40).
- **Why the existing tests missed it:** Fixture I5's golden values came from `reference/ing-ref.mjs`, which transcribed
  the same contract formula. The reference was independent of the code, not of the derivation.

### F2 — Medium: §1015(d)(6) basis increase computed on the wrong numerator
`src/engine/fedTax.js` `deriveGift`. Net appreciation was taken as U_g − B₀ (taxable gift after annual exclusions).
Reg. §1.1015-5(c) defines it as the **FMV of the gift** less basis, divides by the amount of the gift after the annual
exclusion, and caps the increase at the tax paid. The error is G·A_ex/U_g of basis whenever gift tax is paid and annual
exclusions are applied.
- **Hand check (HC11):** FMV $1M, basis $300k, 10 × $19,000 exclusions, exclusion exhausted: basis should be $580,000
  (300,000 + 324,000 × 700,000 / 810,000); the engine gave $504,000.
- **Reach:** 62 / 1,515 scenarios (4.1%). Trust basis understated by a median $11,007 (max $55,524); IDGT NPV
  understated by a median $479 (worst $15,123), through heirs' capital-gains tax and any trust sale.

### F3 — Medium: the "Deathbed-swap bound — upper bound" tile is false half the time
`src/components/results/AssetDetail.jsx`, Methodology panel, v1 model.md §6. Whenever every swap year was feasible the
tile claimed the deathbed-swap value is an upper bound on the swap strategy. It is not: when the swapped-in cash
(compounding at r_E/(1 − τ_ord) gross, tax paid by the grantor) out-earns the asset, an early swap moves more growth out of
the estate than swapping back at death. **431 of 875 (49.3%)** all-feasible scenarios had deathbed value < NPV(s\*) —
low-growth, bond-like and loss assets especially. The engine's numbers were right; the claim a planner would repeat was
wrong.

### F4 — Low: rank order of proportionally identical assets decided by floating-point noise
`src/engine/ranking.js`. Two assets with the same rates and basis ratio but different size have mathematically equal
NPV per taxable-gift dollar; the documented tie-break is NPV. The engine compared efficiencies exactly, so a 16th-digit
difference (0.3599018245456044 vs …043) ordered them — in the pass-1 portfolio, the $1M asset ranked above the $5M one
under "no swap".

### F5 — High (UI): switching "Customise the consideration" on silently changed every result
`src/components/inputs/SwapProfilePanel.jsx`. The switch only flipped the flag; the four fields kept the app-default
5.535% yield / 45.8% rate, which are return-neutral only at the default 3% growth and 45.8% stack. Switching it on
without typing anything:

| Grantor situation | NPV(s\*) before → after switching on | s\* |
|---|---|---|
| App defaults | $485,988 → $485,984 (the 5.535% is rounded; NON_NEUTRAL_SWAP fires) | 17 → 17 |
| 13.3% state (CA) | $533,076 → $485,984 (−8.8%) | 15 → 17 |
| 9.3% state, 4% other-estate growth | $645,484 → $435,789 (−32.5%) | 8 → 19 |
| No state tax, 5% other-estate growth | $700,786 → $394,890 (−43.7%) | 3 → 22 |

### F6 — Low: swap-year tie rule diverged from its own contract (found in the first pass-2 run)
`src/engine/idgtModel.js` `evaluateAsset`. model.md §8: candidates within 1e-6·|NPV| of the best tie, and the tie goes to
no swap, then the earliest year. The loop replaced the incumbent only when a later year beat it by more than the
tolerance, so a chain of near-ties could walk to a later year (scenario 1152: s = 17…20 within $0.14 on $124k; engine 20,
contract 17). Dollar effect ≤ the tolerance; the reported best year was wrong.

### F7 — Low: a shrinking other estate (r_E < 0) made the neutral consideration a negative yield
`src/engine/idgtModel.js` `resolveSwapProfile`, `validate.js`. With r_E < 0 the default consideration yield is
r_E/(1 − τ_ord) < 0: the grantor "pays" negative tax (collects a refund) on negative income, which no instrument does;
and the same profile entered by hand is rejected ("yield cannot be negative"). Pass 1 showed it as the one scenario
rejected by validation (sweep #1019); it would have become a user-reachable error once F5 seeds the fields.

### F8 — Blocked: the SSA mortality table cannot be verified from this environment
`src/data/mortalityTable.js` is marked UNVERIFIED. `www.ssa.gov` is denied by the environment's network policy, so the
l_x column still cannot be checked against the published table. Plausibility passes (radix 100,000, monotone, male
e₆₅ inside the SSA range). Probability-weighted results depend on it; the assumed-death-year mode does not.

## Verified correct (no change needed)
- §2001(b)/(c) flat-rate reduction versus the full bracket computation with period-by-period §2505 credits, including
  prior gifts measured at their own year's exclusion (§2001(g)(2)), gift tax paid on prior gifts, 35%/45% rate and
  $7M/$13.99M exclusion scenarios, negative indexing — 0 differences above $0.01.
- Anti-clawback (Reg. §20.2010-1(c)), §2035(b) three-year window, §1015 carryover, §1014 step-up and the discount-at-death
  inclusion, Rev. Rul. 85-13 swap mechanics and liquidity feasibility, trust sale with grantor-paid gain tax, burn
  share φ on the asset, consideration and sale, NY/CA grantor-level state tax on the ING.
- Basic exclusion table 2011–2026 matches the revenue procedures.
- Economic theorems the model satisfies (useful to planners): in an estate that is taxable in every death year in both
  worlds, the gift's NPV does not depend on the other estate's size, the exclusion, its indexing or prior gifts; when a
  scheduled sale happens in both worlds with the same basis, the grantor's capital-gain rate cancels.

## Grader calibration (errors in the eval, not the calculator)
Fixed before pass 1 was recorded, and listed so the scorecard can be trusted:
1. Six controls expected the ING NPV to move with IDGT-only settings (swap profile, burn share). The ING is measured
   against keeping the asset, so it correctly does not.
2. Seven controls were first exercised on states where they cannot matter (the always-taxable default estate; a sale in
   both worlds). They are now exercised on a straddling estate or a trust-only sale, and the invariance itself is a check.
3. The first "did it move" test used exact equality and read 1e-10 floating-point noise as movement; it now uses the
   money tolerance.
4. The neutral-custom-swap identity was skipped for r_E < 0 in pass 1 (it could not be entered); after F7 it runs for
   every scenario.
