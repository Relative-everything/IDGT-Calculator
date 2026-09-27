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

## Inputs that matter most
Grantor age/sex (or an assumed death year), other estate and its after-tax growth, basic exclusion
and indexing, prior taxable gifts **and the year they were made**, tax-rate stacks (grantor ordinary
and capital-gain; heirs' capital-gain incl. NIIT), per asset: FMV, basis, appreciation, yield,
valuation discount, annual exclusions, a scheduled sale year with post-sale returns. Model settings
expose the conventions (return-neutral reinvestment, cash-like consideration, discount-at-death
inclusion, whether a scheduled sale also happens when the asset is kept).

## Verification status
- **Eval suite** (`npm run eval`, method in [`evals/README.md`](evals/README.md)): a clean-room oracle built from the
  statute (full §2001(c) brackets, period-by-period §2505 credits, anti-clawback) and a lot-based cash-flow ledger,
  13 hand calculations, invariants, metamorphic and discontinuity scans, and every UI control driven through the app's
  pipeline — 16 client personas plus a 1,500-scenario stratified sweep, all code-graded. On 2026-09-27 it found seven
  defects (ING fee liquidation, §1015(d)(6), a false "upper bound" label, the swap-profile switch, ranking ties, the
  swap tie rule, negative-growth consideration); all fixed, 398/398 checks and 168,001/168,001 assertions pass, and
  400/400 on an unseen seed. [Findings, plan and handback](docs/changes/2026-09-27-math-evals/).
- Engine: golden fixtures A–H (hand-derived, builder-confirmed 2026-09-26), §2001(c) cross-check
  against the bracket schedule, model invariants (decomposition sums, Σq = 1, neutrality, swap
  properties), input-wiring test — `npm test`.
- ING comparison: Fixtures I and J plus machine rows (reference-derived, awaiting builder
  confirmation; I5 corrected 2026-09-27 for the liquidation fix), a bit-identity test proving the burn-share extension leaves every v1 ledger row
  unchanged at 100%, decomposition invariants, and breakeven tests that check the verdict flips across
  each root.
- **Mortality table: UNVERIFIED.** `src/data/mortalityTable.js` carries an SSA 2021 period life
  table that could not be checked against ssa.gov from the build environment. Replace it with the
  published l_x column and set `MORTALITY_TABLE_META.verified = true` to enable the checksum test.
  The assumed-death-year mode is independent of the table.
- Exclusion amounts and rates: sources and confidence in `src/data/`.

## Roadmap
The execution plan for everything below — phased, sized per session, with prerequisites, model
extensions, golden-value gates and a kickoff prompt — is [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Not modelled (deferred)
Installment sale, GRAT, SLAT, state estate/inheritance tax, Table 2010CM / §7520 products, UHNW
mortality adjustment, Monte Carlo, promissory-note swap consideration, DSUE/GST tracking,
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
