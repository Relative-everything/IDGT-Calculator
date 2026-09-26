# Model contract: IDGT gift heir-wealth ledger (v1)
From: audit workflow (3 designs → judge → 7 verifiers), corrections applied. Date: 2026-09-26.
Status: accepted 2026-09-26 — implementation contract for `src/engine/idgtModel.js`.

## 0. Principles

1. **One simulator, two scenarios.** HOLD (asset stays in the grantor's estate; §1014 step-up at
   death) and GIFT[s] (asset gifted to the IDGT at t = 0; optional §675(4)(C) swap at end of year
   s). Both are run year by year and differ only in where the asset sits. Heir wealth H is
   computed for every possible death year t. NPV is the mortality-weighted, discounted difference.
   No closed-form "benefit" (tax burn, e², freeze) is ever added to NPV; components are derived
   from the ledger and sum exactly to the total (§7).
2. **Return-neutral convention.** In both scenarios the holding reinvests its gross yield and the
   grantor pays the income tax on it out of the other estate E (as owner in HOLD; under §§671–677
   in GIFT). Total pre-tax family wealth then follows the identical path in both scenarios unless
   gift tax is paid or the swap consideration is non-neutral, so the gift's value comes only from
   tax location (estate tax and basis), never from a reinvestment-rate differential.
3. **Flat 40% above the exclusion.** §2001(c) is flat at 40% above $1,000,000 and the unified
   credit absorbs everything below the applicable exclusion (≥ $15,000,000), so federal estate and
   gift tax above the exclusion is exactly τ_e. The engine refuses any X_t < 1,000,000.
4. **Timing.** Gift at t = 0 (start of year 1; calendar year = gift year, default 2026). All other
   events are end-of-year in this order: growth & yield → income-tax burn charged to E →
   scheduled sale (t = S) → swap (t = s) → death valuation (death at end of year t). Heirs'
   deferred capital-gains tax is paid at t + k.
5. **Scope v1.** Federal transfer tax only; mechanism = outright gift; each asset evaluated
   marginally against E_0; gender-specific SSA period life table (provisional) or a deterministic
   death year; no Monte Carlo.

## 1. Inputs (engine takes decimals; UI converts from %)

| Symbol | Input | Default | Notes |
|---|---|---|---|
| x, sex | grantor age, sex | 65, male | l_x lookup; require l_x > 0 |
| τ_ord | fed ordinary + state ordinary + NIIT | 0.37 + 0.05 + 0.038 | tax on yield, both scenarios |
| τ_cg | fed LTCG + state LTCG + NIIT | 0.20 + 0.05 + 0.038 | grantor's tax on a year-S sale gain, both scenarios |
| τ_bene | heirs' fed LTCG + state LTCG + NIIT | 0.20 + 0.05 + 0.038 | tax on un-stepped-up gain (post-death non-grantor trust hits §1411 at $16,000 of undistributed NII); NIIT editable |
| τ_e | federal estate/gift rate | 0.40 | flat above exclusion |
| d | discount rate | 0.04 | v = 1/(1+d); DF_t = v^t |
| π | exclusion indexing rate | 0.02 | X_t = X_0 (1+π)^(t−1) |
| X_0 | basic exclusion amount in the gift year | 15,000,000 | §2010(c)(3) as amended by OBBBA §70106; warn if < 15,000,000 |
| P, X_P | prior adjusted taxable gifts and the BEA of the year they were made | 0, X_0 | "exhausted" shortcut sets P = X_P = BEA of the chosen prior year (table `src/data/exclusionAmounts.js`) |
| E_0 | other estate excluding this asset | 20,000,000 | pays burn, gift tax, swap consideration |
| r_E | other-estate after-tax growth | 0.03 | new input |
| k | years after death until heirs sell | 1 | discounting of heirs' CGT |
| N_disp | max projection years | 35 | display-only truncation of tables/charts |
| FMV, B_0, g, y, δ, S | per asset: undiscounted FMV, basis, appreciation, yield, valuation discount, sale year (0 = never) | 1,000,000 / 200,000 / 0.07 / 0.02 / 0 / 0 | |
| g_r, y_r | post-sale reinvestment growth / yield | 0.06 / 0.015 | apply after year S wherever the proceeds sit |
| b_sw, g_sw, y_sw, τ_sw | swapped-in consideration: basis %, growth, gross yield, grantor rate on its yield | 1, 0, r_E/(1−τ_ord), τ_ord | cash-like and return-neutral by default; a UI warning fires when g_sw + (1−τ_sw)·y_sw ≠ r_E |
| A_ex | annual exclusions applied to this gift | 0 | subtracted from the taxable gift only |
| discountAtDeath | include the interest at V_t(1−δ) at death | false | applies to both scenarios |
| saleAppliesToBaseline | year-S sale also occurs in HOLD | true | |
| deathYearOverride t_D | deterministic mode | none | q_t = 1[t = t_D], N := t_D |

## 2. Derived constants (once per asset)

- U_g = max(0, FMV·(1−δ) − A_ex) — adjusted taxable gift (§2001(b)(1)(B), frozen at gift-date value, §2001(f)); annual exclusions cannot exceed the gift (§2503(b)).
- used_prior = min(P, X_P); R = max(0, X_0 − used_prior); U_c = min(U_g, R) — exclusion consumed.
- G = τ_e · max(0, U_g − R) — gift tax paid from E at t = 0 (tax-exclusive, §2502(c)).
- B^T_0 = B_0 + G · max(0, U_g − B_0)/U_g — trust basis (§1015(a) carryover + §1015(d)(6) increase); B^b_0 = B_0.
- X_t = X_0 (1+π)^(t−1) (2026 fixed at the statutory amount; indexing from 2027; $10,000 round-down ignored — documented).
- Anti-clawback exclusion (Reg. §20.2010-1(c)): AEA^b_t = max(X_t, used_prior); AEA^s_t = max(X_t, used_prior + U_c).
- Taxable-base functions (dollars of base; tax = τ_e·max(0, base)), from §2001(b): tentative tax on
  (TE + adjusted taxable gifts) − gift tax payable on post-1976 gifts (§2001(b)(2), computed with
  the BEA of the gift year, §2001(g)(2)) − applicable credit (§2010):
  - base^b(TE, t) = TE + P − max(0, P − X_P) − AEA^b_t
  - base^s(TE, t) = TE + P + U_g − max(0, P − X_P) − max(0, U_g − R) − AEA^s_t
  - FedTax = τ_e · max(0, base). Under the flat rate the $345,800 constants cancel; the bracket
    schedule is retained only for a cross-check test.

## 3. Mortality and horizon

- Table: `SSA_2021_LX` (provisional; see plan.md flag M1). Engine takes the l_x array as a parameter.
- ω = first age with l = 0 (if none, ω = table length with l_ω := 0 and a warning). N = ω − x.
- q_t = (l_{x+t−1} − l_{x+t}) / l_x for t = 1..N. Σ q_t = 1 within 1e-12; never renormalise.
- Deterministic mode: q_t = 1[t = t_D], N := t_D.
- N_disp truncates the displayed table only; the UI shows "share of |NPV| from years > N_disp".

## 4. Per-year update (t = 1..N; superscript b = HOLD, s = GIFT)

```
(g_t, y_t) = (g, y) if S = 0 or t ≤ S else (g_r, y_r)
Y_t   = y_t · V_{t−1}
V_t   = V_{t−1}(1 + g_t) + Y_t                        # gross yield reinvested, both scenarios
Burn_t = τ_ord · Y_t                                  # paid from E in both scenarios
B^b_t = B^b_{t−1} + Y_t ;  B^s_t = B^s_{t−1} + Y_t      # reinvested yield adds basis
if swapped_{t−1}:                                     # consideration held by the trust
    YW_t = y_sw · W_{t−1} ; W_t = W_{t−1}(1 + g_sw) + YW_t ; WB_t = WB_{t−1} + YW_t ; BurnSw_t = τ_sw · YW_t
    T^self_t = T^self_{t−1} (1 + g_sw + (1 − τ_sw) y_sw)
else:
    y' = (1 − τ_ord) y_t T^self_{t−1} ; T^self_t = T^self_{t−1}(1 + g_t) + y' ; B^self_t += y'
E^b_t = E^b_{t−1}(1 + r_E) − Burn_t                    # E^b_0 = E_0
E^s_t = E^s_{t−1}(1 + r_E) − Burn_t − BurnSw_t         # E^s_0 = E_0 − G
if t = S ≥ 1 (sale follows the holding: trust, or estate after a swap; Rev. Rul. 85-13 grantor pays):
    CG^s = τ_cg · max(0, V_S − B^s_S) ; E^s_S −= CG^s ; B^s_S := V_S
    if saleAppliesToBaseline: CG^b = τ_cg · max(0, V_S − B^b_S) ; E^b_S −= CG^b ; B^b_S := V_S
    if not swapped: T^self_S −= τ_cg · max(0, T^self_S − B^self_S) ; B^self_S := T^self_S
if t = s ≥ 1 (swap, §675(4)(C), Rev. Rul. 85-13 / 2008-22):
    cons = V_s · (1 − δ) if discountAtDeath else V_s
    feasible iff (S = 0 or s < S) and E^s_s ≥ cons ; infeasible s are reported and NOT executed
    W_s = cons ; WB_s = b_sw · cons ; E^s_s −= cons ; swapped := true
    (grantor takes the trust's basis B^s_s in the returned asset)
T_t = W_t if swapped_t else V_t ;  TB_t = WB_t if swapped_t else B^s_t
T^self_0 = FMV ; B^self_0 = B^T_0  (display-only "trust had paid its own tax" counterfactual)
```

## 5. Death at end of year t

```
incl_t = V_t (1 − δ) if discountAtDeath else V_t
HOLD:   TE^b_t = E^b_t + incl_t
        ET^b_t = τ_e · max(0, base^b(TE^b_t, t))
        SU^b_t = τ_bene · (V_t − incl_t) · v^k               # 0 unless discountAtDeath
        H^b_t  = E^b_t + V_t − ET^b_t − SU^b_t
GIFT:   add2035_t = G · 1[t ≤ 3]                            # §2035(b) gross-up (death at end of year 3 counts)
        TE^s_t = E^s_t + swapped_t · incl_t + add2035_t
        ET^s_t = τ_e · max(0, base^s(TE^s_t, t))
        BIG_t  = max(0, T_t − TB_t)                          # no §1014 in trust (Rev. Rul. 2023-2)
        SU^s_t = τ_bene · BIG_t · v^k + swapped_t · τ_bene · (V_t − incl_t) · v^k
        H^s_t  = E^s_t + swapped_t · V_t + T_t − ET^s_t − SU^s_t
ΔH_t(s) = H^s_t − H^b_t ;  PV_t(s) = DF_t · ΔH_t(s)
```
Post-death growth over the k years is excluded in both scenarios (identical, cancels). No burn
after death. For t < s the GIFT ledger has not swapped, so ΔH_t(s) = ΔH_t(none).

## 6. Aggregation

NPV(s) = Σ_{t=1}^{N} q_t · DF_t · ΔH_t(s). Expected death year = Σ q_t · t (display).
Deathbed-swap bound NPV_PF = Σ q_t DF_t ΔH_t(s_t), s_t = t if feasible else none; labelled
"assumes survival to a year-end swap in the year of death — upper bound".

## 7. Decomposition (reported for s = none and s = s*; exact sums)

Level A (identity): ΔTW_t = (E^s_t + swapped_t V_t + T_t) − (E^b_t + V_t); ΔET_t = ET^b_t − ET^s_t;
ΔSU_t = SU^b_t − SU^s_t; ΔH_t = ΔTW_t + ΔET_t + ΔSU_t. Split ΔTW_t = ΔTW^gt_t + ΔTW^sw_t with
ΔTW^gt_t = −G (1+r_E)^t.

Level B (practitioner attribution on counterfactual tax bases; (x)⁺ = max(0, x)):
```
b0 = base^b(TE^b_t, t)                       b4 = base^s(TE^s_t, t)
b1 = b0 − (T^self_t − U_g)                  Freeze_t  = τ_e[(b0)⁺ − (b1)⁺]   # growth removed above the frozen gift value, incl. discount leverage
b2 = b1 − (T_t − T^self_t)                  Burn_t    = τ_e[(b1)⁺ − (b2)⁺]   # grantor paying the trust's income tax
b3 = b2 − G/τ_e + ΔTW^gt_t + add2035_t      GiftTax_t = τ_e[(b2)⁺ − (b3)⁺] + ΔTW^gt_t   # tax-exclusivity net of §2035(b) and lost growth on G
                                             Resid_t   = τ_e[(b3)⁺ − (b4)⁺] + ΔTW^sw_t   # non-neutral swap/sale differential, anti-clawback, discount-at-death inclusion
                                             StepUp_t  = ΔSU_t
Freeze + Burn + GiftTax + Resid + StepUp = ΔH_t  (exact for every t and s)
```
Component NPVs use the same operator Σ q_t DF_t (·) and sum to NPV(s).

## 8. Optimal swap search

Candidates s ∈ {none} ∪ {1..N}; feasibility per §4. s* = argmax NPV(s) with tolerance
|NPV(s) − NPV(best)| ≤ 1e-6·max(1, |NPV|) → prefer none, then smaller s. NPV(s*) ≥ NPV(none).
Inner search computes scalars only; the full ledgers for none and s* are re-simulated for display.
Cost O(N²) per asset (≈ 190 ms for 10 assets × 112 candidates × 111 years).

## 9. Efficiency and ranking

- Eff(s) = NPV(s) / U_g — NPV per dollar of taxable gift value = per dollar of exclusion-equivalent
  consumed (U_c + G/τ_e = U_g). Continuous as R → 0. U_g = 0 (fully covered by annual exclusions):
  Eff is undefined; the asset ranks first if NPV > 0 (it consumes no exclusion) and last otherwise.
- Also displayed: U_c, G, NPV/G when G > 0 ("per dollar of gift tax paid"), NPV/FMV, s*, NPV(none),
  NPV(s*), NPV_PF, expected death year, cumulative exclusion used in rank order (greedy fill).
- Default rank key Eff(s*); toggle to Eff(none).

## 10. Edge-case rules and validation

1. Estate below the exclusion in a death year: ET = 0 both sides; ΔH_t = ΔTW_t + ΔSU_t.
2. Partial crossing is handled year by year by the max(0, ·).
3. Death in year 1: §2035(b) applies; swap only if s = 1.
4. §2035(b) window: add-back for t ≤ 3.
5. Exclusion exhausted: U_c = 0, G = τ_e U_g, §1015(d)(6) bump, ranking continues on NPV/U_g.
6. Valuation discount affects U_g, U_c, G, B^T_0 only; economic value is FMV; consideration = incl_s.
7. B_0 > FMV: BIG floored at 0 (§1015 dual basis; loss basis = U_g); warn "harvest the loss first".
8. Validation: FMV > 0; 0 ≤ δ < 1; 1+g+y > 0; 1+g_r+y_r > 0; 1+g_sw+y_sw > 0 on the resolved profile; r_E > −1;
   P ≥ 0; 0 ≤ τ_ord, τ_cg, τ_bene, τ_sw < 1; 0 < τ_e < 1; d > −1; k ≥ 0; integer S ≥ 0; integer 1 ≤ t_D ≤ 120 and
   age ≤ 120 in deterministic mode; E_0 ≥ 0; X_t ≥ 1,000,000 for every t ≤ N (N = t_D or ω − x); l non-increasing;
   l_x > 0; age within table — all reported as field errors, never thrown.
9. S > N → treated as never (warn); s ≥ S → "post-sale swap not modelled" (excluded, not executed).
10. E^s_t < 0 → warn "grantor cannot fund; consider a discretionary reimbursement clause
    (Rev. Rul. 2004-64)"; arithmetic continues; swap years with E^s_s < cons are infeasible.
11. Floating point: no intermediate rounding; tests assert |Δ| ≤ 0.005 on money, 1e-9 on ratios,
    relative 1e-9 on invariants.

## 11. Output shape (pure data)

```
{ derived: {Ug, R, Uc, G, BT0, N, omega, ySwEffective},
  rows: {none: Row[], opt: Row[]},           // Row = every symbol in §4–§7 for year t
  npvCurve: [{s, npv, feasible, reason}],
  npvNone, npvOpt, sStar, npvPF, eff: {none, opt}, effPerGiftTax, effPerFMV,
  components: {none: {...}, opt: {...}}, expectedDeathYear, shareBeyondDisplay, warnings: [{code, message}] }
```

## 12. Authorities relied on
IRC §§671–677 (grantor pays trust income tax; Rev. Rul. 2004-64), §675(4)(C) (swap; Rev. Rul.
2008-22), Rev. Rul. 85-13 (grantor/grantor-trust transactions disregarded), §1014 / Rev. Rul.
2023-2 (no step-up in trust), §1015(a), (d)(6), §2001(b), (c), (f), (g), §2010(c) as amended by
OBBBA §70106 (P.L. 119-21), Reg. §20.2010-1(c) (anti-clawback), §2035(b), §2502(c), §1411.

## 13. Conventions the builder may overturn (each is a one-line change)
C-1 return-neutral reinvestment; C-2 cash-like neutral consideration; C-3 τ_bene includes NIIT;
C-4 §2035(b) counts t = 3; C-5 gift tax charged at t = 0 (legally due ~15 months later);
C-6 year-of-death swap assumed to precede death; C-7 no $10,000 round-down of X_t;
C-8 post-death growth over k years ignored; C-9 no DSUE input.
