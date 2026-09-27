# Handback: ING trust versus IDGT — comparison module
Branch: `claude/ing-trust-idgt-comparison-rzas5s`. Change: `docs/changes/2026-09-27-ing-comparison`. Tier: Full.
Status: complete except builder confirmation of the new golden values (flag B1).

## Summary
Asked: a module that determines when an ING (incomplete non-grantor trust) is superior to an IDGT, and how
well the IDGT's tax burn would have to be managed to break even. Done: the ING runs as a third world on the
v1 heir-wealth ledger with an exact decomposition; the IDGT gains a burn-share input (the share of the trust's
income tax the grantor actually bears, the rest reimbursed by the trustee); the selected asset gets a
comparison card with a bridge chart, a crossover chart, three breakevens (burn share, grantor state rate,
other-estate size) and a state-rate × burn-share grid; the ranking shows each asset's ING NPV and better
vehicle. The model contract went through an adversarial review (three lenses completed; see "Review") before
code, and the engine was cross-checked against an independent reference on 400 random scenarios.

**Headline result (defaults, SSA table, 65-year-old male):** in a taxable estate the IDGT wins at every burn
share — even if the trust pays all of its own tax — and at every grantor state rate up to 20%. Burn
management is not the lever that decides the choice; estate taxability is. The ING wins only below an
other-estate size of roughly $1–5M for the assets tested. See "What to watch for" for the numbers and the
assumption that drives the ING's "location" line.

## What changed
- **Burn share (IDGT).** The trust's holding path splits from the kept asset's path when the trustee
  reimburses part of the tax. At 100% every v1 ledger row is bit-identical to the pre-change engine (snapshot
  test over 249 rows), so the v1 goldens and the ranking are unchanged at defaults. At 0% the "tax burn"
  component is exactly zero.
- **ING world.** No gift, no exclusion used; the trust pays its own income tax (federal top rates + NIIT +
  the state rate it bears) and trustee cost; a fee beyond the after-tax yield is funded by selling a slice
  with pro-rata basis; the whole trust is included in the estate and stepped up. A switch covers New York
  and California grantors, who are taxed on the ING's income personally.
- **Exact decomposition of the ING result:** location (tax paid from the trust instead of the estate — not
  a tax benefit), state-rate saving net of estate tax, administration cost, step-up. They sum to the NPV in
  every year.
- **Breakevens** re-run the full swap search at each trial; the solver scans, bisects the first sign
  change, and reports the number of crossings and which side the ING wins on. Readings are composed from
  the signs (the burn-share direction reverses in a non-taxable estate that out-compounds the asset).
- **Grid:** 6 burn shares × 8 state rates plus the user's own rate inserted; the user's cell equals the
  headline exactly; the frontier between "ING wins" and "IDGT wins" is drawn.
- **Ledger:** a third "ING trust" view. **Ranking:** "NPV · ING" and "Better vehicle" columns; the CSV
  gains eight ING columns. **Scenario JSON:** six new settings fields; old files load with the defaults.
- **One v1 attribution fix:** after a swap with "include at discounted value at death" on, the discount
  haircut on the consideration was booked in "tax burn"; it is now in "residual", where v1's own contract
  put it. Their sum and every NPV are unchanged; no golden value moved.

## What to watch for
Representative results (SSA table, male 65, 13.3% grantor state rate unless noted, ING in a no-tax situs,
other-estate growth 3% after tax):

| Asset and estate | NPV · ING | NPV · IDGT best swap | Better | Burn share φ* | State σ* | Other estate E* |
|---|---|---|---|---|---|---|
| $1M growth stock, $20M estate, 5% state (UI default) | −$68K | $486K | IDGT | none (IDGT always) | none (IDGT always) | $1.07M |
| $5M pre-sale business, basis 0, sale yr 2, $12M estate | −$243K | $2,118K | IDGT | none (IDGT always) | none (IDGT always) | $5.25M |
| same, $3M estate (not taxable) | −$222K | −$886K | ING | ING always | 4.8% | $5.25M |

- **Location drives the ING's sign.** In the pre-sale case the ING's state saving is +$852K but location is
  −$1,095K: the default assumes the rest of the estate earns 3% after tax while the reinvested proceeds earn
  about 6.8%, so every dollar of tax the trust pays costs more than the same dollar paid from the estate.
  At 6.5% estate growth location is ≈ $0 and the ING is +$906K — still far below the IDGT. Set the
  other-estate growth to what the family's other assets really earn before reading the ING line.
- **The IDGT benchmark inherits a v1 convention.** Its best swap year usually turns the trust into a cash
  IDGT whose consideration yields r_E ÷ (1 − τ_ord) gross, taxed to the grantor. At 3% and 45.8% that is a
  plausible 5.5%; at 6.5% and 54.1% it is an implausible 14.2%, and the IDGT's NPV balloons ($11.1M in the
  $30M-estate pre-sale case). The card also shows ING vs the no-swap IDGT; customise the consideration
  profile (Model settings) when the other-estate rate is high.
- **Where the burn-share breakeven exists.** It needs an estate near the exclusion and a short horizon: with
  a deterministic death in year 5, the pre-sale business with a $12M estate breaks even at φ* ≈ 15% (the
  IDGT wins only while the grantor bears at least 15% of the burn). Under the life table the same case has no
  root. Expect "IDGT wins at any burn share" for most taxable clients.
- Hand checks: burn share 100% must reproduce every number of the previous build. Burn share 0% must show a
  "tax burn" component of $0 in the IDGT decomposition. ING state rate equal to the grantor's state rate
  must show a state-rate saving of $0 (and the "no state saving" warning). The NY/CA switch must do the same.
- The comparison assumes an ING that makes no distributions and bears only the state rate you enter. A 0%
  rate is correct only for portfolio income and gains in a no-tax situs; the card says so whenever it is 0%.

## How to read the result
- Echoed inputs (H): the trust rate stacks, the burn share, the fee.
- Computed under the contract (exact consequences of inputs and conventions N-1…N-8): the ING NPV and its
  four parts, the difference to the IDGT, the bridge, the per-year crossover, the breakevens and the grid.
- Estimates with stated confidence: everything probability-weighted still rests on the unverified SSA table
  (v1 flag N1); the trust bracket figure (2025 proxy), the PLR numbers, the no-rule status and the state
  statute citations are M and are labelled so in the Methodology panel.
- Be skeptical of: an ING verdict that rests on the location line (it is a return-spread assumption, not
  tax); an IDGT NPV that rests on a swap in year 1 with a high other-estate rate; breakevens flagged with
  more than one crossing.

## Verification output
`npx vitest run` — Test Files 9 passed (9); Tests 214 passed | 1 skipped (215). The skipped test is v1's
mortality checksum (gated on `MORTALITY_TABLE_META.verified`). New: `ingGolden` 16, `ingInvariants` 79
(incl. 41 bit-identity snapshot cases), `breakeven` 11, wiring +9, scenario IO +2.
`npx eslint .` — 0 problems. `npx vite build` — ✓ built; CSS 24.26 kB, JS 315.27 kB (gzip 100.23 kB).
Engine vs independent reference (`reference/xcheck.mjs`): 400 seeded scenarios, 511,575 values (every IDGT
row field at a random burn share and three swap years, every ING row field), 0 mismatches, worst relative
difference 2.0e-14. The run exposed two defects in the reference harness, not the engine (a null
swap-basis default and a display field that omitted a sale year's gain tax); fixed, no golden moved.
Playwright (Chromium, production preview): 1280 px light and dark, 375 px — console errors 0, no
horizontal page scroll at any width. Screenshots in `screenshots/`: the comparison card (light, dark,
375 px), a mixed-verdict case with the grid frontier drawn (`ing-card-frontier.png`: business interest,
$4M other estate — ING better by $183K, state-rate breakeven 2.10%), the input card, the ranking, both
chart elements, and full pages.
Timing (breakevens + grid, selected asset): 0.16 s at age 65, 0.42 s at age 45, 0.77 s for a 120-year
deterministic horizon; computed after paint, debounced 250 ms.

## Review
The contract (model.md) was attacked by five lenses before code; three completed (tax law, decomposition
math, architecture) and returned 24 findings; the two others (solver robustness, planner usefulness) and the
skeptic verification stage did not run — the session hit its usage limit. Every finding was then checked by
hand before it was applied — the math and architecture items against the code and reference runs (Fixtures
I5, I6, J3 and the V^same negative control exist for this), the tax-law items against the statute and ruling
text as I know it (confidence as the reviewer marked it). All 24 were accepted, one with a departure
(the proposed "0% state rate" warning became a permanent input hint plus a card line, because a warning
would fire on every default asset). The list is in plan.md "Design-review corrections".

## Flags
### Blocking
None.

### Non-blocking
- **B1 — New golden values not builder-confirmed.** Fixtures I and J (plan.md, derivation in plain English)
  are asserted in `ingGolden.test.js` under the annotation "reference-derived; awaiting builder
  confirmation". Confirm each row of plan.md "Golden values" or correct it, then remove the annotation.
- **B2 — Premise.** The request framed tax-burn management as the path to breakeven. The ledger shows the
  burn is one of the IDGT's advantages, and in a taxable estate even removing it entirely does not let the
  ING win; the freeze dominates. "Managing the burn" matters for the grantor's own liquidity, which the
  heir-wealth metric does not value. If the question is really about the grantor's cash flow, the expert
  alternative is toggling grantor-trust status off in a chosen year (completed-gift non-grantor trust) —
  deferred (ROADMAP N.1) with its reasoning.
- **B3 — Location and the cash-IDGT convention** move the comparison more than any ING input (see above).
- **B4 — Two review lenses and the skeptic stage did not run** (usage limit). Their scope was covered in
  part by the engine-vs-reference cross-check (solver behaviour, numerical identities) and by the breakeven
  tests (verdict flips across each root); planner usefulness is addressed by B2 and B3.
- **B6 — UI built by a delegated agent and reviewed.** The comparison card and its three charts were
  written by a sub-agent from a written spec and then reviewed here; two changes were made on review
  (the crossover shading now uses the engine's lead years, and "How to read" names the location effect).
  Its deviations from the spec are accepted: ink text on every grid step (white failed 3:1 in light mode),
  engine constants imported for the reason codes and the 20% bound, and a few legend additions.
- **B5 — Performance.** Breakevens and grid take ≈ 0.16 s at age 65, ≈ 0.4 s at age 45 and ≈ 0.8 s in the
  120-year worst case; they run after paint, debounced, for the selected asset only.

## Next session should
1. Confirm or correct Fixtures I and J (plan.md) and remove the annotation in `ingGolden.test.js`.
2. Decide whether the other-estate growth default (3% after tax) should be revisited now that the ING's
   location line depends on it, and whether the v1 cash-like consideration needs a yield cap.
3. ROADMAP N.1 (toggle-off year) if the builder's question is really about the grantor's liquidity.
