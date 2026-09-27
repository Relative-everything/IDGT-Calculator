# Intent: ING trust versus IDGT — comparison module
Author: Jared (builder), captured by Claude. Date: 2026-09-27. Status: draft (autonomous session; see plan.md "Acceptance").

## Problem
The calculator ranks assets for a gift to an IDGT but cannot say whether an IDGT is the right vehicle at
all for a given asset. The standard alternative for a grantor whose objective is income-tax location
rather than estate-tax exclusion is the ING (incomplete non-grantor trust — NING/DING/WING): no gift, no
exclusion consumed, no tax burn, the trust pays its own income tax in a state that levies none, the
property stays in the estate and is stepped up at death. The two vehicles trade different things and
practitioners argue about them with rules of thumb. The builder asked for a module that (1) determines
when an ING is superior to an IDGT for an asset on the same probability-weighted heir-wealth ledger, and
(2) quantifies how much of the IDGT's income-tax burn the grantor must actually bear for the IDGT to
break even with the ING — the burn being the IDGT's main weapon and the thing a grantor with limited
liquidity is most tempted to "manage" away through a reimbursement clause.

## Proposed outcome
For every asset the ranking shows the ING's NPV next to the IDGT's and a verdict. For the selected asset
a comparison card shows: the ING's NPV with an exact decomposition (state-rate saving, compounding
location, administration cost, step-up), the difference against the IDGT at its optimal swap year and
with no swap, a bridge chart from the IDGT's five components to the ING's, a per-death-year crossover
chart, three breakevens (share of burn the grantor must bear; the grantor's state income-tax rate; the
size of the other estate) and a breakeven grid of state rate × burn share with the frontier drawn
through it. An IDGT input for the share of the trust's income tax the grantor bears (the rest
reimbursed by the trustee) extends the v1 ledger and the v1 decomposition stays exact. Every new input
moves an output and is tested; every rule cites its authority; what is not modelled is listed.

## Affected users and systems
UHNW estate-planning advisors using the GitHub Pages deployment. Touches `src/engine/` (one new module,
one new solver module, a parameterised extension of `idgtModel.js`), `src/hooks/` (input mapping,
a second hook for the selected-asset breakevens), `src/components/` (one input card, one results card,
three charts, a third ledger view), tests, docs, README, `src/CLAUDE.md`.

## Constraints
- Repo governance (`src/CLAUDE.md`): engine pure and cited; data static; components format only; hooks
  wire state; no localStorage; no stubs; no fabricated reference data.
- v1 golden fixtures A–H must reproduce bit for bit with the new burn-share input at its default.
- Golden values for the new module are hand-derived in plain English and machine-checked against an
  independent reference script; per governance they are asserted only after builder confirmation —
  this session ran autonomously, so the new golden test is annotated "reference-derived; awaiting
  builder confirmation" exactly as v1's handback flag N4 did for nine values.
- No client data; fixtures use round synthetic numbers.
- Statutory basis as of 2026-09-27; every figure carries a confidence level.

## Out of scope
Toggling grantor-trust status off in a chosen year (completed-gift non-grantor trust); later completion
of the ING gift; DNI distributions and throwback; state-by-state fiduciary residency rules (the rate is
an input); trust compressed brackets; IDGT trustee costs. Each is listed with its reason in the Deferred
panel.

## Open questions (answered by assumption in plan.md; overturn in review)
1. Is "share of burn borne by the grantor" the lever the builder means by "how well tax burn is
   managed", or is toggling grantor status off the intended lever? The module implements the share
   (a reimbursement clause is the common in-practice tool) and names the toggle as the deferred
   alternative.
2. Should the ING's federal rate default to the grantor's federal ordinary rate or to the statutory
   top rate (37%)? Implemented: 37% (trust brackets compress to the top rate almost immediately).
3. Should the breakeven on the grantor's state rate move the heirs' state rate too? Implemented: no
   (heirs' domicile is independent).
