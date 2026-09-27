# Model contract: ING trust versus IDGT — comparison module (v2 §N)
Extends `docs/changes/2026-09-26-idgt-rebuild/model.md` (v1 gift ledger) in the same notation. Date: 2026-09-27.
Status: revision 2 (2026-09-27) after the adversarial design review (plan.md "Design-review corrections");
implementation contract for `src/engine/ingModel.js`, `src/engine/breakeven.js` and the `burnShare`
extension of `src/engine/idgtModel.js`.

## 0. Question answered

For one asset, is an **ING** (incomplete non-grantor trust — NING/DING/WING: an *incomplete gift* for
transfer tax and a *non-grantor trust* for income tax, sitused in a state that levies no fiduciary income
tax on it) better for heirs than the **IDGT** gift already modelled, and **how much of the IDGT's income-tax
burn must the grantor actually bear** for the IDGT to break even with the ING?

The two structures trade three things (everything else is held identical by running both on the v1 ledger):

| | IDGT (v1 GIFT[s]) | ING (new scenario n) |
|---|---|---|
| Transfer tax | completed gift: adjusted taxable gift U_g, exclusion U_c, gift tax G (§2001(b), §2502(c)) | incomplete gift (Reg. §25.2511-2(b) retained testamentary limited power; (c) retained non-fiduciary lifetime power over enjoyment): U_g = U_c = G = 0 |
| Estate at death | trust excluded; only swapped-back assets and §2035(b) add-back are included | the **entire** trust, accumulated income included, at V^n_t (§2038(a)(1): property subject to the retained testamentary power at death; §2036(a)(2); Commissioner v. Estate of O'Malley, 383 U.S. 627 (1966)) |
| Basis at death | no §1014 in trust (Rev. Rul. 2023-2); carryover §1015 | §1014(b)(9) step-up on the included property |
| Income tax payer | grantor, §§671–677: "tax burn" paid from the other estate | the trust itself (§641): §674(a) and §677(a) are avoided by the §672(a) adverse-party distribution committee, the grantor's HEMS power over principal by §674(b)(5)(A), and §675 by omitting administrative powers — in particular no §675(4)(C) substitution power |
| Income tax rate | grantor's stack τ_ord / τ_cg (federal + **home state** + NIIT) | trust's stack τ^n_ord / τ^n_cg (federal top bracket + NIIT + the **state rate the trust actually bears** — 0 only for intangibles in a no-tax situs; see §1) |
| Swap power | §675(4)(C), modelled (s*) | none (a substitution power would make it a grantor trust) |

Everything the IDGT gains comes from *exclusion* (freeze, burn) and costs the *step-up*; everything the
ING gains comes from the *rate differential* on income the trust actually realises, and it keeps the
step-up because it stays in the estate. The module measures both on the same heir-wealth ledger and finds
the breakevens.

## 1. New inputs (engine takes decimals; UI converts from %)

| Symbol | Engine field | UI field (`settings`) | Default | Notes |
|---|---|---|---|---|
| φ | `burnShare` | `burnShare` | 1 | share of the IDGT's income tax (on trust income) that the **grantor** bears; 1 − φ is reimbursed by the trustee from trust assets under a discretionary clause (Rev. Rul. 2004-64, Situation 3). φ = 1 reproduces v1 exactly. |
| τ^n_fed | `ingFedOrd` | `ingFedOrd` | 0.37 | trust's federal ordinary rate. Trust brackets are compressed (§1(e)): the top rate is reached at $15,650 of taxable income for 2025 (Rev. Proc. 2024-40; ≈ $16,000 for 2026 — M, not re-fetched), so a flat top rate overstates the trust's federal ordinary tax by at most ≈ $2,000 a year, plus ≈ $600 for applying NIIT below the §1411(a)(2) threshold (≈ $2,600 in total), and the flat 20% overstates the tax on a year-S gain by at most ≈ $1,300 once (§1(h) 0%/15% trust brackets). Exact for an ESBT's S-portion (§641(c)(2)(A)). |
| τ^n_fcg | `ingFedLtcg` | `ingFedLtcg` | 0.20 | trust's federal long-term capital-gain rate (§1(h)). |
| τ^n_st | `ingStateRate` | `ingStateRate` | 0 | state income-tax rate the ING itself **actually bears**. 0 is correct only for income that only the situs state could tax — dividends, interest, gain on stock or on an entity interest with no business situs — when the trust is sitused in NV, WY, SD or AK (or DE with no resident beneficiaries). Enter a non-zero rate when (i) the asset produces income sourced to a taxing state (rental or operating income; apportioned pass-through income): the source state taxes a non-resident trust regardless of situs (e.g. N.Y. Tax Law §631; Cal. R&TC §17951 — H on the proposition); or (ii) the grantor is domiciled in a state that defines a *resident trust* by the grantor's domicile when the trust became irrevocable and taxes the trust itself on all its income (reported for CT, IL, PA, MN, NE, OH, VT, VA, DC, WI — M on the list; due-process limits apply: North Carolina Dept. of Revenue v. Kaestner, 588 U.S. ___ (2019); Fielding (Minn. 2018); Linn (Ill. App. 2013); McNeil (Pa. Cmwlth. 2013)). New York and California grantors are handled by the flag below, not by this rate. The input panel carries these three conditions as a permanent hint. |
| — | `ingStateTaxOnGrantor` | `ingStateTaxOnGrantor` | false | **home state taxes the grantor on the ING's income as if it were a grantor trust** — New York (Tax Law §612(b)(41), tax years from 2014) and California (Rev. & Tax. Code §17082, SB 131, tax years from 2023). When true the grantor pays σ_ord / σ_cg on the trust's income and gains **from E** (§3); the trust's own stack is unchanged. The ING's rate saving then vanishes and the state tax becomes a grantor-level burn. |
| NIIT | `niit` | (existing `niit`) | 0.038 | the grantor panel's NIIT rate passed a second time, un-summed, so the trust stacks can be built (v1 folds it into τ_ord / τ_cg). Trusts are subject to §1411 above the top-bracket threshold (§1411(a)(2)(B)(ii)). |
| c | `ingAdminRate` | `ingAdminRate` | 0 | annual administration cost of the ING as a fraction of trust value (corporate trustee at the situs). Charged at year-end on the opening value; **not** deducted for income tax (conservative for the ING; §67(e) costs are in fact deductible). When the fee exceeds the after-tax yield the shortfall is funded by liquidating a slice of the holding with pro-rata basis and a taxable gain (§3). |
| σ_ord, σ_cg | `stateOrd`, `stateCg` | (existing `stateOrd`, `stateLtcg`) | 0.05, 0.05 | the state components already inside τ_ord and τ_cg, passed separately so the breakeven solver can vary the grantor's state rate. |

Derived trust rates: τ^n_ord = τ^n_fed + niit + τ^n_st ; τ^n_cg = τ^n_fcg + niit + τ^n_st. Grantor-level state tax on the
ING: σ^g_ord = σ_ord and σ^g_cg = σ_cg when `ingStateTaxOnGrantor`, else 0. τ_ord = fedOrd + σ_ord + niit and
τ_cg = fedLtcg + σ_cg + niit are passed unchanged as in v1.

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
HOLD uses V^b throughout: incl^b_t = V^b_t f, TE^b = E^b + incl^b, SU^b = τ_bene (V^b − incl^b) v^k, H^b = E^b + V^b − ET^b −
SU^b. Level A: ΔTW_t = (E^s_t + swapped_t·V^s_t + T_t) − (E^b_t + V^b_t); ΔET and ΔSU as v1. Level B as v1 with
T_t = W_t if swapped else V^s_t, and **one amendment to v1 §7**: b2 = b1 − (T_t − f_sw,t·T^self_t) with
f_sw,t = f if swapped_t else 1, so that the discount-at-death haircut on the consideration (W_s = f·V^s_s
against an undiscounted T^self_s) is carried by Resid, where v1 §7 assigns "discount-at-death inclusion",
and not by Burn. No accepted golden value moves (Fixtures A–H never combine `discountAtDeath` with a swap).
Engine: the swap consideration, incl^s, SU^s, H^s and TW^s read V^s; incl^b, SU^b, H^b and TW^b read V^b —
v1's shared `V`/`incl` split in two. With this, Burn_t ≡ 0 at φ = 0 for every s, and for 0 < φ < 1 the
**burn** component measures exactly the part of gross compounding the grantor still funds. The
**residual** component also carries the location effect of tax paid from the trust (V^s compounds at
g + y, E at r_E), which is not a tax benefit. Warning `BURN_REIMBURSED` whenever φ < 1: a constant
reimbursed fraction every year is the pattern Rev. Rul. 2004-64's implied-understanding caveat
describes, and the ruling's safe harbour also requires that state law not expose the trust to the
grantor's creditors because of the power (§2036(a)(1) otherwise); the model does not price that risk.

## 3. ING scenario (superscript n)

The ING is funded at t = 0 with the asset (FMV, basis B_0). Nothing is a gift; the other estate is
untouched for the whole projection; the trust pays its own income tax and costs from its assets; it is
included in the gross estate and stepped up at death.

```
E^n_t = E^n_{t−1}(1+r_E) − σ^g_ord Y^n_t − σ^g_cg (gainS_t + gainL_t)     # E^n_0 = E_0; under `ingStateTaxOnGrantor` the grantor pays
                                                                        # the home-state tax on the ING's income and gains from E;
                                                                        # otherwise σ^g = 0 and E^n_t = E_0 (1+r_E)^t — no burn,
                                                                        # no gift tax, no consideration
Y^n_t = y_t V^n_{t−1} ;  Tax^n_t = τ^n_ord Y^n_t ;  Fee_t = c V^n_{t−1} ;  V^pre_t = V^n_{t−1}(1+g_t) + Y^n_t
D_t = Y^n_t − Tax^n_t − Fee_t
if D_t ≥ 0:   V^n_t = V^pre_t − Tax^n_t − Fee_t ;  B^n_t = B^n_{t−1} + D_t ;  gainL_t = 0
else (fee funded by liquidating L_t = −D_t of the holding; Reg. §1.61-6(a) pro-rata basis):
              gainL_t = L_t · max(0, 1 − B^n_{t−1}/V^pre_t) ;  CGL_t = τ^n_cg gainL_t
              B^n_t = B^n_{t−1} (1 − L_t / V^pre_t) ;  V^n_t = V^pre_t + D_t − CGL_t          # B^n_t ≥ 0 always
Sale at t = S:  gainS_S = max(0, V^n_S − B^n_S) ; CG^n_S = τ^n_cg gainS_S ; V^n_S −= CG^n_S ; B^n_S := V^n_S ; after S the (g_r, y_r)
                rates apply (gainS_t = 0 when t ≠ S; the sale follows the liquidation step within the year)
Death at end of t:
    incl^n = V^n_t f ;  TE^n = E^n_t + incl^n ;  ET^n = τ_e max(0, base^b(TE^n, t))     # base^b: no adjusted taxable gift
    SU^n   = τ_bene (V^n_t − incl^n) v^k                                              # §1014(b)(9): basis steps to the included value
    H^n    = E^n_t + V^n_t − ET^n − SU^n ;  ΔH^n_t = H^n_t − H^b_t ;  PV^n_t = DF_t ΔH^n_t
NPV^n = Σ_t q_t PV^n_t
Invariants: B^n_t ≥ 0 and V^n_t > 0 for every t (§8 guarantees the value factor stays positive).
```
No swap; no §2035(b) add-back (no gift tax); annual exclusions and the valuation discount play no
transfer-tax role at funding (the discount still governs the inclusion value at death through f, exactly
as in HOLD). No distributions are made (accumulation trust: DNI never carries out to the grantor or any
beneficiary in a taxing state). Post-death growth over the k years cancels as in v1.

## 4. ING decomposition (exact, every year)

Three counterfactual trust paths, all starting at (FMV, B_0), all following §3's recursion with the sale
rule, differing only in the rate and fee:

- V^{same}: the trust pays from itself the part of the grantor's own rates that the grantor no longer pays,
  (τ_ord − σ^g_ord, τ_cg − σ^g_cg), with c = 0 (the E-side σ^g burn is the shared E^n path). Equal to v1's
  T^self of the s = none ledger only when G = 0 or S = 0 (T^self starts at basis B^T_0 with the §1015(d)(6)
  bump; V^{same} at B_0, correct for an ING which has no gift tax) and only when σ^g = 0. **V^{same} must be
  computed from (FMV, B_0) by the §3 recursion — never taken from the IDGT ledger's T^self row.**
- V^{rate}: rates (τ^n_ord, τ^n_cg), c = 0.
- V^n: rates (τ^n_ord, τ^n_cg) and the fee c (the ING itself), including any liquidation gain.

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
have the same sign (or either is not finite) returns `{ value: null, reason, fLo, fHi }` with reason =
`IDGT_ALWAYS` when both are < 0, `ING_ALWAYS` when both are > 0 (`UNDEFINED` when not finite); otherwise
bisects until hi − lo ≤ xTol or maxIter (60) and returns `{ value, fAtValue, iterations, fLo, fHi }`.
Each trial re-runs the full v1 swap search (s* re-optimised) and the ING ledger — no fixed-s* shortcut.
The solver never assumes monotonicity: f can be non-monotone (s* jumps; the estate crossing the
exclusion in some death years), so before bisecting it scans a coarse lattice of 11 points, bisects the
first sign change and reports `crossings` = the number of sign changes seen (the UI says "first of n
crossings" when n > 1). The direction of every reading is taken from the signs, never assumed:

1. **Burn share φ\*** — f(φ) = NPV^n − NPV_IDGT(s*(φ); φ) on [0, 1], xTol 1e-4. Usual case
   f(0) > 0 > f(1): *the IDGT beats the ING only while the grantor bears at least φ\* of the trust's income
   tax.* Reverse signs (f(0) < 0 < f(1) — a non-taxable other estate that out-compounds the asset, so
   moving the burn into the estate helps heirs): *only while the grantor bears at most φ\*.*
2. **Grantor's state rate σ\*** — f(σ) with τ_ord' = τ_ord − σ_ord + σ and τ_cg' = τ_cg − σ_cg + σ (the
   state component of both stacks replaced by σ; under `ingStateTaxOnGrantor` σ^g moves with it),
   everything else fixed (the ING's own τ^n_st and the heirs' rates included), on [0, 0.20], xTol 1e-4.
   f(σ) is increasing in the usual case: *the ING beats the IDGT only when the grantor's state rate is at
   least σ\*.*
3. **Other estate E_0\*** — f(E) with E_0 = E on [0, max(3 E_0, 5 X_0)], xTol $1,000. Usual case
   f(0) > 0 > f(hi): *below this estate size the ING wins* (the IDGT's freeze and burn are worth nothing
   while the step-up is still lost).
The result carries `ingWinsAbove = fHi > 0` so the UI composes the sentence from the signs.

## 7. Breakeven grid (for the selected asset only)

Δ_opt evaluated on σ ∈ {0, 0.02, …, 0.14} (8 columns: grantor's state rate, applied to both stacks as in
§6.2) × φ ∈ {1, 0.8, 0.6, 0.4, 0.2, 0} (6 rows: share of the burn the grantor bears). Each cell is a full
evaluation (≈ 2–5 ms; ≤ 0.25 s for the grid). The cell at the input's own (σ_ord, φ) is asserted equal to
the headline Δ_opt when σ_ord = σ_cg and σ_ord is on the grid.

## 8. Validation and warnings

Errors (field-level, never thrown): 0 ≤ φ ≤ 1; 0 ≤ τ^n_fed, τ^n_fcg, τ^n_st, niit < 1 and the summed stacks
τ^n_ord, τ^n_cg < 1; 0 ≤ c < 1; 0 ≤ σ_ord ≤ τ_ord; 0 ≤ σ_cg ≤ τ_cg; and on `ingAdminRate` the ING's value
factor must stay positive: 1 + g + (1 − τ^n_ord) y − c > 0 and, when S > 0, 1 + g_r + (1 − τ^n_ord) y_r − c > 0
(v1's 1 + g + y > 0 does not imply it). The new engine fields are optional (contract defaults when
absent) so v1 fixtures keep validating.
Warnings ({code, data}; text composed in `src/components/warnings.js`):
- `BURN_REIMBURSED` (φ < 1): the constant reimbursed fraction is the pattern the implied-understanding
  caveat of Rev. Rul. 2004-64 describes; the safe harbour also needs state law that keeps the trust out of
  the grantor's creditors' reach; §2036(a)(1) exposure is not priced.
- `ING_NO_STATE_SAVING` (τ^n_st ≥ σ_ord, or `ingStateTaxOnGrantor` with τ^n_fed ≥ fedOrd): the ING bears at
  least the grantor's rate; its only remaining effects are location and cost.
- `ING_FEE_EXCEEDS_YIELD` (c > y (1 − τ^n_ord), or when 0 < S < N also c > y_r (1 − τ^n_ord)): the fee is
  funded by liquidation with pro-rata basis and a taxable gain (§3).
The "0% is only right for intangibles in a no-tax situs" conditions are not a warning (they would fire on
every default asset): they are a permanent hint under the `ingStateRate` field and an assumptions line
on the comparison card whenever τ^n_st = 0 and the flag is off.

## 9. Output shape (pure data)

```
evaluateIng(inp, idgt):  { npv, npvPerFMV, components: {locNet, ssNet, feeNet, stepUp},
                           rows: Row[]  // t, age, q, Xt, Vn, Bn, Yn, taxN, fee, gainL, CGn, Vsame, Vrate, En, inclN, TEn, baseN, ETn, SUn, Hn,
                                        // Hb, dH, dTW, dET, dSU, loc, ss, fee, locNet, ssNet, feeNet, stepUpC, DF, PV, wPV,
                                        // plus dHIdgt (ΔH^{s*}_t) for the crossover
                           vsIdgt: { deltaOpt, deltaNone, verdict, ingLeadsYears: number[], firstIngYear: number|null },
                           warnings: [{code, data}] }
breakevens(inp):         { burnShare: R, stateRate: R, otherEstate: R }
                         with R = { value, fAtValue, iterations, fLo, fHi, crossings, ingWinsAbove } | { value: null, reason, fLo, fHi, crossings, ingWinsAbove }
comparisonGrid(inp):     { stateRates: number[], burnShares: number[], cells: number[][] /* [row φ][col σ] = Δ_opt */, verdicts: string[][] }
```

## 10. Authorities relied on (in addition to v1 §12)

Reg. §25.2511-2(b) (retained testamentary limited power of appointment: remainder incomplete) and (c)
(grantor's sole non-fiduciary lifetime power to shift beneficial enjoyment, e.g. HEMS distributions of
principal: income and principal incomplete); (e) governs whether the consent power held with the
committee is attributed to the grantor; IRC §2038(a)(1) (property subject to the retained power at
death — the testamentary power covers the whole trust, accumulations included), §2036(a)(2); Commissioner
v. Estate of O'Malley, 383 U.S. 627 (1966) (accumulated income included); §1014(b)(9) and Reg.
§1.1014-2(b)(2) (basis of §§2035–2038 property; (b)(2)/(b)(3) do not fit an ING; §1014(e) inapplicable —
the decedent is the transferor); §§641, 1(e), 1(h), 1411(a)(2) (trust income tax and NIIT); §641(c)(2)(A)
(ESBT S-portion at the top rate); §672(a), §674(a), §674(b)(5)(A), §675, §677(a) (non-grantor status:
adverse-party committee for §§674/677, HEMS power under §674(b)(5)(A), no §675 administrative powers —
in particular no §675(4)(C) substitution power); PLRs 201310002–201310006 (NING, 2013) and
201410001–201410010 (DING, 2014) — private rulings, no precedential value (§6110(k)(3)); no ING rulings
issued since about 2020 and INGs on the "under study" no-rule list (Rev. Proc. 2021-3 et seq. — M);
CCA 201208026 (the Service's earlier contrary analysis); N.Y. Tax Law §612(b)(41) (L. 2014 ch. 59; the
resident grantor includes the ING's income) and Cal. Rev. & Tax. Code §17082 (SB 131, Stats. 2023 ch.
55; qualified taxpayer includes the ING's income) — the tax is the grantor's, paid from E; source-state
taxation of non-resident trusts (e.g. N.Y. Tax Law §631; Cal. R&TC §17951) and grantor-domicile
resident-trust definitions (e.g. Conn. Gen. Stat. §12-701(a)(4); 35 ILCS 5/1501(a)(20)(D); 72 P.S.
§7301(s); Minn. Stat. §290.01 subd. 7b — M on the individual citations) with their due-process limits
(Kaestner, 588 U.S. ___ (2019)); Rev. Rul. 2004-64 (the grantor's payment of the trust's tax is not a
gift; discretionary reimbursement causes no inclusion only if (i) there is no express or implied
understanding and (ii) state law does not expose the trust to the grantor's creditors because of the
power; mandatory reimbursement → §2036(a)(1) inclusion of the whole trust); CCA 202352018 (a reimbursement
clause added by modification with beneficiary consent is a gift by the beneficiaries — M); Reg.
§1.61-6(a) (pro-rata basis on a partial liquidation); §67(e) and Reg. §1.67-4 (trust administration
costs — deductibility not modelled).

## 11. Conventions this module adds (each a one-line switch)
N-1 trust pays a flat top federal rate and NIIT from the first dollar (overstates its tax by ≈ $2,600 a
year and ≈ $1,300 once at a sale; exact for an ESBT S-portion); N-2 accumulation trust (no DNI
carry-out); N-3 fee not deductible and charged on opening value; N-4 tax and fee paid from the trust
reduce basis dollar for dollar while covered by the yield; a fee beyond the after-tax yield liquidates a
slice with pro-rata basis and a taxable long-term gain (B^n ≥ 0 always); N-5 the ING's state rate is an
input, not a lookup (no state table) — the NY/CA grantor-level tax is a flag charged to E, source-state
and grantor-domicile taxes are entered as the trust's rate; N-6 φ applies to the trust's income tax on
both the asset and the swapped-in consideration, and to the trust's share of a pre-swap sale; N-7 no
toggling: the IDGT is a grantor trust throughout and the ING a non-grantor trust throughout (a
"toggle-off in year τ" variant — the completed-gift non-grantor trust — is the expert alternative to
both and is listed as deferred with its reasoning); N-8 v1 §7 b2 amended (§2) so Burn ≡ 0 at φ = 0.

## 12. Not modelled (surfaced in the Deferred panel)
Toggle-off of grantor-trust status in a chosen year (completed-gift non-grantor trust); later completion
of the ING gift (release of the retained powers); DNI distributions and state throwback rules (e.g. Cal.
§17745); the trust's compressed brackets and §642(b) exemption; state-by-state fiduciary income-tax
residency rules (the rate is an input); IDGT trustee costs; §2036 risk pricing for reimbursement
patterns; §2702/§2036 exposure of the ING's own committee structure.
