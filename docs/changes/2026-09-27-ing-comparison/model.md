# Model contract: ING trust versus IDGT — comparison module (v2 §N)
Extends `docs/changes/2026-09-26-idgt-rebuild/model.md` (v1 gift ledger) in the same notation. Date: 2026-09-27.
Status: DRAFT for adversarial design review; becomes the implementation contract for
`src/engine/ingModel.js`, `src/engine/breakeven.js` and the `burnShare` extension of `src/engine/idgtModel.js`.

## 0. Question answered

For one asset, is an **ING** (incomplete non-grantor trust — NING/DING/WING: an *incomplete gift* for
transfer tax and a *non-grantor trust* for income tax, sitused in a state that levies no fiduciary income
tax on it) better for heirs than the **IDGT** gift already modelled, and **how much of the IDGT's income-tax
burn must the grantor actually bear** for the IDGT to break even with the ING?

The two structures trade three things (everything else is held identical by running both on the v1 ledger):

| | IDGT (v1 GIFT[s]) | ING (new scenario n) |
|---|---|---|
| Transfer tax | completed gift: adjusted taxable gift U_g, exclusion U_c, gift tax G (§2001(b), §2502(c)) | incomplete gift (Reg. §25.2511-2(b), (e)): U_g = U_c = G = 0 |
| Estate at death | trust excluded; only swapped-back assets and §2035(b) add-back are included | trust **included** at V^n_t (§2036(a)(2) / §2038(a)(1): retained testamentary and consent powers) |
| Basis at death | no §1014 in trust (Rev. Rul. 2023-2); carryover §1015 | §1014(b)(9) step-up on the included property |
| Income tax payer | grantor, §§671–677: "tax burn" paid from the other estate | the trust itself (§641; §672(a) adverse-party distribution committee defeats §§674, 675, 677) |
| Income tax rate | grantor's stack τ_ord / τ_cg (federal + **home state** + NIIT) | trust's stack τ^n_ord / τ^n_cg (federal top bracket + NIIT + **situs state rate, normally 0**) |
| Swap power | §675(4)(C), modelled (s*) | none (a substitution power would make it a grantor trust) |

Everything the IDGT gains comes from *exclusion* (freeze, burn) and costs the *step-up*; everything the
ING gains comes from the *rate differential* on income the trust actually realises, and it keeps the
step-up because it stays in the estate. The module measures both on the same heir-wealth ledger and finds
the breakevens.

## 1. New inputs (engine takes decimals; UI converts from %)

| Symbol | Engine field | UI field (`settings`) | Default | Notes |
|---|---|---|---|---|
| φ | `burnShare` | `burnShare` | 1 | share of the IDGT's income tax (on trust income) that the **grantor** bears; 1 − φ is reimbursed by the trustee from trust assets under a discretionary clause (Rev. Rul. 2004-64). φ = 1 reproduces v1 exactly. |
| τ^n_fed | `ingFedOrd` | `ingFedOrd` | 0.37 | trust's federal ordinary rate. Trust brackets are compressed (§1(e)): the top rate is reached at roughly $15,000–16,000 of taxable income (Rev. Proc. 2024-40 for 2025 — M confidence, not re-fetched), so a flat top rate overstates the trust's tax by at most about $2,000 a year. |
| τ^n_fcg | `ingFedLtcg` | `ingFedLtcg` | 0.20 | trust's federal long-term capital-gain rate (§1(h)). |
| τ^n_st | `ingStateRate` | `ingStateRate` | 0 | state income-tax rate the ING **actually bears** at its situs (NV, WY, SD, AK; DE for non-resident beneficiaries: 0). A grantor resident in New York (Tax Law §612(b)(41), 2014) or California (Rev. & Tax. Code §17082, SB 131, 2023) is taxed on the ING as if it were a grantor trust — enter the home-state rate and the ING benefit vanishes. |
| c | `ingAdminRate` | `ingAdminRate` | 0 | annual administration cost of the ING as a fraction of trust value (corporate trustee at the situs). Charged at year-end on the opening value; **not** deducted for income tax (conservative for the ING; §67(e) costs are in fact deductible). |
| σ_ord, σ_cg | `stateOrd`, `stateCg` | (existing `stateOrd`, `stateLtcg`) | 0.05, 0.05 | the state components already inside τ_ord and τ_cg, passed separately so the breakeven solver can vary the grantor's state rate. |

Derived trust rates: τ^n_ord = τ^n_fed + NIIT + τ^n_st ; τ^n_cg = τ^n_fcg + NIIT + τ^n_st, where NIIT is the grantor
panel's rate (trusts are subject to §1411 at the top-bracket threshold, §1411(a)(2)).

## 2. IDGT extension — partial tax burn (φ)

v1 assumed the grantor pays all of the trust's income tax from E. With φ < 1 the trust pays (1 − φ) of it
from its own assets, so the trust's value path V^s diverges from the HOLD path V^b. §4 of v1 becomes:

```
HOLD (unchanged):   Y^b_t = y_t V^b_{t−1} ; V^b_t = V^b_{t−1}(1+g_t) + Y^b_t ; E^b_t = E^b_{t−1}(1+r_E) − τ_ord Y^b_t ; B^b_t += Y^b_t
GIFT, before the swap (trust holds the asset):
    Y^s_t   = y_t V^s_{t−1} ;  Burn_t = τ_ord Y^s_t
    V^s_t   = V^s_{t−1}(1+g_t) + Y^s_t − (1−φ) Burn_t          # the reimbursed part leaves the trust
    B^s_t   = B^s_{t−1} + Y^s_t − (1−φ) Burn_t                  # only the net reinvested cash adds basis
    E^s_t   = E^s_{t−1}(1+r_E) − φ Burn_t
GIFT, after the swap (grantor owns the asset; trust holds the consideration W):
    Y^s_t   = y_t V^s_{t−1} ; V^s_t = V^s_{t−1}(1+g_t) + Y^s_t ; B^s_t += Y^s_t     # grantor is the owner: full tax from E
    YW_t = y_sw W_{t−1} ; BurnSw_t = τ_sw YW_t ; W_t = W_{t−1}(1+g_sw) + YW_t − (1−φ) BurnSw_t ; WB_t += YW_t − (1−φ) BurnSw_t
    E^s_t   = E^s_{t−1}(1+r_E) − τ_ord Y^s_t − φ BurnSw_t
Sale at t = S, trust still holds the asset:  CG^s = τ_cg max(0, V^s_S − B^s_S) ; E^s_S −= φ CG^s ; V^s_S −= (1−φ) CG^s ; B^s_S := V^s_S
Sale at t = S after a swap:                    CG^s from E^s in full (owner); B^s_S := V^s_S
Swap at t = s: cons = V^s_s · f (f = 1−δ if discountAtDeath else 1); feasibility as v1 (E^s_s ≥ cons; s < S)
Death:  incl^s = V^s_t f ; TE^s = E^s + swapped·incl^s + add2035 ; SU^s = τ_bene BIG v^k + swapped·τ_bene (V^s − incl^s) v^k
        H^s = E^s + swapped·V^s + T − ET^s − SU^s   with T = W if swapped else V^s, TB = WB if swapped else B^s
T^self (v1 §4) is unchanged: the trust that pays its own tax at the grantor's rates. With φ = 0 and no swap,
V^s_t = T^self_t exactly, so the Level B burn component is exactly zero. With φ = 1, V^s ≡ V^b and every v1
golden value is reproduced bit for bit.
```
Level A/B (v1 §7) are unchanged in form. Two consequences to state in the UI: the **burn** component now
measures only the part of gross compounding the grantor still funds; the **residual** component also
carries the location effect of tax paid from the trust (V^s compounds at g + y, E at r_E), which is not
a tax benefit. Warning `BURN_REIMBURSED` whenever φ < 1: a pattern of reimbursement can evidence an
implied agreement and pull the trust into the estate (Rev. Rul. 2004-64; §2036(a)(1)); the model does
not price that risk.

## 3. ING scenario (superscript n)

The ING is funded at t = 0 with the asset (FMV, basis B_0). Nothing is a gift; the other estate is
untouched for the whole projection; the trust pays its own income tax and costs from its assets; it is
included in the gross estate and stepped up at death.

```
E^n_t = E_0 (1+r_E)^t                                             # no burn, no gift tax, no consideration
Y^n_t = y_t V^n_{t−1} ;  Tax^n_t = τ^n_ord Y^n_t ;  Fee_t = c V^n_{t−1}
V^n_t = V^n_{t−1}(1+g_t) + Y^n_t − Tax^n_t − Fee_t
B^n_t = B^n_{t−1} + Y^n_t − Tax^n_t − Fee_t                       # net cash reinvested adds basis (approximation when Fee > net yield: documented)
Sale at t = S:  CG^n = τ^n_cg max(0, V^n_S − B^n_S) ; V^n_S −= CG^n ; B^n_S := V^n_S ; after S the (g_r, y_r) rates apply as in v1
Death at end of t:
    incl^n = V^n_t f ;  TE^n = E^n_t + incl^n ;  ET^n = τ_e max(0, base^b(TE^n, t))     # base^b: no adjusted taxable gift
    SU^n   = τ_bene (V^n_t − incl^n) v^k                                              # §1014(b)(9): basis steps to the included value
    H^n    = E^n_t + V^n_t − ET^n − SU^n ;  ΔH^n_t = H^n_t − H^b_t ;  PV^n_t = DF_t ΔH^n_t
NPV^n = Σ_t q_t PV^n_t
```
No swap; no §2035(b) add-back (no gift tax); annual exclusions and the valuation discount play no
transfer-tax role at funding (the discount still governs the inclusion value at death through f, exactly
as in HOLD). No distributions are made (accumulation trust: DNI never carries out to the grantor or any
beneficiary in a taxing state). Post-death growth over the k years cancels as in v1.

## 4. ING decomposition (exact, every year)

Three counterfactual trust paths, all starting at (FMV, B_0), all following §3's recursion with the sale
rule, differing only in the rate and fee:

- V^{same}: rates (τ_ord, τ_cg) — the grantor's own rates — and c = 0. Identical to v1's T^self before a swap.
- V^{rate}: rates (τ^n_ord, τ^n_cg), c = 0.
- V^n: rates (τ^n_ord, τ^n_cg) and the fee c (the ING itself).

```
Level A:  ΔTW^n = (E^n + V^n) − (E^b + V^b) ;  ΔET^n = ET^b − ET^n ;  ΔSU^n = SU^b − SU^n ;  ΔH^n = ΔTW^n + ΔET^n + ΔSU^n
Wealth split:   Loc = (E^n − E^b) + (V^{same} − V^b)        # the same tax paid from the trust instead of the estate
                SS  = V^{rate} − V^{same}                    # state (and bracket) rate differential, compounded inside the trust
                Fee = V^n − V^{rate}
Estate-tax attribution on counterfactual bases (base^b is affine in TE; f as above):
                c0 = base^b(TE^b_t, t)
                c1 = c0 + (E^n − E^b) + (V^{same} − V^b) f
                c2 = c1 + SS f
                c3 = c2 + Fee f                              # = base^b(TE^n_t, t) exactly
LocNet = Loc − τ_e[(c1)⁺ − (c0)⁺] ;  SSNet = SS − τ_e[(c2)⁺ − (c1)⁺] ;  FeeNet = Fee − τ_e[(c3)⁺ − (c2)⁺] ;  StepUp = ΔSU^n
LocNet + SSNet + FeeNet + StepUp = ΔH^n_t   (exact; component NPVs use Σ q_t DF_t (·) and sum to NPV^n)
```
Reading: in a fully taxable estate SSNet = (1 − τ_e)·SS — the ING's benefit is the after-estate-tax
value of the income tax it saves. Loc is a pure compounding-location effect (it is not a tax benefit and
is usually negative when g + y(1−τ) > r_E because the tax is drawn from the faster-growing pool). StepUp
is zero unless `discountAtDeath` is on (both worlds step up).

## 5. Comparison

- Δ_opt = NPV^n − NPV(s*) ; Δ_none = NPV^n − NPV(none). Verdict: `ING` if Δ_opt > tol, `IDGT` if Δ_opt < −tol,
  else `tie`, with tol = SWAP_TIE_TOLERANCE·max(1, |NPV(s*)|) (v1 §8 tolerance).
- Per death year: ΔH^n_t against ΔH^{s*}_t (IDGT with its optimal fixed swap year). The UI plots both;
  the engine reports the set of years in which the ING leads and the first such year.
- ING efficiency: the ING consumes no exclusion, so NPV per dollar of taxable gift is undefined; report
  NPV^n / FMV and the IDGT's NPV(s*) / FMV side by side. The ranking (v1 §9) is unchanged — it answers
  which asset should receive exclusion; the ING column answers whether this asset should receive any.

## 6. Breakevens (engine/breakeven.js)

Generic bracketing bisection `solveRoot(f, lo, hi, {xTol, maxIter})`: evaluates f(lo), f(hi); if they
have the same sign returns `{ value: null, reason }`; otherwise bisects until hi − lo ≤ xTol or maxIter
(60) and returns `{ value, fAtValue, iterations }`. Each trial re-runs the full v1 swap search (s*
re-optimised) and the ING ledger — no fixed-s* shortcut.

1. **Burn share φ\*** — f(φ) = NPV^n − NPV_IDGT(s*(φ); φ) on [0, 1], xTol 1e-4. `reason` = `IDGT_ALWAYS`
   when f(0) < 0 (the IDGT wins even if the trust pays all of its own tax) or `ING_ALWAYS` when f(1) > 0
   (the ING wins even under full burn). Read: *the IDGT beats the ING only while the grantor bears at
   least φ\* of the trust's income tax.*
2. **Grantor's state rate σ\*** — f(σ) with τ_ord' = τ_ord − σ_ord + σ and τ_cg' = τ_cg − σ_cg + σ (the
   state component of both stacks replaced by σ), everything else fixed (the ING's own τ^n_st and the
   heirs' rates included), on [0, 0.20], xTol 1e-4. `reason` as above.
3. **Other estate E_0\*** — f(E) with E_0 = E on [0, max(3 E_0, 5 X_0)], xTol $1,000. Read: *below this
   estate size the ING wins* (typically because the IDGT's freeze and burn are worth nothing while the
   step-up is still lost).
The solver never assumes monotonicity; it only reports a bracketed root or the sign pattern at the ends.

## 7. Breakeven grid (for the selected asset only)

Δ_opt evaluated on σ ∈ {0, 0.02, …, 0.14} (8 columns: grantor's state rate, applied to both stacks as in
§6.2) × φ ∈ {1, 0.8, 0.6, 0.4, 0.2, 0} (6 rows: share of the burn the grantor bears). Each cell is a full
evaluation (≈ 2–5 ms; ≤ 0.25 s for the grid). The cell at the input's own (σ_ord, φ) is asserted equal to
the headline Δ_opt when σ_ord = σ_cg and σ_ord is on the grid.

## 8. Validation and warnings

Errors (field-level, never thrown): 0 ≤ φ ≤ 1; 0 ≤ τ^n_fed, τ^n_fcg, τ^n_st < 1 and the summed stacks
τ^n_ord, τ^n_cg < 1; 0 ≤ c < 1; 0 ≤ σ_ord ≤ τ_ord; 0 ≤ σ_cg ≤ τ_cg; c + τ^n_ord y_t < 1 + g_t + y_t
(value cannot go negative) is covered by v1's 1 + g + y > 0 rule plus the rate bounds.
Warnings ({code, data}; text composed in `src/components/warnings.js`):
- `BURN_REIMBURSED` (φ < 1): implied-agreement / §2036(a)(1) exposure, not priced.
- `ING_NO_STATE_SAVING` (τ^n_st ≥ σ_ord): the ING bears at least the grantor's state rate; its only
  remaining effects are location and cost.
- `ING_FEE_EXCEEDS_YIELD` (c > y(1 − τ^n_ord) in year 1): the fee is funded by liquidation; the basis
  approximation in §3 applies.

## 9. Output shape (pure data)

```
evaluateIng(inp, idgt):  { npv, npvPerFMV, components: {locNet, ssNet, feeNet, stepUp},
                           rows: Row[]  // t, age, q, Xt, Vn, Bn, Yn, taxN, fee, Vsame, Vrate, En, inclN, TEn, baseN, ETn, SUn, Hn,
                                        // Hb, dH, dTW, dET, dSU, loc, ss, fee, locNet, ssNet, feeNet, stepUpC, DF, PV, wPV,
                                        // plus dHIdgt (ΔH^{s*}_t) for the crossover
                           vsIdgt: { deltaOpt, deltaNone, verdict, ingLeadsYears: number[], firstIngYear: number|null },
                           warnings: [{code, data}] }
breakevens(inp):         { burnShare: R, stateRate: R, otherEstate: R }   with R = { value, fAtValue, iterations } | { value: null, reason, fLo, fHi }
comparisonGrid(inp):     { stateRates: number[], burnShares: number[], cells: number[][] /* [row φ][col σ] = Δ_opt */, verdicts: string[][] }
```

## 10. Authorities relied on (in addition to v1 §12)

Reg. §25.2511-2(b), (e) (incomplete gift: retained testamentary limited power of appointment; lifetime
power exercisable with the consent of a committee of adverse parties); IRC §2036(a)(2), §2038(a)(1)
(inclusion of the ING in the gross estate); §1014(b)(9) (basis of property included in the gross
estate); §§641, 1(e), 1(h), 1411(a)(2) (trust income tax and NIIT); §672(a), §674, §675, §677
(non-grantor status through an adverse-party distribution committee); PLRs 201310002–201310006 (NING,
2013) and 201410001–201410010 (DING, 2014) — private rulings, no precedential value (§6110(k)(3));
CCA 201208026 (the Service's earlier contrary analysis); N.Y. Tax Law §612(b)(41) (2014) and Cal. Rev. &
Tax. Code §17082 (SB 131, 2023) — home states that tax an ING as a grantor trust; Rev. Rul. 2004-64
(discretionary reimbursement of the grantor's income tax; §2036(a)(1) if mandatory or by understanding);
§67(e) and Reg. §1.67-4 (trust administration costs — deductibility not modelled).

## 11. Conventions this module adds (each a one-line switch)
N-1 trust pays a flat top federal rate (compressed brackets ignored); N-2 accumulation trust (no DNI
carry-out); N-3 fee not deductible and charged on opening value; N-4 fee/tax paid from the trust
reduces basis dollar for dollar; N-5 the ING's state rate is an input, not a lookup (no state table);
N-6 φ applies to the trust's income tax on both the asset and the swapped-in consideration, and to the
trust's share of a pre-swap sale; N-7 no toggling: the IDGT is a grantor trust throughout and the ING a
non-grantor trust throughout (a "toggle-off in year τ" variant — the completed-gift non-grantor trust —
is the expert alternative to both and is listed as deferred with its reasoning).

## 12. Not modelled (surfaced in the Deferred panel)
Toggle-off of grantor-trust status in a chosen year (completed-gift non-grantor trust); later completion
of the ING gift (release of the retained powers); DNI distributions and state throwback rules (e.g. Cal.
§17745); the trust's compressed brackets and §642(b) exemption; state-by-state fiduciary income-tax
residency rules (the rate is an input); IDGT trustee costs; §2036 risk pricing for reimbursement
patterns; §2702/§2036 exposure of the ING's own committee structure.
