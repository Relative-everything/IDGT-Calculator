# IDGT Asset Analyzer

Ranks candidate assets for a gift to an **intentionally defective grantor trust (IDGT)** by the
probability-weighted, discounted gain in heir wealth versus keeping the asset until death, and finds
the best year to exercise the §675(4)(C) swap power. Federal transfer tax, 2026 law (OBBBA:
$15,000,000 basic exclusion, indexed after 2026). Live at
https://relative-everything.github.io/IDGT-Calculator/.

Illustrative planning model — not tax, legal or investment advice.

## What it computes

For each asset and each possible year of death, one simulator runs two worlds year by year:

| | Keep (baseline) | Gift to IDGT (optional swap in year *s*) |
|---|---|---|
| Asset | in the estate, §1014 step-up at death | in the trust, §1015 carryover basis (Rev. Rul. 2023-2) |
| Income tax on its yield | grantor pays, from the other estate | grantor pays, from the other estate (§§671–677) |
| Estate tax | on other estate + asset, less the full exclusion | on other estate + adjusted taxable gift (§2001(b)), flat 40% above the exclusion |
| Swap at end of year *s* | — | asset back in the estate (stepped up); cash-like consideration in the trust (Rev. Rul. 85-13, 2008-22) |

NPV = Σ over death years of P(death in year t) × discount factor × (heirs' wealth with the gift −
heirs' wealth without it). The five reported components — freeze, tax burn, gift tax, residual,
step-up — are read off the same ledger and sum exactly to the NPV. Assets are ranked by NPV per
dollar of taxable gift value (exclusion-equivalent consumed), with the optimal swap year by default.

Full contract: [`docs/changes/2026-09-26-idgt-rebuild/model.md`](docs/changes/2026-09-26-idgt-rebuild/model.md).
Why the previous builds were wrong and what changed: [`plan.md`](docs/changes/2026-09-26-idgt-rebuild/plan.md)
and [`handback.md`](docs/changes/2026-09-26-idgt-rebuild/handback.md) in the same folder.

## ING trust comparison
For every asset the ranking also shows the NPV of placing it in an **ING** (incomplete non-grantor trust —
NING/DING/WING) instead, and which vehicle leaves heirs more. The ING is a third world on the same ledger:
no gift and no exclusion used; the trust pays its own income tax (federal top rates + NIIT + the state rate it
actually bears) and its trustee cost; it stays in the estate and is stepped up at death (§1014(b)(9)).

- **Burn share** (IDGT input): the share of the trust's income tax the grantor actually pays; the trustee
  reimburses the rest under a discretionary clause (Rev. Rul. 2004-64). 100% reproduces v1 exactly.
- **Comparison card** (selected asset): ING minus IDGT at its best swap year and with no swap; a bridge
  from the IDGT's five components to the ING's four (location, state-rate saving, administration cost,
  step-up); heir-wealth gain by year of death for both; three breakevens — the burn share the grantor must
  bear, the grantor's state rate, and the other-estate size at which the two tie — and a state-rate ×
  burn-share grid with the frontier drawn. Each reading states which side the ING wins on.
- **What it usually shows:** in a clearly taxable estate the IDGT's freeze dominates any state-tax
  saving, so no burn share or state rate up to 20% makes the ING win; the breakevens bind near or below
  the exclusion (e.g. a pre-sale business with a $12M other estate and a 13.3% state: the IDGT wins only
  while the grantor bears at least ≈ 15% of the burn).
- New York and California tax the grantor on an ING's income (N.Y. Tax Law §612(b)(41); Cal. R&TC §17082):
  a switch charges that tax to the grantor, and the ING then saves no state tax.

Contract: [`docs/changes/2026-09-27-ing-comparison/model.md`](docs/changes/2026-09-27-ing-comparison/model.md).
Golden values for this module are hand-derived and reproduced by an independent reference script, but
**not yet confirmed by the builder** (see that folder's `plan.md` and `handback.md`).

## Life tables and married couples
- **Life table** (grantor panel): the **SSA 2023 period life table from the 2026 Trustees Report** is the default —
  loaded from the published page the builder supplied (`docs/sources/`: PDF with its SHA-256, a double-extracted CSV,
  the extraction script), all 720 published values checked. The engine uses the published one-year death rates and
  closes the table at age 120. A registry (`src/data/lifeTables/`) holds every table with its source, check date and a
  verification flag; the older 2021 column remains selectable only to reproduce earlier results and is flagged
  unverified in the app. Adding a table is one data file and one registry entry.
- **Married** switch: the estate tax falls at the **second** death. Each pair of death years (grantor, spouse) is
  valued: if the spouse dies first, the spouse's estate passes to the grantor tax-free and the spouse's unused
  exclusion (DSUE) ports to the grantor; if the grantor dies first, everything passes to the spouse (§2056), only a
  §2035(b) gift-tax add-back is taxed (interrelated with the marital deduction), the grantor's DSUE — reduced by the
  exclusion the gift used — ports to the spouse, the grantor's assets are stepped up, and the IDGT stops being a grantor
  trust (the burn and the swap power end at the grantor's death). The ledger shows rows by the year of the second
  death; the grantor panel shows each life expectancy and the second death's. Inputs: spouse's age and sex, assumed
  death years, the portability election, the spouse's prior taxable gifts.
- **Stated limits** (in-app Methodology): independent lives; a period table (no mortality improvement); general
  population rates — wealthier clients live longer (Chetty et al., JAMA 2016), which shifts value to later death
  years; no gift-splitting, community-property double step-up, QTIP/credit-shelter drafting or remarriage.

Contract: [`docs/changes/2026-09-27-life-tables/model.md`](docs/changes/2026-09-27-life-tables/model.md); plan and
handback in the same folder. Married-couple golden values are hand-derived and reproduced by the clean-room oracle —
**awaiting builder confirmation**.

## Inputs audit
The **Inputs audit** tab (next to Analysis; bookmark `#audit`) lists every input as bare data for checking against the
source documents, which matters when many assets are keyed in from a spreadsheet or a balance sheet:
- **Asset register** laid out like a sheet (columns A–R, one row per asset, a totals row), shown **as typed** or **as
  the model reads it** (percentages as decimals: Excel stores 7% as 0.07). Derived columns: unrealized gain, gift value
  after discount, taxable gift, share of the total. Each asset has a free-text **Source ref** (e.g. "Excel B7",
  "eMoney · Schwab …1234") that is never used in the math.
- **Control totals** (record count, Σ FMV, Σ basis, Σ gain, Σ taxable gift, …) to compare with the source's column
  totals, and a **balance-sheet tie-out**: other estate + Σ candidates, to compare with the client's net worth.
- **Household register**: every other input with a stable reference (`G.age`, `E.otherEstate`, `S.burnShare`), its
  unit, and whether the model uses it (and why not), plus the derived rate stacks.
- **Flags** for the usual keying slips: a percentage typed as a decimal (0.07, or 1 for a 100% share), a decimal comma
  ("3,5" would be read as 35%), points or irregular commas as digit grouping, amounts or a whole schedule that look
  like thousands, duplicate names or figures, basis above value, and every validation error on exactly the fields
  behind it (an error on a rate stack shows on every rate in the stack). A slip in a field the model does not use at
  present is listed as "confirm".
- A **tick** per row. It stays with its row and certifies the row's content: it is hidden as soon as anything in the
  row changes or the row goes out of use (it returns if the change is undone), it never passes to an identical row,
  and only live ticks are saved with Export JSON, with the reviewer's initials. **Copy asset table** (tab-separated, to paste beside the source), **Download
  audit CSV** (same columns and letters; money totals foot the cents shown on each row), **Print** (landscape), and
  **Full width** for long lists.
The eval suite checks on every scenario that the values the page shows are exactly the engine's inputs.
[Plan and handback](docs/changes/2026-09-28-inputs-audit/).

## Inputs that matter most
Life table, grantor age/sex (or an assumed death year) — and for a married couple the spouse's age/sex, the
portability election and the spouse's prior gifts — other estate and its after-tax growth, basic exclusion
and indexing, prior taxable gifts **and the year they were made**, tax-rate stacks (grantor ordinary
and capital-gain; heirs' capital-gain incl. NIIT), per asset: FMV, basis, appreciation, yield,
valuation discount, annual exclusions, a scheduled sale year with post-sale returns. Model settings
expose the conventions (return-neutral reinvestment, cash-like consideration, discount-at-death
inclusion, whether a scheduled sale also happens when the asset is kept).

## Verification status
- **Eval suite** (`npm run eval`, method in [`evals/README.md`](evals/README.md)): a clean-room oracle built from the
  statute (full §2001(c) brackets, period-by-period §2505 credits, anti-clawback, DSUE and the interrelated marital
  deduction) and a lot-based cash-flow ledger — with a pair-by-pair ledger for married couples — 29 hand calculations,
  invariants, metamorphic and discontinuity scans, the life table checked value by value against its source, and every
  UI control driven through the app's pipeline: 27 client personas plus a 1,500-scenario stratified sweep (≈ 45%
  married couples), all code-graded. On 2026-09-27 it found seven defects in the single-life build
  ([findings](docs/changes/2026-09-27-math-evals/)) and, after life tables and married couples were added, three more
  plus a ledger-clarity gap ([handback](docs/changes/2026-09-27-life-tables/handback.md)); all fixed. Latest
  (2026-09-29, with the inputs audit page): 676/676 checks and 215,786/215,786 assertions, 678/678 on an unseen seed;
  mutation testing — 23 injected defects, each caught by the eval suite and by the unit tests independently
  ([table](evals/README.md#mutation-testing--grading-the-suite-node-evalsmutationmjs)).
- Engine: golden fixtures A–H (hand-derived, builder-confirmed 2026-09-26), §2001(c) cross-check
  against the bracket schedule, model invariants (decomposition sums, Σq = 1, neutrality, swap
  properties), input-wiring test — `npm test`.
- ING comparison: Fixtures I and J plus machine rows (reference-derived, awaiting builder
  confirmation; I5 corrected 2026-09-27 for the liquidation fix), a bit-identity test proving the burn-share extension leaves every v1 ledger row
  unchanged at 100%, decomposition invariants, and breakeven tests that check the verdict flips across
  each root.
- **Mortality: verified.** The default life table is the SSA 2023 period table (2026 Trustees Report), loaded from
  the published page the builder supplied and checked value by value (`docs/sources/`, `src/data/lifeTables/`). The
  legacy 2021 column is still selectable and is flagged UNVERIFIED in the app. The assumed-death-year mode is
  independent of the table.
- Exclusion amounts and rates: sources and confidence in `src/data/`.

## Roadmap
The execution plan for everything below — phased, sized per session, with prerequisites, model
extensions, golden-value gates and a kickoff prompt — is [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Not modelled (deferred)
Installment sale, GRAT, SLAT, state estate/inheritance tax, Table 2010CM / §7520 products, UHNW
mortality adjustment, spousal mortality dependence, gift-splitting (§2513), community property (§1014(b)(6)),
QTIP/credit-shelter drafting, remarriage, Monte Carlo, promissory-note swap consideration, GST tracking,
multi-asset joint optimisation, PDF/Excel export; for the ING comparison, toggling grantor-trust status off
(completed-gift non-grantor trust), later completion of the ING gift, DNI distributions and throwback, a
state fiduciary-tax table, compressed trust brackets, and the legal risk of reimbursement clauses. Reasons are shown in-app under "Not modelled in
this version".

## Development
```
npm ci
npm run dev        # Vite dev server
npm test           # vitest (includes a quick run of the eval suite)
npm run eval       # full eval suite: engine vs clean-room oracle on 1,500+ client scenarios
npm run lint       # eslint
npm run build      # production build to dist/
```
Deploy: every push runs lint, tests and the build ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml));
a push to `main` also publishes `dist/` to GitHub Pages through the source set under Settings →
Pages → Build and deployment, with no settings change needed:
- **Deploy from a branch**, `gh-pages` / (root) (the setting as of 2026-09-27): CI commits the build
  to `gh-pages` and requests a Pages build.
- **GitHub Actions**: CI deploys the build directly. Skip the workflow templates that page suggests;
  a template would publish the unbuilt repository root.

Any other source fails the "Pages source" job on every push. After deploying, CI checks that the live
page is this build. Redeploy by hand: Actions → Build and deploy → Run workflow on `main`.

Stack: React 19, Vite 8, Tailwind CSS 4, Vitest. No server, no localStorage; scenarios move as JSON
files and the ranking exports as CSV.

Layout: `src/engine/` pure calculation (cites its authorities inline; `ingModel.js` and `breakeven.js` for the
ING comparison) · `src/data/` static tables
with provenance · `src/hooks/` state → engine · `src/components/` UI only.
