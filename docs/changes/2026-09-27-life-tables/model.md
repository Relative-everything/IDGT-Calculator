# Model contract: selectable life tables and married couples (second-death estate tax)
Extends `docs/changes/2026-09-26-idgt-rebuild/model.md` (v1) and `docs/changes/2026-09-27-ing-comparison/model.md` in the
same notation. Date: 2026-09-27. Status: implemented in this change; golden values hand-derived (evals/scenarios/handcalc.js
HC-M*) and reproduced by the clean-room oracle — awaiting builder confirmation.

## 0. Why "joint lives" is more than a second-to-die distribution

For a married grantor the family's estate-tax event is normally the **second** death: at the first death everything
passes to the survivor under the unlimited marital deduction (§2056) and the first spouse's unused exclusion ports to
the survivor (§2010(c)(2)(B), (c)(4)). But the IDGT's own mechanics end at the **grantor's** death, whichever death that
is: grantor-trust status ends (the tax burn stops and the trust pays its own tax), the §675(4)(C) swap power ends, and the
grantor's assets are stepped up (§1014). Feeding a last-survivor distribution into the single-life ledger would let the
burn and the swap run until the second death and tax the estate at the grantor's death without the marital deduction or
the DSUE — wrong on four counts. This contract therefore models each pair of death years explicitly.

## 1. Life tables (registry)

`src/data/lifeTables/index.js` lists every table with provenance, `verified`, checksums and a `basis`:
- **SSA 2023 period life table, 2026 Trustees Report** (`ssa-2023-tr2026`, default, verified). Basis `q`: survivors are
  derived from the one-year death probabilities, l₀ = 100,000, l₍ₓ₊₁₎ = lₓ(1 − qₓ), with closure at the terminal age 120
  (l₁₂₀ := 0: everyone alive at 119 dies within that year; the published q₁₁₉ = 0.926604 is replaced by 1). The
  published survivor column is rounded to whole lives and is used only as a checksum.
- **SSA 2021 period (legacy, unverified)** (`ssa-2021-legacy`). Basis `l`; closed at the first zero, as in v1. Kept only
  to reproduce earlier results; the UI flags it.

Death-year probabilities for a life aged x are unchanged from v1 §3: q_t = (l₍ₓ₊ₜ₋₁₎ − l₍ₓ₊ₜ₎)/lₓ, t = 1..N, N = ω − x.

## 2. Two lives

Inputs (engine; the UI converts): `married` (default false); spouse `ageSpouse`, `lxSpouse` (or `deathYearOverrideSpouse`
in deterministic mode — both override years are then required); `portability` (default true); the spouse's prior
adjusted taxable gifts `PS` and the basic exclusion of the year they were made `XPS` (default 0 and X₀).

- **J-1 Independence.** The two lives are independent draws from the chosen table (grantor's sex column, spouse's sex
  column): P(T_G = i, T_S = j) = q^G_i · q^S_j. This is the standard actuarial assumption for joint-life functions built
  from single-life tables (the IRS computes two-life §7520 factors the same way). Spousal mortality dependence is not
  modelled.
- **J-2 Year of the second death** t_L = max(i, j); its distribution q^L_t = Σ_{max(i,j)=t} q^G_i q^S_j sums to 1;
  N_L = max(N_G, N_S). Computed as q^G_t q^S_t + q^G_t F_S(t−1) + q^S_t F_G(t−1) (F cumulative): every term is
  non-negative, so the far tail keeps its relative precision. (The equivalent difference F_G(t)F_S(t) − F_G(t−1)F_S(t−1)
  cancels where both lives are almost surely dead; eval pass 3 measured a 1e-7 relative error in the rows at ages 115+,
  immaterial to NPVs but visible in the ledger. Changed 2026-09-27.)
- **J-3 Same-year deaths** (i = j): the grantor is taken to die first. (Both orders give the same estate-tax base within
  the same year whenever the grantor's exclusion is not exhausted; see §4.)
- **Deterministic mode:** one pair (t_G, t_S) with probability 1. The ledger rows for other years show the pair
  (min(t_G, t), min(t_S, t)) — the same deaths with the second one brought forward to year t (display only, weight 0).

## 3. Ledger for one pair (i, j) — conventions

Everything before the grantor's death is the v1/ING ledger unchanged (burn, burn share φ, swap, sale, T^self).

**Case A — the grantor dies first (i ≤ j).** At the end of year i:
- *Marital deduction (§2056).* Everything the grantor owns passes to the spouse outright: the grantor's taxable estate
  is only what cannot pass — the §2035(b) gift-tax add-back, add2035 = G if i ≤ 3.
- *First-death estate tax* on the grantor's §2001(b) base with TE = add2035: b = base^s(add2035, i) (v1 §2). Because the
  tax is paid out of property that would otherwise pass to the spouse, it reduces the marital deduction
  (§2056(b)(4)(A)) and is itself taxable: ET₁ = τ_e·b/(1 − τ_e) when b > 0, else 0 (flat-rate closed form of the
  interrelated computation). HOLD and the ING have no add-back, so ET₁ = 0 there. ET₁ is paid from E at year-end i.
- *DSUE (portability, §2010(c)(4); Reg. §20.2010-2(c)).* DSUE = min(X_i, AEA_i − (TE₁ + ATG^{DSUE})), floored at 0 and
  set to 0 when `portability` is off, with AEA_i the grantor's anti-clawback exclusion (v1 §2) and ATG^{DSUE} the
  adjusted taxable gifts reduced by the amounts on which gift tax was paid (Reg. §20.2010-2(c)(2)):
  - HOLD / ING: DSUE^b = min(X_i, max(X_i, used_prior) − used_prior)
  - GIFT: DSUE^s = min(X_i, max(X_i, used_prior + U_c) − (add2035 + ET₁ + used_prior + U_c))
  So the gift reduces the DSUE by the exclusion it used (U_c) — the married analogue of the adjusted taxable gift.
- *Step-up at the first death (§1014).* Assets included in the grantor's estate get basis = included value: the HOLD
  asset, the asset swapped back into the grantor's hands, and the ING's property. Trust (IDGT) assets do not
  (Rev. Rul. 2023-2).
- *IDGT becomes a non-grantor trust.* From year i + 1 the trust pays its own income tax on its holding (at τ_ord on the
  asset's yield, τ_cg on a sale) and on the consideration (at τ_sw) from trust assets (**M-6:** the same rate stack the
  grantor paid; a different trust state rate is the ING module's subject). φ no longer applies. The swap power has
  ended.
- *The ING* (**M-9**): its property is included in the grantor's estate (§2038) and is taken to pass to the spouse in a
  marital-deduction form (outright or QTIP through the retained testamentary power), stepped up. From i + 1 it is the
  spouse's asset exactly like the HOLD asset (no fee, no trust tax, no NY/CA grantor-level tax).
- *Years i + 1 … j:* the spouse owns the HOLD asset (and a swapped-back asset) and pays its income tax from E; E grows at
  r_E; a scheduled sale at S happens as in v1 (HOLD only if `saleAppliesToBaseline`; a spouse-owned swapped asset or ING
  property is sold from E; a trust-held asset is sold by the trust, which pays the gain tax).
- *Second death (end of year j).* The spouse's §2001(b) estate tax: base = TE_S + used_prior_S − (max(X_j, used_prior_S)
  + DSUE) with TE_S = E + (spouse-owned assets)·f, where used_prior_S = min(PS, XPS); ET₂ = τ_e·max(0, base). Heirs'
  deferred gain tax: spouse-owned assets are stepped up (to the included value); trust assets carry over.

**Case B — the spouse dies first (j < i).** At the end of year j the spouse's estate passes to the grantor under the
marital deduction (no tax), and the spouse's DSUE ports to the grantor:
DSUE_S = min(X_j, max(X_j, used_prior_S) − used_prior_S) (0 if `portability` is off). Nothing else changes: the grantor
lives on with the burn, the swap power and the ING as in v1. At the grantor's death (end of year i) the v1 valuation
applies with the applicable exclusion increased by DSUE_S: base → base − DSUE_S in HOLD, GIFT and ING alike.

**M-10 Heir wealth and discounting:** H = E + all assets − ET₂ − heirs' gain tax, at the second death, discounted by
v^{t_L}; heirs' gain tax is further discounted by v^k (v1). ET₁ reduced E at the first death and compounds inside E.

## 4. Aggregation, components and outputs

- NPV(s) = Σ_{i,j} q^G_i q^S_j v^{max(i,j)} ΔH_{ij}(s). The swap candidates are s ∈ {none} ∪ {1..N_G}; a swap in year s
  happens only in pairs with i ≥ s (the grantor alive at the end of year s, v1 C-6); feasibility is decided on the
  grantor-alive path exactly as in v1. The tie rule, the deathbed-swap value (swap at the end of the grantor's death
  year where feasible), efficiency and ranking are unchanged in form.
- **Rows are indexed by the year of the second death.** Every row value is its expectation given t_L = t:
  row_t[k] = Σ_{max(i,j)=t} q^G_i q^S_j val_{ij}[k] / q^L_t, with row q = q^L_t and DF = v^t, so every v1 identity holds
  on the rows: NPV = Σ_t q^L_t DF_t ΔH_t, and the components sum to it.
- **Components** (v1 §7) per pair, evaluated on the bases of the estate-tax event that decides the result — the
  grantor's death in case B, the spouse's in case A — with the same counterfactual chain b0 … b4 (b1 = b0 − (T^self −
  U_g), b2 = b1 − (T − f_sw T^self), b3 = b2 − G/τ_e + ΔTW^gt + add2035(i)). In case A the gift's exclusion reaches the
  second-death base through the smaller DSUE, which the chain reproduces; what it cannot attribute — the trust paying its
  own tax after the grantor's death, the first-death tax, DSUE caps — falls in the residual. Sums stay exact.
- The ING's four components follow ING model.md §4 per pair; in case A the three counterfactual trust paths are carried
  past the grantor's death in proportion to the ING property (all three become the spouse's asset at the same step-up).
- Outputs gain `derived.married`, `derived.NG`, `derived.NS`, `derived.expectedGrantorDeathYear`,
  `derived.expectedSecondDeathYear` (= `derived.expectedDeathYear` in married mode) and, on rows, `ageSpouse`,
  `grantorFirst` (probability the grantor died first, given t_L) and `dsue` (expected DSUE, given t_L).

## 5. Validation and warnings
Errors: `ageSpouse` a whole number within the chosen table with survivors (or ≤ 120 in deterministic mode);
`deathYearOverrideSpouse` 1–120 in deterministic mode; PS ≥ 0, XPS ≥ 0; the exclusion must stay ≥ $1,000,000 through
N_L. Warnings: `PORTABILITY_OFF` (the first spouse's unused exclusion is lost), `FIRST_DEATH_TAX` (the §2035(b) add-back
is taxed at the grantor's first death because the grantor's exclusion is exhausted — raised only for a year i ≤ 3 in
which the grantor can die AND the spouse can still be alive, P(T_S ≥ i) > 0; with assumed deaths "spouse year 1, grantor
year 2" the grantor dies second and nothing is taxed at a first death), `SPOUSE_PRIOR_GIFT_TAX` (the spouse's prior
gifts exceeded their exclusion). `ING_FEE_EXCEEDS_YIELD` tests the fee against the yield over the grantor's life only:
the ING passes to the spouse at the grantor's death (M-9) and pays no fee after it. (Both conditions tightened
2026-09-27 after the eval review.)

## 6. Authorities
§2056(a), (b)(4)(A) (marital deduction, net of death taxes payable from the marital share); §2010(c)(2)(B), (c)(4),
(c)(5)(A) and Reg. §20.2010-2(c) (DSUE: lesser of the BEA and the decedent's AEA less taxable estate plus adjusted
taxable gifts, the latter reduced by amounts on which gift tax was paid) and Reg. §20.2010-3 (DSUE of the last deceased
spouse; not indexed); Reg. §20.2010-1(c) (anti-clawback applies to the BEA portion); §1014(a), (b)(9); §§671–677 and
§672(e) (grantor-trust status ends at the grantor's death); §2038 (ING inclusion); §2035(b).

## 7. Limits of the mortality assumption — stated, not modelled
1. **Period, not cohort.** The SSA period table applies 2023 death rates to every future year. SSA's cohort tables,
   which build in projected improvement, give longer lives (for a 65-year-old, roughly one to two years more — medium
   confidence, not re-checked this session).
2. **General population.** Wealth and longevity are strongly linked: Chetty et al., "The Association Between Income and
   Life Expectancy in the United States, 2001–2014", JAMA 315(16), 2016, found a 14.6-year gap for men and 10.1 years for
   women between the top and bottom 1% of income. A UHNW grantor is more likely to die later than this table says, which
   moves value toward later death years (larger freeze and burn, later best swap). A select or annuitant table can be
   added to the registry.
3. Independence (J-1), no remarriage, no gift-splitting (§2513), no community-property double step-up (§1014(b)(6)),
   no QTIP/credit-shelter drafting variants, no simultaneous-death statute (J-3 instead).

## 8. Conventions added (each a one-line switch)
M-1 independence; M-2 grantor first within the same year; M-3 all to the survivor outright (marital deduction), no
credit-shelter trust; M-4 portability elected unless switched off; M-5 first-death tax paid from the marital share
(interrelated); M-6 the post-death IDGT pays tax at the grantor's stack; M-7 the spouse keeps the grantor's sale plan
(S) for spouse-owned assets; M-8 closure of `q`-basis tables at 120; M-9 the ING passes to the spouse in marital form at
the grantor's first death; M-10 heirs value everything at the second death.
