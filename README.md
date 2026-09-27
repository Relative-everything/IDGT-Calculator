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

## Inputs that matter most
Grantor age/sex (or an assumed death year), other estate and its after-tax growth, basic exclusion
and indexing, prior taxable gifts **and the year they were made**, tax-rate stacks (grantor ordinary
and capital-gain; heirs' capital-gain incl. NIIT), per asset: FMV, basis, appreciation, yield,
valuation discount, annual exclusions, a scheduled sale year with post-sale returns. Model settings
expose the conventions (return-neutral reinvestment, cash-like consideration, discount-at-death
inclusion, whether a scheduled sale also happens when the asset is kept).

## Verification status
- Engine: golden fixtures A–H (hand-derived, builder-confirmed 2026-09-26), §2001(c) cross-check
  against the bracket schedule, model invariants (decomposition sums, Σq = 1, neutrality, swap
  properties), input-wiring test — `npm test`.
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
multi-asset joint optimisation, PDF/Excel export. Reasons are shown in-app under "Not modelled in
this version".

## Development
```
npm ci
npm run dev        # Vite dev server
npm test           # vitest
npm run lint       # eslint
npm run build      # production build to dist/
```
Deploy: every push runs lint, tests and the build ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml));
a push to `main` also publishes `dist/` to GitHub Pages. Requires Settings → Pages → Source:
**GitHub Actions**; skip the workflow templates that page suggests, since this workflow already
publishes the site and a template would publish the unbuilt repository root. Redeploy by hand:
Actions → Build and deploy → Run workflow on `main`.

Stack: React 19, Vite 8, Tailwind CSS 4, Vitest. No server, no localStorage; scenarios move as JSON
files and the ranking exports as CSV.

Layout: `src/engine/` pure calculation (cites its authorities inline) · `src/data/` static tables
with provenance · `src/hooks/` state → engine · `src/components/` UI only.
